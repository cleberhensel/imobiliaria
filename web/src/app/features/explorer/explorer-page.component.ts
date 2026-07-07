import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExplorerState } from '../../core/data/explorer-state.service';
import {
  ExplorerListing,
  Priorities,
  SortKey,
  TIERS,
} from '../../core/models/explorer-listing.model';
import {
  average,
  formatBrl,
  formatLogradouro,
  getCostLines,
  getPpmTier,
  ppmTierClass,
} from '../../core/utils/cost.util';
import { getHousingPerSqm } from '../../core/utils/neighbourhood-ppm.util';
import { ListingCardComponent } from './listing-card.component';

@Component({
  selector: 'app-explorer-page',
  imports: [FormsModule, ListingCardComponent],
  templateUrl: './explorer-page.component.html',
})
export class ExplorerPageComponent implements OnInit {
  readonly state = inject(ExplorerState);
  readonly TIERS = TIERS;

  @ViewChild('detailDialog') detailDialog?: ElementRef<HTMLDialogElement>;

  readonly detailItem = signal<ExplorerListing | null>(null);

  readonly tierEntries = Object.entries(TIERS) as [keyof typeof TIERS, (typeof TIERS)[keyof typeof TIERS]][];

  readonly resultsTitle = computed(() => `${this.state.filtered().length} imóveis no recorte`);

  readonly funnelSteps = computed(() => {
    const all = this.state.enriched();
    const filtered = this.state.filtered();
    const steps: [string, number][] = [
      ['Catálogo', all.length],
      ['Apartamentos', all.filter((item) => item.isApartment).length],
      ['Centrais', all.filter((item) => ['core', 'near', 'mid'].includes(item.tier)).length],
      ['Com sacada', all.filter((item) => item.signals.sacada).length],
      ['Com sol', all.filter((item) => item.signals.sun).length],
      ['No recorte', filtered.length],
      ['Alta aderência', filtered.filter((item) => item.matchesAllPriorities).length],
    ];
    const max = steps[0][1] || 1;
    return steps.map(([label, count]) => ({ label, count, fill: (count / max).toFixed(3) }));
  });

  readonly resultsSubtitle = computed(() => {
    const filtered = this.state.filtered();
    if (!filtered.length) return 'Ajuste bairros, centralidade ou imobiliária.';
    const avg = average(filtered.map((item) => item.totalCost));
    const avgFit = average(filtered.map((item) => item.adherenceScore ?? item.fitScore));
    const high = filtered.filter((item) => item.matchesAllPriorities).length;
    return `Média total ${formatBrl(avg)} · aderência média ${Math.round(avgFit)}% · ${high} com match total · ${this.presetLabel()}`;
  });

  async ngOnInit(): Promise<void> {
    if (!this.state.enriched().length) await this.state.bootstrap();
  }

  presetLabel(): string {
    if (this.state.preset() === 'focus') return 'Foco: apto + sacada + sol';
    if (this.state.preset() === 'relaxed') return 'Ampliado: apto + sacada';
    return 'Personalizado';
  }

  tierLabel(tier: string): string {
    return TIERS[tier as keyof typeof TIERS]?.label || tier;
  }

  onPreset(name: 'focus' | 'relaxed'): void {
    this.state.applyPreset(name);
  }

  onToggleTier(tier: string): void {
    this.state.toggleTier(tier);
  }

  setPriority(key: keyof Priorities, value: boolean): void {
    this.state.priorities.update((current) => ({ ...current, [key]: value }));
    this.onPriorityChange();
  }

  onSortChange(value: SortKey): void {
    this.state.sortKey.set(value);
    this.state.markCustomPreset();
  }

  onPriorityChange(): void {
    this.state.markCustomPreset();
    this.state.sortKey.set('fit-desc');
  }

  detailPriorityMatches(item: ExplorerListing): { key: string; label: string; on: boolean }[] {
    const priorities = this.state.priorities();
    const labels: Record<string, string> = { apartment: 'Apto', sacada: 'Sacada', sun: 'Sol', pets: 'Pets', parking: 'Vaga' };
    return (Object.entries(priorities) as [keyof typeof priorities, boolean][])
      .filter(([, active]) => active)
      .map(([key]) => ({
        key,
        label: labels[key],
        on: key === 'apartment' ? item.isApartment
          : key === 'sacada' ? item.signals.sacada
          : key === 'sun' ? item.signals.sun
          : key === 'pets' ? item.acceptsPets
          : item.parkingSpots > 0,
      }));
  }

  openDetail(id: string): void {
    const item = this.state.enriched().find((entry) => entry.id === id);
    if (!item) return;
    this.detailItem.set(item);
    queueMicrotask(() => this.detailDialog?.nativeElement.showModal());
  }

  closeDetail(): void {
    this.detailDialog?.nativeElement.close();
    this.detailItem.set(null);
  }

  onDetailBackdropClick(event: MouseEvent): void {
    if (event.target === this.detailDialog?.nativeElement) {
      this.closeDetail();
    }
  }

  onDetailDialogClosed(): void {
    this.detailItem.set(null);
  }

  detailPhotos(item: ExplorerListing): string[] {
    return item.photoUrls?.length ? item.photoUrls : item.photoUrl ? [item.photoUrl] : [];
  }

  detailPhotoIndex(item: ExplorerListing): number {
    const photos = this.detailPhotos(item);
    const index = this.state.getPhotoIndex(item.id);
    return photos.length ? index % photos.length : 0;
  }

  detailPhotoNav(item: ExplorerListing, delta: number): void {
    const photos = this.detailPhotos(item);
    if (!photos.length) return;
    const current = this.state.getPhotoIndex(item.id);
    const next = ((current + delta) % photos.length + photos.length) % photos.length;
    this.state.setPhotoIndex(item.id, next);
  }

  detailSignals(item: ExplorerListing): string[] {
    return [
      ...item.signals.balconyTags,
      ...item.signals.sunTags,
      ...(item.signals.sacada && !item.signals.balconyTags.length ? ['sacada (título/descrição)'] : []),
      ...(item.signals.sun && !item.signals.sunTags.length ? ['sol (título/descrição)'] : []),
    ];
  }

  detailScoreClass(item: ExplorerListing): string {
    if (item.matchesAllPriorities) return 'high';
    if ((item.matchedCount || 0) > 0) return 'partial';
    return 'low';
  }

  costLines(item: ExplorerListing) {
    return getCostLines(item);
  }

  formatMoney(amount: number): string {
    return amount > 0 ? formatBrl(amount) : '—';
  }

  detailHousingPerSqm(item: ExplorerListing): number | null {
    return getHousingPerSqm(item);
  }

  detailNeighbourhoodMedianHousingPpm(item: ExplorerListing): number | null {
    return this.state.getNeighbourhoodMedianHousingPpm(item.neighbourhood);
  }

  detailPpmTierClass(item: ExplorerListing): string {
    return ppmTierClass(getPpmTier(
      this.detailHousingPerSqm(item),
      this.detailNeighbourhoodMedianHousingPpm(item),
    ));
  }

  logradouro(item: ExplorerListing): string {
    return formatLogradouro(item.street);
  }
}
