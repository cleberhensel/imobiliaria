import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectQuintoAndar } from './lib/quintoandar.mjs';
import { buildCatalog, normalizeQuintoAndarHouse } from './lib/schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config', 'filters.json');
const outputPath = path.join(root, 'data', 'quintoandar.json');

const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const qa = config.sources.quintoandar;

console.log(`Coletando QuintoAndar — ${config.city}/${config.state}`);
console.log(`Filtro: valor total <= R$ ${config.maxTotalCost}`);

const result = await collectQuintoAndar({
  maxTotalCost: config.maxTotalCost,
  maxListings: qa.maxListings ?? null,
  onProgress(page, total, collected) {
    process.stdout.write(`\rPágina ${page} — total reportado: ${total} — coletados: ${collected}`);
  },
});

console.log('\nNormalizando metadados...');

const listings = result.houses
  .map((house) => normalizeQuintoAndarHouse(house))
  .sort((a, b) => a.totalCost - b.totalCost);

const catalog = buildCatalog({
  source: 'quintoandar',
  city: config.city,
  state: config.state,
  maxTotalCost: config.maxTotalCost,
  fetchedPages: result.pagesFetched,
  rawCount: result.rawCount,
  reportedTotal: result.reportedTotal,
  listings,
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

console.log(`Salvo: ${outputPath}`);
console.log(`Imóveis no catálogo: ${catalog.listings.length}`);
console.log(`Páginas percorridas: ${result.pagesFetched}`);
