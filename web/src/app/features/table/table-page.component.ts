import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DbClient } from '../../core/data/db-client.service';
import { DbColumns, DbDicts, DbManifest, DbSummary, FLAG, LiteListing } from '../../core/models/db.models';
import { formatBrl } from '../../core/utils/cost.util';
import { normalizeText } from '../../core/utils/format.util';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

type TableSortKey =
  | 'totalCost-asc'
  | 'totalCost-desc'
  | 'pricePerSqm-asc'
  | 'pricePerSqm-desc'
  | 'area-desc';

interface TableRow {
  title: string;
  url: string;
  street: string;
  neighbourhood: string;
  totalCost: number;
  rentPrice: number;
  area: number | null;
  pricePerSqm: number | null;
  bedrooms: number;
  parkingSpots: number;
  sourceLabel: string;
  isFurnished: boolean;
  acceptsPets: boolean;
  condoIptu: number;
}

@Component({
  selector: 'app-table-page',
  imports: [FormsModule, RouterLink, BrlPipe],
  templateUrl: './table-page.component.html',
})
export class TablePageComponent implements OnInit {
  private readonly client = inject(DbClient);

  readonly loading = signal(true);
  readonly statusMessage = signal('Carregando catálogo...');
  readonly statusError = signal(false);
  readonly manifest = signal<DbManifest | null>(null);
  readonly summary = signal<DbSummary | null>(null);
  readonly dicts = signal<DbDicts | null>(null);
  readonly columns = signal<DbColumns | null>(null);
  readonly listings = signal<LiteListing[]>([]);

  readonly filterSource = signal<number | ''>('');
  readonly filterNeighbourhood = signal<number | ''>('');
  readonly filterType = signal<number | ''>('');
  readonly filterBedrooms = signal('');
  readonly filterFurnished = signal<'' | 'yes' | 'no'>('');
  readonly filterPets = signal<'' | 'yes' | 'no'>('');
  readonly filterSearch = signal('');
  readonly sortKey = signal<TableSortKey>('totalCost-asc');

  readonly filtered = computed(() => {
    const dicts = this.dicts();
    const columns = this.columns();
    const items = this.listings();
    if (!dicts || !columns) return [];

    const neighbourhood = this.filterNeighbourhood();
    const source = this.filterSource();
    const type = this.filterType();
    const bedrooms = this.filterBedrooms();
    const furnished = this.filterFurnished();
    const pets = this.filterPets();
    const search = normalizeText(this.filterSearch());

    return items.filter((item) => {
      if (neighbourhood !== '' && item.nb !== neighbourhood) return false;
      if (source !== '' && item.src !== source) return false;
      if (type !== '' && columns.typeId[item.o] !== type) return false;
      if (bedrooms && item.bd < Number(bedrooms)) return false;
      const isFurnished = (item.fl & FLAG.FURNISHED) !== 0;
      if (furnished === 'yes' && !isFurnished) return false;
      if (furnished === 'no' && isFurnished) return false;
      const acceptsPets = (item.fl & FLAG.PETS) !== 0;
      if (pets === 'yes' && !acceptsPets) return false;
      if (pets === 'no' && acceptsPets) return false;
      if (search) {
        const haystack = normalizeText(`${item.title} ${item.street} ${dicts.neighbourhoods[item.nb] || ''}`);
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  });

  readonly rows = computed((): TableRow[] => {
    const dicts = this.dicts();
    const columns = this.columns();
    if (!dicts || !columns) return [];
    const sort = this.sortKey();
    const sorted = [...this.filtered()].sort((a, b) => {
      switch (sort) {
        case 'totalCost-asc': return a.tc - b.tc;
        case 'totalCost-desc': return b.tc - a.tc;
        case 'pricePerSqm-asc': return (a.ppm || 99999) - (b.ppm || 99999);
        case 'pricePerSqm-desc': return (b.ppm || 0) - (a.ppm || 0);
        case 'area-desc': return (b.a || 0) - (a.a || 0);
        default: return 0;
      }
    });

    return sorted.map((item) => ({
      title: item.title,
      url: item.url,
      street: item.street,
      neighbourhood: dicts.neighbourhoods[item.nb] || '—',
      totalCost: item.tc,
      rentPrice: item.rp,
      area: item.a || null,
      pricePerSqm: item.ppm || null,
      bedrooms: item.bd,
      parkingSpots: item.pk,
      sourceLabel: dicts.sources[item.src] || '',
      isFurnished: (item.fl & FLAG.FURNISHED) !== 0,
      acceptsPets: (item.fl & FLAG.PETS) !== 0,
      condoIptu: item.ci,
    }));
  });

  readonly chart = computed(() => {
    const counts: Record<string, number> = {};
    for (const row of this.rows()) {
      const key = row.neighbourhood || 'Sem bairro';
      counts[key] = (counts[key] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const max = entries[0]?.[1] || 1;
    return entries.map(([name, count]) => ({ name, count, width: (count / max) * 100 }));
  });

  readonly filterRangeLabel = computed(() => {
    const filter = this.manifest()?.filter;
    if (!filter) return 'Porto Alegre, RS';
    return `Porto Alegre, RS — valor total R$ ${filter.minTotalCost}–${filter.maxTotalCost}`;
  });

  readonly avgTotal = computed(() => this.summary()?.totalCost.avg ?? null);
  readonly avgPpm = computed(() => this.summary()?.pricePerSqm.avg ?? null);

  async ngOnInit(): Promise<void> {
    await this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const manifest = await this.client.loadManifest(true);
      const [summary, dicts, columns] = await Promise.all([
        this.client.loadSummary(manifest.buildHash),
        this.client.loadDicts(manifest.buildHash),
        this.client.loadColumns(manifest.buildHash),
      ]);
      const batches = await Promise.all(
        manifest.shards.lite.files.map((file) => this.client.loadLiteShard(manifest.buildHash, file)),
      );
      const listings = batches.flat();
      this.manifest.set(manifest);
      this.summary.set(summary);
      this.dicts.set(dicts);
      this.columns.set(columns);
      this.listings.set(listings);
      this.setStatus(this.buildStatusMessage(manifest));
    } catch (err) {
      this.setStatus(String((err as Error)?.message || err), true);
    } finally {
      this.loading.set(false);
    }
  }

  private buildStatusMessage(manifest: DbManifest): string {
    const sources = manifest.sources.map((s) => s.label).join(', ');
    const date = new Date(manifest.collectedAt).toLocaleString('pt-BR');
    const max = manifest.filter?.maxTotalCost;
    return `${manifest.count} imóveis · ${sources} · coletado ${date}${max ? ` · filtro total <= ${formatBrl(max)}` : ''}`;
  }

  setStatus(message: string, isError = false): void {
    this.statusMessage.set(message);
    this.statusError.set(isError);
  }

  clearFilters(): void {
    this.filterSource.set('');
    this.filterNeighbourhood.set('');
    this.filterType.set('');
    this.filterBedrooms.set('');
    this.filterFurnished.set('');
    this.filterPets.set('');
    this.filterSearch.set('');
  }

  async reload(): Promise<void> {
    await this.bootstrap();
  }

  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      JSON.parse(await file.text());
      this.setStatus('Upload local ainda não suportado nesta versão.', true);
    } catch {
      this.setStatus('JSON inválido.', true);
    }
  }
}
