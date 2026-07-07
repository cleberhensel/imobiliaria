import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DbColumns,
  DbDicts,
  DbManifest,
  DbSummary,
  Priorities,
  SortKey,
} from '../models/db.models';
import { DbClient } from './db-client.service';
import { QueryEngine, QueryFilters } from './query-engine';
import { ShardLoader } from './shard-loader.service';

const DEFAULT_PRIORITIES: Priorities = {
  apartment: true,
  sacada: true,
  sun: true,
  pets: false,
  parking: false,
};

@Injectable({ providedIn: 'root' })
export class DbStore {
  private readonly client = inject(DbClient);
  private readonly shardLoader = inject(ShardLoader);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly manifest = signal<DbManifest | null>(null);
  readonly summary = signal<DbSummary | null>(null);
  readonly dicts = signal<DbDicts | null>(null);
  readonly columns = signal<DbColumns | null>(null);
  readonly searchTexts = signal<string[] | null>(null);
  readonly searchLoaded = signal(false);

  readonly preset = signal<'focus' | 'relaxed' | 'custom'>('focus');
  readonly selectedTier = signal('');
  readonly neighbourhoodIds = signal<Set<number>>(new Set());
  readonly sourceIds = signal<Set<number>>(new Set());
  readonly typeIds = signal<Set<number>>(new Set());
  readonly minBedrooms = signal(0);
  readonly furnished = signal<'' | 'yes' | 'no'>('');
  readonly pets = signal<'' | 'yes' | 'no'>('');
  readonly searchQuery = signal('');
  readonly priorities = signal<Priorities>({ ...DEFAULT_PRIORITIES });
  readonly sortKey = signal<SortKey>('fit-desc');
  readonly viewMode = signal<'cards' | 'compact'>('cards');
  readonly pinned = signal<Set<string>>(new Set());
  readonly page = signal(0);
  readonly pageSize = signal(24);

  readonly queryEngine = computed(() => {
    const cols = this.columns();
    const dicts = this.dicts();
    if (!cols || !dicts) return null;
    return new QueryEngine(cols, dicts, this.searchTexts());
  });

  readonly filters = computed<QueryFilters>(() => ({
    selectedTier: this.selectedTier(),
    neighbourhoodIds: this.neighbourhoodIds(),
    sourceIds: this.sourceIds(),
    typeIds: this.typeIds(),
    minBedrooms: this.minBedrooms(),
    furnished: this.furnished(),
    pets: this.pets(),
    searchText: this.normalizeSearch(this.searchQuery()),
    searchOrdinals: null,
  }));

  readonly filteredOrdinals = computed(() => {
    const engine = this.queryEngine();
    if (!engine) return [];
    const ordinals = engine.filter(this.filters());
    const scored = engine.scoreOrdinals(ordinals, this.priorities());
    return engine.sort(scored, this.sortKey());
  });

  readonly visibleOrdinals = computed(() => {
    const all = this.filteredOrdinals();
    const start = this.page() * this.pageSize();
    return all.slice(start, start + this.pageSize());
  });

  async bootstrap(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const manifest = await this.client.loadManifest(true);
      const [summary, dicts, columns] = await Promise.all([
        this.client.loadSummary(manifest.buildHash),
        this.client.loadDicts(manifest.buildHash),
        this.client.loadColumns(manifest.buildHash),
      ]);
      this.manifest.set(manifest);
      this.summary.set(summary);
      this.dicts.set(dicts);
      this.columns.set(columns);
      this.applyPreset('focus');
    } catch (err) {
      this.error.set(String((err as Error)?.message || err));
    } finally {
      this.loading.set(false);
    }
  }

  async ensureSearchLoaded(): Promise<void> {
    if (this.searchLoaded()) return;
    const manifest = this.manifest();
    if (!manifest) return;
    const texts = await this.client.loadSearch(manifest.buildHash);
    this.searchTexts.set(texts);
    this.searchLoaded.set(true);
  }

  async loadLiteForVisible(): Promise<Map<number, unknown>> {
    const manifest = this.manifest();
    const ordinals = this.visibleOrdinals().map((item) => item.ordinal);
    if (!manifest || !ordinals.length) return new Map();

    return this.shardLoader.loadLiteOrdinals(
      manifest.buildHash,
      manifest.shards.lite.size,
      ordinals,
      (file) => this.client.loadLiteShard(manifest.buildHash, file),
      manifest.shards.lite.files,
    );
  }

  async loadDetail(ordinal: number): Promise<unknown | null> {
    const manifest = this.manifest();
    if (!manifest) return null;
    return this.shardLoader.loadDetailOrdinal(
      manifest.buildHash,
      manifest.shards.detail.size,
      ordinal,
      (file) => this.client.loadDetailShard(manifest.buildHash, file),
      manifest.shards.detail.files,
    );
  }

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

  markCustom(): void {
    this.preset.set('custom');
  }

  toggleNeighbourhood(id: number): void {
    const next = new Set(this.neighbourhoodIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.neighbourhoodIds.set(next);
    this.markCustom();
    this.page.set(0);
  }

  toggleSource(id: number): void {
    const next = new Set(this.sourceIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.sourceIds.set(next);
    this.markCustom();
    this.page.set(0);
  }

  togglePin(id: string): void {
    const next = new Set(this.pinned());
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    this.pinned.set(next);
  }

  normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
}
