import { Injectable, computed, inject, signal } from '@angular/core';
import { DbClient } from './db-client.service';
import { ShardLoader } from './shard-loader.service';
import { DbDicts, DbManifest, DbSummary, DetailListing } from '../models/db.models';
import {
  computeAdherence,
  ExplorerListing,
  Priorities,
  SortKey,
  SOURCE_LABELS,
  sortListings,
  TIERS,
} from '../models/explorer-listing.model';
import { PersistenceService } from './persistence.service';
import { normalizeText } from '../utils/cost.util';
import {
  buildNeighbourhoodMedianHousingPpm,
  getHousingPerSqm,
  neighbourhoodKey,
} from '../utils/neighbourhood-ppm.util';

const DEFAULT_PRIORITIES: Priorities = {
  apartment: true,
  sacada: true,
  sun: true,
  pets: false,
  parking: false,
};

@Injectable({ providedIn: 'root' })
export class ExplorerState {
  private readonly client = inject(DbClient);
  private readonly shards = inject(ShardLoader);
  private readonly persistence = inject(PersistenceService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusError = signal(false);
  readonly manifest = signal<DbManifest | null>(null);
  readonly summary = signal<DbSummary | null>(null);
  readonly dicts = signal<DbDicts | null>(null);
  readonly enriched = signal<ExplorerListing[]>([]);

  readonly preset = signal<'focus' | 'relaxed' | 'custom'>('focus');
  readonly selectedTier = signal('');
  readonly selectedNeighbourhoods = signal<Set<string>>(new Set());
  readonly neighbourhoodSearch = signal('');
  readonly selectedSources = signal<Set<string>>(new Set());
  readonly priorities = signal<Priorities>({ ...DEFAULT_PRIORITIES });
  readonly sortKey = signal<SortKey>('fit-desc');
  readonly view = signal<'cards' | 'compact'>('cards');
  readonly pinned = signal<Set<string>>(new Set());
  readonly favoriteIds = signal<string[]>(this.persistence.loadFavoriteIds());
  readonly resultsView = signal<'all' | 'favorites'>('all');
  readonly costBounds = signal<{ min: number; max: number }>({ min: 1500, max: 5000 });
  readonly minTotalCost = signal(1500);
  readonly maxTotalCost = signal(5000);
  readonly photoIndexById = signal<Map<string, number>>(new Map());
  readonly galleryExpandedById = signal<Map<string, boolean>>(new Map());
  readonly cardDataExpandedById = signal<Map<string, boolean>>(new Map());
  readonly sidebarCollapsed = signal(this.readSidebarCollapsed());

  readonly filtered = computed(() => {
    let items = this.enriched();
    const tier = this.selectedTier();
    const neighbourhoods = this.selectedNeighbourhoods();
    const sources = this.selectedSources();
    const minCost = this.minTotalCost();
    const maxCost = this.maxTotalCost();

    if (tier) items = items.filter((item) => item.tier === tier);
    if (neighbourhoods.size) {
      items = items.filter((item) => neighbourhoods.has(item.neighbourhood || 'Sem bairro'));
    }
    if (sources.size) items = items.filter((item) => sources.has(item.source));
    items = items.filter((item) => item.totalCost >= minCost && item.totalCost <= maxCost);

    const scored = items.map((item) => computeAdherence(item, this.priorities()));
    return sortListings(scored, this.sortKey());
  });

  readonly costRangeActive = computed(() => {
    const bounds = this.costBounds();
    return this.minTotalCost() > bounds.min || this.maxTotalCost() < bounds.max;
  });

  readonly compareCount = computed(() => this.pinned().size);
  readonly compareEnabled = computed(() => this.pinned().size >= 2);

  readonly favoriteListings = computed(() => {
    const byId = new Map(this.enriched().map((item) => [item.id, item]));
    return this.favoriteIds()
      .map((id) => byId.get(id))
      .filter((item): item is ExplorerListing => Boolean(item));
  });

  readonly favoriteCount = computed(() => this.favoriteListings().length);

  readonly displayedListings = computed(() => (
    this.resultsView() === 'favorites' ? this.favoriteListings() : this.filtered()
  ));

  readonly neighbourhoodMedianHousingPpmByKey = computed(() => (
    buildNeighbourhoodMedianHousingPpm(this.enriched())
  ));

  getNeighbourhoodMedianHousingPpm(neighbourhood?: string | null): number | null {
    const key = neighbourhoodKey(neighbourhood);
    return this.neighbourhoodMedianHousingPpmByKey()[key] ?? null;
  }

  getListingHousingPerSqm(item: ExplorerListing): number | null {
    return getHousingPerSqm(item);
  }

  async bootstrap(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const manifest = await this.client.loadManifest(true);
      const [summary, dicts] = await Promise.all([
        this.client.loadSummary(manifest.buildHash),
        this.client.loadDicts(manifest.buildHash),
      ]);
      this.manifest.set(manifest);
      this.summary.set(summary);
      this.dicts.set(dicts);

      const listings = await this.loadAllDetails(manifest, dicts);
      this.enriched.set(listings);
      this.initCostRange(manifest, listings);
      this.restoreNeighbourhoodSelection();
      this.applyPreset('focus');
      this.setStatus('');
    } catch (err) {
      this.error.set(String((err as Error)?.message || err));
      this.setStatus(String((err as Error)?.message || err), true);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAllDetails(manifest: DbManifest, dicts: DbDicts): Promise<ExplorerListing[]> {
    const batches = await Promise.all(
      manifest.shards.detail.files.map((file) => this.client.loadDetailShard(manifest.buildHash, file)),
    );
    const listings: ExplorerListing[] = [];
    for (const batch of batches) {
      for (const raw of batch) {
        listings.push(this.toExplorerListing(raw, dicts));
      }
    }
    listings.sort((a, b) => a.totalCost - b.totalCost);
    return listings;
  }

  private toExplorerListing(detail: DetailListing, dicts: DbDicts): ExplorerListing {
    const source = detail.id.split(':')[0] || 'unknown';
    const photoUrls = (detail.photoUrls || [])
      .map((enc) => this.shards.decodePhoto(enc, dicts))
      .filter((url): url is string => Boolean(url));
    const tier = detail.tier as keyof typeof TIERS;

    return {
      ...detail,
      source,
      sourceLabel: detail.sourceLabel || SOURCE_LABELS[source] || source,
      photoUrls,
      photoUrl: photoUrls[0] || null,
      centralityScore: TIERS[tier]?.score ?? 20,
      city: 'Porto Alegre',
      isFurnished: false,
      amenities: detail.amenities || [],
      installations: detail.installations || [],
      adherenceScore: detail.fitScore,
      matchedCount: 0,
      activeCount: 0,
      matchesAllPriorities: false,
    };
  }

  buildStatusMessage(manifest = this.manifest()): string {
    if (!manifest) return 'Carregando catálogo...';
    const sources = manifest.sources.map((s) => s.label).join(', ');
    const date = new Date(manifest.collectedAt).toLocaleString('pt-BR');
    return `${manifest.count} imóveis · ${sources} · coletado ${date}`;
  }

  setStatus(message: string, isError = false): void {
    this.statusMessage.set(message);
    this.statusError.set(isError);
    this.error.set(isError ? message : null);
  }

  readonly statusMessage = signal('Carregando catálogo...');

  applyPreset(name: 'focus' | 'relaxed'): void {
    this.preset.set(name);
    if (name === 'focus') {
      this.priorities.set({ apartment: true, sacada: true, sun: true, pets: false, parking: false });
    } else {
      this.priorities.set({ apartment: true, sacada: true, sun: false, pets: false, parking: false });
    }
    this.sortKey.set('fit-desc');
    this.selectedTier.set('');
  }

  markCustomPreset(): void {
    this.preset.set('custom');
  }

  private initCostRange(manifest: DbManifest, listings: ExplorerListing[]): void {
    const costs = listings.map((item) => item.totalCost).filter((value) => value > 0);
    const dataMin = costs.length ? Math.min(...costs) : manifest.filter.minTotalCost;
    const dataMax = costs.length ? Math.max(...costs) : manifest.filter.maxTotalCost;
    const min = Math.min(manifest.filter.minTotalCost, dataMin);
    const max = Math.max(manifest.filter.maxTotalCost, dataMax);
    const bounds = { min: Math.floor(min / 50) * 50, max: Math.ceil(max / 50) * 50 };
    this.costBounds.set(bounds);
    this.minTotalCost.set(bounds.min);
    this.maxTotalCost.set(bounds.max);
  }

  setMinTotalCost(value: number | string): void {
    const bounds = this.costBounds();
    const parsed = typeof value === 'string' ? Number(value) : value;
    const next = Math.min(Math.max(parsed, bounds.min), this.maxTotalCost());
    this.minTotalCost.set(next);
    this.markCustomPreset();
  }

  setMaxTotalCost(value: number | string): void {
    const bounds = this.costBounds();
    const parsed = typeof value === 'string' ? Number(value) : value;
    const next = Math.max(Math.min(parsed, bounds.max), this.minTotalCost());
    this.maxTotalCost.set(next);
    this.markCustomPreset();
  }

  resetCostRange(): void {
    const bounds = this.costBounds();
    this.minTotalCost.set(bounds.min);
    this.maxTotalCost.set(bounds.max);
    this.markCustomPreset();
  }

  toggleTier(tier: string): void {
    this.selectedTier.set(this.selectedTier() === tier ? '' : tier);
    this.markCustomPreset();
  }

  toggleSource(sourceId: string): void {
    const next = new Set(this.selectedSources());
    if (next.has(sourceId)) next.delete(sourceId);
    else next.add(sourceId);
    this.selectedSources.set(next);
    this.markCustomPreset();
  }

  toggleNeighbourhood(name: string): void {
    const next = new Set(this.selectedNeighbourhoods());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.selectedNeighbourhoods.set(next);
    this.persistNeighbourhoodSelection();
    this.markCustomPreset();
  }

  clearNeighbourhoods(): void {
    this.selectedNeighbourhoods.set(new Set());
    this.persistNeighbourhoodSelection();
    this.markCustomPreset();
  }

  selectCentralNeighbourhoods(): void {
    const next = new Set<string>();
    for (const item of this.enriched()) {
      if (['core', 'near', 'mid'].includes(item.tier)) {
        next.add(item.neighbourhood || 'Sem bairro');
      }
    }
    this.selectedNeighbourhoods.set(next);
    this.persistNeighbourhoodSelection();
    this.markCustomPreset();
  }

  persistNeighbourhoodSelection(): void {
    const names = [...this.selectedNeighbourhoods()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    this.persistence.saveNeighbourhoodNames(names);
    const url = new URL(window.location.href);
    url.searchParams.delete('bairro');
    for (const name of names) url.searchParams.append('bairro', name);
    history.replaceState({ bairros: names }, '', url.toString());
  }

  restoreNeighbourhoodSelection(): void {
    const urlNames = new URLSearchParams(window.location.search).getAll('bairro');
    const sessionNames = this.persistence.loadNeighbourhoodNames();
    const names = urlNames.length ? urlNames : sessionNames;
    const valid = new Set(this.enriched().map((item) => item.neighbourhood || 'Sem bairro'));
    const next = new Set(names.filter((name) => valid.has(name)));
    this.selectedNeighbourhoods.set(next);
  }

  togglePin(id: string): boolean {
    const next = new Set(this.pinned());
    if (next.has(id)) next.delete(id);
    else if (next.size >= 3) {
      this.setStatus('Máximo de 3 imóveis para comparar.', true);
      return false;
    } else next.add(id);
    this.pinned.set(next);
    return true;
  }

  clearPins(): void {
    this.pinned.set(new Set());
  }

  isFavorite(id: string): boolean {
    return this.favoriteIds().includes(id);
  }

  toggleFavorite(id: string): boolean {
    const current = this.favoriteIds();
    if (current.includes(id)) {
      const next = current.filter((entry) => entry !== id);
      this.favoriteIds.set(next);
      this.persistence.saveFavoriteIds(next);
      if (!next.length && this.resultsView() === 'favorites') {
        this.resultsView.set('all');
      }
      return false;
    }
    const next = [id, ...current];
    this.favoriteIds.set(next);
    this.persistence.saveFavoriteIds(next);
    return true;
  }

  clearFavorites(): void {
    this.favoriteIds.set([]);
    this.persistence.saveFavoriteIds([]);
    if (this.resultsView() === 'favorites') {
      this.resultsView.set('all');
    }
  }

  setResultsView(view: 'all' | 'favorites'): void {
    if (view === 'favorites' && !this.favoriteCount()) return;
    this.resultsView.set(view);
  }

  getPhotoIndex(id: string): number {
    return this.photoIndexById().get(id) || 0;
  }

  setPhotoIndex(id: string, index: number): void {
    const next = new Map(this.photoIndexById());
    next.set(id, index);
    this.photoIndexById.set(next);
  }

  isGalleryExpanded(id: string): boolean {
    return this.galleryExpandedById().get(id) === true;
  }

  setGalleryExpanded(id: string, expanded: boolean): void {
    const next = new Map(this.galleryExpandedById());
    if (expanded) next.set(id, true);
    else next.delete(id);
    this.galleryExpandedById.set(next);
  }

  isCardDataExpanded(id: string): boolean {
    return this.cardDataExpandedById().get(id) !== false;
  }

  setCardDataExpanded(id: string, expanded: boolean): void {
    const next = new Map(this.cardDataExpandedById());
    if (expanded) next.delete(id);
    else next.set(id, false);
    this.cardDataExpandedById.set(next);
  }

  expandAllCardData(): void {
    this.cardDataExpandedById.set(new Map());
  }

  collapseAllCardData(): void {
    const next = new Map<string, boolean>();
    for (const item of this.filtered()) {
      next.set(item.id, false);
    }
    this.cardDataExpandedById.set(next);
  }

  neighbourhoodOptions() {
    const counts: Record<string, number> = {};
    for (const item of this.enriched()) {
      const name = item.neighbourhood || 'Sem bairro';
      counts[name] = (counts[name] || 0) + 1;
    }
    const tierOrder = { core: 0, near: 1, mid: 2, outer: 3 } as Record<string, number>;
    const query = normalizeText(this.neighbourhoodSearch());
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, tier: this.enriched().find((i) => (i.neighbourhood || 'Sem bairro') === name)?.tier || 'outer' }))
      .filter((option) => !query || normalizeText(option.name).includes(query))
      .sort((a, b) => {
        const tierDiff = (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
        if (tierDiff !== 0) return tierDiff;
        return b.count - a.count || a.name.localeCompare(b.name, 'pt-BR');
      });
  }

  tierCounts(): Record<string, number> {
    const counts: Record<string, number> = { core: 0, near: 0, mid: 0, outer: 0 };
    for (const item of this.enriched()) counts[item.tier] = (counts[item.tier] || 0) + 1;
    return counts;
  }

  sourceOptions() {
    const manifest = this.manifest();
    if (manifest?.sources?.length) return manifest.sources;
    const map = new Map<string, string>();
    for (const item of this.enriched()) map.set(item.source, item.sourceLabel);
    return [...map.entries()].map(([id, label]) => ({ id, label, count: 0 }));
  }

  async reload(): Promise<void> {
    this.shards.clear();
    await this.bootstrap();
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    localStorage.setItem('imoveis-explorer:sidebar-collapsed', JSON.stringify(next));
  }

  private readSidebarCollapsed(): boolean {
    try {
      const raw = localStorage.getItem('imoveis-explorer:sidebar-collapsed');
      return raw ? JSON.parse(raw) === true : false;
    } catch {
      return false;
    }
  }
}
