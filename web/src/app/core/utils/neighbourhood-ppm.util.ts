import { normalizeText } from './format.util';

const CANONICAL_LABELS: Record<string, string> = {
  'centro historico': 'Centro Histórico',
  'cidade baixa': 'Cidade Baixa',
  'bom fim': 'Bom Fim',
  'menino deus': 'Menino Deus',
  floresta: 'Floresta',
  independencia: 'Independência',
  azenha: 'Azenha',
  'praia de belas': 'Praia de Belas',
  petropolis: 'Petrópolis',
  'rio branco': 'Rio Branco',
  santana: 'Santana',
  'moinhos de vento': 'Moinhos de Vento',
  navegantes: 'Navegantes',
  farroupilha: 'Farroupilha',
  'mont serrat': 'Mont Serrat',
  'bela vista': 'Bela Vista',
  auxiliadora: 'Auxiliadora',
  cristal: 'Cristal',
  'sao geraldo': 'São Geraldo',
  higienopolis: 'Higienópolis',
  gloria: 'Glória',
  cecilia: 'Cecília',
  partenon: 'Partenon',
  teresopolis: 'Teresópolis',
  'alto petropolis': 'Alto Petrópolis',
  'jardim botanico': 'Jardim Botânico',
  humaita: 'Humaitá',
  'passo da areia': 'Passo da Areia',
  'cristo redentor': 'Cristo Redentor',
  sarandi: 'Sarandi',
  nonoai: 'Nonoai',
  fatima: 'Fátima',
  'vila ipiranga': 'Vila Ipiranga',
  'central park': 'Central Park',
  hipica: 'Hípica',
  'tres figueiras': 'Três Figueiras',
  'sem bairro': 'Sem bairro',
};

const NEIGHBOURHOOD_ALIASES: Record<string, string> = {
  'passo d areia': 'passo da areia',
  'passo das pedras': 'passo das pedras',
  'central parque': 'central park',
  "mont'serrat": 'mont serrat',
  'montserrat': 'mont serrat',
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;#0*39;|&#0*39;|&apos;|&#x0*27;/gi, "'")
    .replace(/&amp;#0*34;|&#0*34;|&quot;|&#x0*22;/gi, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function neighbourhoodKey(name?: string | null): string {
  const decoded = decodeHtmlEntities((name || 'Sem bairro').trim());
  let norm = normalizeText(decoded);
  norm = norm.replace(/[`'’´]/g, ' ').replace(/\s+/g, ' ').trim();
  if (NEIGHBOURHOOD_ALIASES[norm]) norm = NEIGHBOURHOOD_ALIASES[norm];
  return norm || 'sem bairro';
}

export function neighbourhoodLabel(key: string, fallback?: string | null): string {
  return CANONICAL_LABELS[key] || fallback?.trim() || 'Sem bairro';
}

export function isCompactUnit(type?: string, title?: string): boolean {
  const haystack = normalizeText(`${type || ''} ${title || ''}`);
  return /studio|kitnet|kitchenette|\bjk\b|loft|flat|cobertura duplex/.test(haystack);
}

export function countsForNeighbourhoodRentPpm(item: {
  isApartment?: boolean;
  type?: string;
  title?: string;
  area?: number | null;
  rentPrice?: number;
}): boolean {
  if (!item.isApartment) return false;
  if (isCompactUnit(item.type, item.title)) return false;
  if (!item.area || item.area <= 0) return false;
  if (!item.rentPrice || item.rentPrice <= 0) return false;
  return true;
}

export function getRentPerSqm(item: { rentPrice?: number; area?: number | null }): number | null {
  if (!item.area || !item.rentPrice) return null;
  return Math.round((item.rentPrice / item.area) * 100) / 100;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 100) / 100;
}

export function buildNeighbourhoodMedianRentPpm(
  listings: Array<{
    neighbourhood?: string | null;
    isApartment?: boolean;
    type?: string;
    title?: string;
    area?: number | null;
    rentPrice?: number;
  }>,
): Record<string, number> {
  const groups: Record<string, number[]> = {};

  for (const item of listings) {
    if (!countsForNeighbourhoodRentPpm(item)) continue;
    const key = neighbourhoodKey(item.neighbourhood);
    const ppm = getRentPerSqm(item);
    if (!ppm) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ppm);
  }

  const result: Record<string, number> = {};
  for (const [key, values] of Object.entries(groups)) {
    const med = median(values);
    if (med != null) result[key] = med;
  }
  return result;
}
