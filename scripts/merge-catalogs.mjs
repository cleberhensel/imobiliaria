import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_LABELS } from './lib/schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const outputPath = path.join(dataDir, 'catalog.json');
const config = JSON.parse(await fs.readFile(path.join(root, 'config', 'filters.json'), 'utf8'));

const sourceFiles = {
  quintoandar: 'quintoandar.json',
  'auxiliadora-predial': 'auxiliadora-predial.json',
  guarida: 'guarida.json',
};

/** @type {Record<string, object>} */
const catalogs = {};

for (const [source, filename] of Object.entries(sourceFiles)) {
  const filePath = path.join(dataDir, filename);
  try {
    catalogs[source] = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    console.warn(`Aviso: ${filename} não encontrado — rode npm run fetch:${source.replace('-predial', '')} antes`);
  }
}

const listings = Object.values(catalogs)
  .flatMap((catalog) => (catalog.listings || []).map((item) => ({
    ...item,
    sourceLabel: item.sourceLabel || SOURCE_LABELS[item.source] || item.source,
  })))
  .sort((a, b) => a.totalCost - b.totalCost);

const bySource = Object.fromEntries(
  Object.entries(catalogs).map(([source, catalog]) => [source, {
    meta: catalog.meta,
    summary: catalog.summary,
    count: catalog.listings?.length || 0,
  }]),
);

const byNeighbourhood = {};
for (const item of listings) {
  const key = item.neighbourhood || 'Sem bairro';
  byNeighbourhood[key] = (byNeighbourhood[key] || 0) + 1;
}

const totals = listings.map((l) => l.totalCost).filter(Boolean);
const areas = listings.map((l) => l.area).filter(Boolean);
const ppms = listings.map((l) => l.pricePerSqm).filter(Boolean);
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const min = (arr) => (arr.length ? Math.min(...arr) : null);
const max = (arr) => (arr.length ? Math.max(...arr) : null);

const merged = {
  meta: {
    version: '1.0',
    city: config.city,
    state: config.state,
    filter: { maxTotalCost: config.maxTotalCost },
    collectedAt: new Date().toISOString(),
    sources: Object.keys(catalogs).map((source) => ({
      id: source,
      label: SOURCE_LABELS[source] || source,
      count: catalogs[source]?.listings?.length || 0,
      reportedTotal: catalogs[source]?.meta?.reportedTotal ?? null,
    })),
    matchedCount: listings.length,
  },
  bySource,
  summary: {
    byNeighbourhood: Object.entries(byNeighbourhood)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    totalCost: { min: min(totals), max: max(totals), avg: avg(totals) },
    area: { min: min(areas), max: max(areas), avg: avg(areas) },
    pricePerSqm: { min: min(ppms), max: max(ppms), avg: avg(ppms) },
    furnished: listings.filter((l) => l.isFurnished).length,
    acceptsPets: listings.filter((l) => l.acceptsPets).length,
    withParking: listings.filter((l) => l.parkingSpots > 0).length,
  },
  listings,
};

await fs.writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

console.log(`Catálogo unificado salvo: ${outputPath}`);
console.log(`Total combinado: ${listings.length} imóveis`);
for (const source of merged.meta.sources) {
  console.log(`- ${source.label}: ${source.count}`);
}
