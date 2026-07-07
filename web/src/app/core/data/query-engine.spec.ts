import { describe, expect, it } from 'vitest';
import { QueryEngine } from './query-engine';
import { DbColumns, DbDicts } from '../models/db.models';

const dicts: DbDicts = {
  neighbourhoods: ['Centro Histórico', 'Bom Fim'],
  sources: ['quintoandar'],
  types: ['Apartamento'],
  photoPrefixes: [],
  photoSuffixes: [],
  photoFull: [],
};

const columns: DbColumns = {
  count: 2,
  totalCost: [2000, 3500],
  rentPrice: [1800, 3000],
  condoIptu: [200, 500],
  area: [45, 60],
  pricePerSqm: [44, 58],
  bedrooms: [1, 2],
  bathrooms: [1, 1],
  parking: [0, 1],
  neighbourhoodId: [0, 1],
  sourceId: [0, 0],
  typeId: [0, 0],
  tier: [0, 1],
  centralityScore: [100, 75],
  featureScore: [40, 20],
  fitScore: [75, 46],
  flags: [1 << 2, (1 << 2) | (1 << 3) | (1 << 6)],
};

describe('QueryEngine', () => {
  it('filtra por tier e bairro', () => {
    const engine = new QueryEngine(columns, dicts);
    const result = engine.filter({
      selectedTier: 'core',
      neighbourhoodIds: new Set([0]),
      sourceIds: new Set(),
      typeIds: new Set(),
      minBedrooms: 0,
      furnished: '',
      pets: '',
      searchText: '',
      searchOrdinals: null,
    });
    expect(result).toEqual([0]);
  });

  it('calcula aderência com prioridades', () => {
    const engine = new QueryEngine(columns, dicts);
    const scored = engine.scoreOrdinals([1], {
      apartment: true,
      sacada: true,
      sun: false,
      pets: false,
      parking: true,
    });
    expect(scored[0].adherenceScore).toBeGreaterThan(0);
    expect(scored[0].matchedCount).toBe(3);
  });

  it('ordena por totalCost asc', () => {
    const engine = new QueryEngine(columns, dicts);
    const scored = engine.scoreOrdinals([0, 1], {
      apartment: false,
      sacada: false,
      sun: false,
      pets: false,
      parking: false,
    });
    const sorted = engine.sort(scored, 'totalCost-asc');
    expect(sorted.map((s) => s.ordinal)).toEqual([0, 1]);
  });
});
