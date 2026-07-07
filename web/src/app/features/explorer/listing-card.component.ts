import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ExplorerListing } from '../../core/models/explorer-listing.model';
import { ExplorerState } from '../../core/data/explorer-state.service';
import { formatBrl, formatLogradouro, getCostLines, getPpmTier, ppmTierClass } from '../../core/utils/cost.util';
import { getHousingPerSqm } from '../../core/utils/neighbourhood-ppm.util';
import { normalizeListingTitle } from '../../core/utils/format.util';
import { inject } from '@angular/core';

@Component({
  selector: 'app-listing-card',
  imports: [],
  templateUrl: './listing-card.component.html',
})
export class ListingCardComponent {
  readonly state = inject(ExplorerState);

  @Input({ required: true }) item!: ExplorerListing;
  @Output() openDetail = new EventEmitter<string>();

  get score() { return this.item.adherenceScore ?? this.item.fitScore; }
  get galleryExpanded() { return this.state.isGalleryExpanded(this.item.id); }
  get cardDataExpanded() { return this.state.isCardDataExpanded(this.item.id); }

  get adherenceClass(): string {
    if (this.item.matchesAllPriorities) return 'adherence-high';
    if ((this.item.matchedCount || 0) > 0) return 'adherence-partial';
    return '';
  }

  get scoreClass(): string {
    if (this.item.matchesAllPriorities) return '';
    if ((this.item.matchedCount || 0) > 0) return 'partial';
    return 'low';
  }

  get photos(): string[] {
    return this.item.photoUrls?.length ? this.item.photoUrls : this.item.photoUrl ? [this.item.photoUrl] : [];
  }

  get photoIndex(): number {
    const photos = this.photos;
    const index = this.state.getPhotoIndex(this.item.id);
    return photos.length ? index % photos.length : 0;
  }

  get currentPhoto(): string | null {
    return this.photos[this.photoIndex] || null;
  }

  get hasNav(): boolean {
    return this.photos.length > 1;
  }

  priorityMatches(): { key: string; label: string; on: boolean }[] {
    const priorities = this.state.priorities();
    const labels: Record<string, string> = { apartment: 'Apto', sacada: 'Sacada', sun: 'Sol', pets: 'Pets', parking: 'Vaga' };
    return Object.entries(priorities)
      .filter(([, active]) => active)
      .map(([key]) => ({
        key,
        label: labels[key],
        on: this.matchesPriority(key),
      }));
  }

  matchesPriority(key: string): boolean {
    switch (key) {
      case 'apartment': return this.item.isApartment;
      case 'sacada': return this.item.signals.sacada;
      case 'sun': return this.item.signals.sun;
      case 'pets': return this.item.acceptsPets;
      case 'parking': return this.item.parkingSpots > 0;
      default: return false;
    }
  }

  costLines() {
    return getCostLines(this.item);
  }

  formatMoney(amount: number): string {
    return amount > 0 ? formatBrl(amount) : '—';
  }

  formatLogradouro(): string {
    return formatLogradouro(this.item.street);
  }

  displayTitle(): string {
    return normalizeListingTitle(this.item.title);
  }

  neighbourhoodMedianHousingPpm(): number | null {
    return this.state.getNeighbourhoodMedianHousingPpm(this.item.neighbourhood);
  }

  housingPerSqm(): number | null {
    return getHousingPerSqm(this.item);
  }

  neighbourhoodMedianHousingPpmLabel(): string {
    const median = this.neighbourhoodMedianHousingPpm();
    if (!median) return '';
    return `Mediana do bairro (alug.+cond.+IPTU, aptos): ${formatBrl(median)}/m²`;
  }

  ppmTierClass(): string {
    const benchmark = this.neighbourhoodMedianHousingPpm();
    return ppmTierClass(getPpmTier(this.housingPerSqm(), benchmark));
  }

  onPrev(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.navigatePhoto(-1);
  }

  onNext(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const current = this.state.getPhotoIndex(this.item.id);
    if (current === 0 && this.photos.length > 1) {
      this.state.setGalleryExpanded(this.item.id, true);
    }
    this.navigatePhoto(1);
  }

  onCollapseCardData(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.state.setCardDataExpanded(this.item.id, false);
  }

  onFooterExpand(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.galleryExpanded) {
      this.state.setGalleryExpanded(this.item.id, false);
    }
    this.state.setCardDataExpanded(this.item.id, true);
  }

  private navigatePhoto(delta: number): void {
    const photos = this.photos;
    if (!photos.length) return;
    const current = this.state.getPhotoIndex(this.item.id);
    const next = ((current + delta) % photos.length + photos.length) % photos.length;
    this.state.setPhotoIndex(this.item.id, next);
  }
}
