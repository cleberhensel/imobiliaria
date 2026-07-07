import {
  CENTRALITY_WEIGHT,
  DbColumns,
  DbDicts,
  FLAG,
  PRIORITY_WEIGHTS,
  Priorities,
  SortKey,
  TIER_KEYS,
} from '../models/db.models';

export interface QueryFilters {
  selectedTier: string;
  neighbourhoodIds: Set<number>;
  sourceIds: Set<number>;
  typeIds: Set<number>;
  minBedrooms: number;
  furnished: '' | 'yes' | 'no';
  pets: '' | 'yes' | 'no';
  searchText: string;
  searchOrdinals: Set<number> | null;
}

export interface ScoredOrdinal {
  ordinal: number;
  adherenceScore: number;
  matchedCount: number;
  matchesAllPriorities: boolean;
}

export class QueryEngine {
  constructor(
    readonly columns: DbColumns,
    readonly dicts: DbDicts,
    readonly searchTexts: string[] | null = null,
  ) {}

  filter(filters: QueryFilters): number[] {
    const out: number[] = [];
    const tierIdx = filters.selectedTier ? TIER_KEYS.indexOf(filters.selectedTier as typeof TIER_KEYS[number]) : -1;

    for (let i = 0; i < this.columns.count; i += 1) {
      if (tierIdx >= 0 && this.columns.tier[i] !== tierIdx) continue;
      if (filters.neighbourhoodIds.size && !filters.neighbourhoodIds.has(this.columns.neighbourhoodId[i])) continue;
      if (filters.sourceIds.size && !filters.sourceIds.has(this.columns.sourceId[i])) continue;
      if (filters.typeIds.size && !filters.typeIds.has(this.columns.typeId[i])) continue;
      if (filters.minBedrooms && this.columns.bedrooms[i] < filters.minBedrooms) continue;

      const flags = this.columns.flags[i];
      if (filters.furnished === 'yes' && !(flags & FLAG.FURNISHED)) continue;
      if (filters.furnished === 'no' && (flags & FLAG.FURNISHED)) continue;
      if (filters.pets === 'yes' && !(flags & FLAG.PETS)) continue;
      if (filters.pets === 'no' && (flags & FLAG.PETS)) continue;

      if (filters.searchOrdinals && !filters.searchOrdinals.has(i)) continue;
      if (filters.searchText && this.searchTexts) {
        const hay = this.searchTexts[i] || '';
        if (!hay.includes(filters.searchText)) continue;
      }

      out.push(i);
    }

    return out;
  }

  scoreOrdinals(ordinals: number[], priorities: Priorities): ScoredOrdinal[] {
    return ordinals.map((ordinal) => {
      const adherenceScore = this.computeAdherence(ordinal, priorities);
      const activeKeys = (Object.keys(priorities) as (keyof Priorities)[]).filter((k) => priorities[k]);
      const matchedCount = activeKeys.filter((key) => this.matchesPriority(ordinal, key)).length;
      return {
        ordinal,
        adherenceScore: adherenceScore.score,
        matchedCount,
        matchesAllPriorities: activeKeys.length > 0 && matchedCount === activeKeys.length,
      };
    });
  }

  sort(scored: ScoredOrdinal[], sortKey: SortKey): ScoredOrdinal[] {
    const sorted = [...scored];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'fit-desc':
          return b.adherenceScore - a.adherenceScore || this.columns.totalCost[a.ordinal] - this.columns.totalCost[b.ordinal];
        case 'totalCost-asc':
          return this.columns.totalCost[a.ordinal] - this.columns.totalCost[b.ordinal];
        case 'totalCost-desc':
          return this.columns.totalCost[b.ordinal] - this.columns.totalCost[a.ordinal];
        case 'centrality-desc':
          return this.columns.centralityScore[b.ordinal] - this.columns.centralityScore[a.ordinal];
        case 'pricePerSqm-asc':
          return (this.columns.pricePerSqm[a.ordinal] || 99999) - (this.columns.pricePerSqm[b.ordinal] || 99999);
        case 'area-desc':
          return (this.columns.area[b.ordinal] || 0) - (this.columns.area[a.ordinal] || 0);
        default:
          return 0;
      }
    });
    return sorted;
  }

  computeAdherence(ordinal: number, priorities: Priorities): { score: number; max: number } {
    let earned = Math.round(this.columns.centralityScore[ordinal] * (CENTRALITY_WEIGHT / 100));
    let max = CENTRALITY_WEIGHT;
    const flags = this.columns.flags[ordinal];

    if (priorities.apartment) {
      max += PRIORITY_WEIGHTS.apartment;
      if (flags & FLAG.APARTMENT) earned += PRIORITY_WEIGHTS.apartment;
    }
    if (priorities.sacada) {
      max += PRIORITY_WEIGHTS.sacada;
      if (flags & FLAG.SACADA) earned += PRIORITY_WEIGHTS.sacada;
    }
    if (priorities.sun) {
      max += PRIORITY_WEIGHTS.sun;
      if (flags & FLAG.SUN_STRONG) earned += PRIORITY_WEIGHTS.sun;
      else if (flags & FLAG.SUN_WEAK) earned += PRIORITY_WEIGHTS.sunWeak;
    }
    if (priorities.pets) {
      max += PRIORITY_WEIGHTS.pets;
      if (flags & FLAG.PETS) earned += PRIORITY_WEIGHTS.pets;
    }
    if (priorities.parking) {
      max += PRIORITY_WEIGHTS.parking;
      if (flags & FLAG.PARKING) earned += PRIORITY_WEIGHTS.parking;
    }

    const score = max ? Math.round((earned / max) * 100) : this.columns.fitScore[ordinal];
    return { score, max };
  }

  matchesPriority(ordinal: number, key: keyof Priorities): boolean {
    const flags = this.columns.flags[ordinal];
    switch (key) {
      case 'apartment':
        return Boolean(flags & FLAG.APARTMENT);
      case 'sacada':
        return Boolean(flags & FLAG.SACADA);
      case 'sun':
        return Boolean(flags & FLAG.SUN_STRONG || flags & FLAG.SUN_WEAK);
      case 'pets':
        return Boolean(flags & FLAG.PETS);
      case 'parking':
        return Boolean(flags & FLAG.PARKING);
      default:
        return false;
    }
  }

  funnelStats(ordinals: number[]): Record<string, number> {
    let apartments = 0;
    let central = 0;
    let balcony = 0;
    let sun = 0;
    let highAdherence = 0;

    for (const o of ordinals) {
      const flags = this.columns.flags[o];
      if (flags & FLAG.APARTMENT) apartments += 1;
      if (this.columns.tier[o] <= 2) central += 1;
      if (flags & FLAG.SACADA) balcony += 1;
      if (flags & FLAG.SUN_STRONG || flags & FLAG.SUN_WEAK) sun += 1;
    }

    return {
      catalog: this.columns.count,
      apartments,
      central,
      balcony,
      sun,
      filtered: ordinals.length,
      highAdherence,
    };
  }
}
