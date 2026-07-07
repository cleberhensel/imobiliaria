import { DetailListing } from '../models/db.models';

export interface ExplorerListing extends Omit<DetailListing, 'photoUrls'> {
  photoUrls: string[];
  photoUrl: string | null;
  centralityScore: number;
  source: string;
  city: string;
  isFurnished: boolean;
  amenities: string[];
  installations: string[];
  adherenceScore: number;
  matchedCount: number;
  activeCount: number;
  matchesAllPriorities: boolean;
}

export const SOURCE_LABELS: Record<string, string> = {
  quintoandar: 'QuintoAndar',
  'auxiliadora-predial': 'Auxiliadora Predial',
  guarida: 'Guarida',
};

export const TIERS = {
  core: { label: 'Núcleo central', score: 100 },
  near: { label: 'Adjacente', score: 75 },
  mid: { label: 'Intermediário', score: 50 },
  outer: { label: 'Periferia', score: 20 },
} as const;

export const PRIORITY_WEIGHTS = {
  apartment: 15,
  sacada: 25,
  sun: 25,
  sunWeak: 14,
  pets: 10,
  parking: 10,
} as const;

export const CENTRALITY_WEIGHT = 35;

export type Priorities = {
  apartment: boolean;
  sacada: boolean;
  sun: boolean;
  pets: boolean;
  parking: boolean;
};

export type SortKey =
  | 'fit-desc'
  | 'totalCost-asc'
  | 'totalCost-desc'
  | 'centrality-desc'
  | 'pricePerSqm-asc'
  | 'area-desc';

export function matchesPriority(item: ExplorerListing, key: keyof Priorities): boolean {
  switch (key) {
    case 'apartment': return item.isApartment;
    case 'sacada': return item.signals.sacada;
    case 'sun': return item.signals.sun;
    case 'pets': return item.acceptsPets;
    case 'parking': return item.parkingSpots > 0;
    default: return false;
  }
}

export function computeAdherence(item: ExplorerListing, priorities: Priorities): ExplorerListing {
  let earned = Math.round(item.centralityScore * (CENTRALITY_WEIGHT / 100));
  let max = CENTRALITY_WEIGHT;

  if (priorities.apartment) {
    max += PRIORITY_WEIGHTS.apartment;
    if (item.isApartment) earned += PRIORITY_WEIGHTS.apartment;
  }
  if (priorities.sacada) {
    max += PRIORITY_WEIGHTS.sacada;
    if (item.signals.sacada) earned += PRIORITY_WEIGHTS.sacada;
  }
  if (priorities.sun) {
    max += PRIORITY_WEIGHTS.sun;
    if (item.signals.sunStrong) earned += PRIORITY_WEIGHTS.sun;
    else if (item.signals.sunWeak) earned += PRIORITY_WEIGHTS.sunWeak;
  }
  if (priorities.pets) {
    max += PRIORITY_WEIGHTS.pets;
    if (item.acceptsPets) earned += PRIORITY_WEIGHTS.pets;
  }
  if (priorities.parking) {
    max += PRIORITY_WEIGHTS.parking;
    if (item.parkingSpots > 0) earned += PRIORITY_WEIGHTS.parking;
  }

  const adherenceScore = max ? Math.round((earned / max) * 100) : item.fitScore;
  const activeKeys = (Object.keys(priorities) as (keyof Priorities)[]).filter((k) => priorities[k]);
  const matchedCount = activeKeys.filter((key) => matchesPriority(item, key)).length;

  return {
    ...item,
    adherenceScore,
    matchedCount,
    activeCount: activeKeys.length,
    matchesAllPriorities: activeKeys.length > 0 && matchedCount === activeKeys.length,
  };
}

export function sortListings(items: ExplorerListing[], sortKey: SortKey): ExplorerListing[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'fit-desc':
        return (b.adherenceScore ?? 0) - (a.adherenceScore ?? 0) || a.totalCost - b.totalCost;
      case 'totalCost-asc':
        return a.totalCost - b.totalCost;
      case 'totalCost-desc':
        return b.totalCost - a.totalCost;
      case 'centrality-desc':
        return b.centralityScore - a.centralityScore;
      case 'pricePerSqm-asc':
        return (a.pricePerSqm || 99999) - (b.pricePerSqm || 99999);
      case 'area-desc':
        return (b.area || 0) - (a.area || 0);
      default:
        return 0;
    }
  });
  return sorted;
}
