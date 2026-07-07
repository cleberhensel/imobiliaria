export interface DbManifest {
  version: string;
  buildHash: string;
  city: string;
  state: string;
  filter: { minTotalCost: number; maxTotalCost: number };
  collectedAt: string;
  count: number;
  sources: { id: string; label: string; count: number }[];
  shards: {
    lite: { size: number; count: number; files: string[] };
    detail: { size: number; count: number; files: string[] };
  };
}

export interface DbSummary {
  byNeighbourhood: { name: string; count: number }[];
  totalCost: StatRange;
  area: StatRange;
  pricePerSqm: StatRange;
  furnished: number;
  acceptsPets: number;
  withParking: number;
  apartments: number;
  central: number;
  withBalcony: number;
  withSun: number;
}

export interface StatRange {
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface DbDicts {
  neighbourhoods: string[];
  sources: string[];
  types: string[];
  photoPrefixes: string[];
  photoSuffixes: string[];
  photoFull: string[];
}

export interface DbColumns {
  count: number;
  totalCost: number[];
  rentPrice: number[];
  condoIptu: number[];
  area: number[];
  pricePerSqm: number[];
  bedrooms: number[];
  bathrooms: number[];
  parking: number[];
  neighbourhoodId: number[];
  sourceId: number[];
  typeId: number[];
  tier: number[];
  centralityScore: number[];
  featureScore: number[];
  fitScore: number[];
  flags: number[];
}

export type PhotoEncoded = [number, number] | null;

export interface LiteListing {
  o: number;
  id: string;
  url: string;
  title: string;
  street: string;
  nb: number;
  src: number;
  tc: number;
  rp: number;
  ci: number;
  a: number;
  ppm: number;
  bd: number;
  ba: number;
  pk: number;
  tr: number;
  cs: number;
  fs: number;
  ff: number;
  fl: number;
  ph: PhotoEncoded;
}

export interface DetailListing {
  o: number;
  id: string;
  sourceLabel: string;
  url: string;
  title: string;
  type: string;
  street: string;
  neighbourhood: string;
  rentPrice: number;
  condoPrice: number | null;
  iptuPrice: number | null;
  condoIptu: number;
  extraCosts: { label: string; amount: number }[];
  totalCost: number;
  area: number | null;
  pricePerSqm: number | null;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  isFurnished: boolean;
  acceptsPets: boolean;
  amenities: string[];
  installations: string[];
  photoUrls: PhotoEncoded[];
  tier: string;
  tierLabel: string;
  signals: {
    sacada: boolean;
    sun: boolean;
    sunStrong: boolean;
    sunWeak: boolean;
    sunTags: string[];
    balconyTags: string[];
  };
  featureScore: number;
  fitScore: number;
  isApartment: boolean;
  alsoAt: { source: string; sourceLabel: string; url: string; totalCost: number }[];
}

export interface Priorities {
  apartment: boolean;
  sacada: boolean;
  sun: boolean;
  pets: boolean;
  parking: boolean;
}

export type SortKey =
  | 'fit-desc'
  | 'totalCost-asc'
  | 'totalCost-desc'
  | 'centrality-desc'
  | 'pricePerSqm-asc'
  | 'area-desc';

export const TIER_LABELS = ['Núcleo central', 'Adjacente', 'Intermediário', 'Periferia'];
export const TIER_KEYS = ['core', 'near', 'mid', 'outer'] as const;

export const FLAG = {
  FURNISHED: 1 << 0,
  PETS: 1 << 1,
  APARTMENT: 1 << 2,
  SACADA: 1 << 3,
  SUN_STRONG: 1 << 4,
  SUN_WEAK: 1 << 5,
  PARKING: 1 << 6,
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
