import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFlags,
  buildSearchText,
  dedupeKey,
  encodePhotoUrl,
  enrichListing,
  PHOTO_PREFIXES,
  tierToIndex,
} from './lib/enrich.mjs';
import { isPortoAlegre, readConfig } from './lib/crawler-io.mjs';
import { SOURCE_LABELS } from './lib/schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const config = await readConfig(path.join(root, 'config', 'filters.json'));
const rawDir = path.join(root, 'data', 'raw');
const outputDir = path.join(root, 'web', 'public', 'db');

const LITE_SHARD_SIZE = 128;
const DETAIL_SHARD_SIZE = 64;

const SOURCES = ['quintoandar', 'auxiliadora-predial', 'guarida'];

async function readNdjson(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
}

function min(arr) {
  return arr.length ? Math.min(...arr) : null;
}

function max(arr) {
  return arr.length ? Math.max(...arr) : null;
}

function buildSummary(listings) {
  const byNeighbourhood = {};
  for (const item of listings) {
    const key = item.neighbourhood || 'Sem bairro';
    byNeighbourhood[key] = (byNeighbourhood[key] || 0) + 1;
  }

  const totals = listings.map((l) => l.totalCost).filter(Boolean);
  const areas = listings.map((l) => l.area).filter(Boolean);
  const ppms = listings.map((l) => l.pricePerSqm).filter(Boolean);

  return {
    byNeighbourhood: Object.entries(byNeighbourhood)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    totalCost: { min: min(totals), max: max(totals), avg: avg(totals) },
    area: { min: min(areas), max: max(areas), avg: avg(areas) },
    pricePerSqm: { min: min(ppms), max: max(ppms), avg: avg(ppms) },
    furnished: listings.filter((l) => l.isFurnished).length,
    acceptsPets: listings.filter((l) => l.acceptsPets).length,
    withParking: listings.filter((l) => l.parkingSpots > 0).length,
    apartments: listings.filter((l) => l.isApartment).length,
    central: listings.filter((l) => ['core', 'near', 'mid'].includes(l.tier)).length,
    withBalcony: listings.filter((l) => l.signals.sacada).length,
    withSun: listings.filter((l) => l.signals.sun).length,
  };
}

function dedupeListings(listings) {
  const groups = new Map();
  const review = [];

  for (const listing of listings) {
    const key = dedupeKey(listing);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(listing);
  }

  const canonical = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      canonical.push(group[0]);
      continue;
    }

    group.sort((a, b) => a.totalCost - b.totalCost);
    const primary = { ...group[0] };
    primary.alsoAt = group.slice(1).map((item) => ({
      source: item.source,
      sourceLabel: item.sourceLabel,
      url: item.url,
      totalCost: item.totalCost,
    }));
    canonical.push(primary);

    if (group.length > 2) {
      review.push({
        key: dedupeKey(primary),
        count: group.length,
        ids: group.map((item) => item.id),
      });
    }
  }

  return { canonical, review };
}

function getDictId(dictArray, value, fallback = 'Sem bairro') {
  const key = value || fallback;
  let idx = dictArray.indexOf(key);
  if (idx === -1) {
    dictArray.push(key);
    idx = dictArray.length - 1;
  }
  return idx;
}

async function writeJson(filePath, data, pretty = false) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = pretty ? `${JSON.stringify(data, null, 2)}\n` : `${JSON.stringify(data)}\n`;
  await fs.writeFile(filePath, body, 'utf8');
}

async function emptyDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

console.log('Compilando database estático...');

const allRaw = [];
for (const source of SOURCES) {
  const filePath = path.join(rawDir, `${source}.ndjson`);
  const items = await readNdjson(filePath);
  console.log(`${source}: ${items.length} listings raw`);
  allRaw.push(...items);
}

if (!allRaw.length) {
  throw new Error('Nenhum NDJSON encontrado em data/raw/. Rode npm run migrate:legacy ou npm run crawl:all');
}

const enriched = allRaw.map((listing) => enrichListing(listing));
const { canonical, review } = dedupeListings(enriched);
canonical.sort((a, b) => a.totalCost - b.totalCost);

for (const listing of canonical) {
  if (!isPortoAlegre(listing.city)) {
    throw new Error(`Listing fora de Porto Alegre: ${listing.id} (${listing.city})`);
  }
  if (listing.totalCost < config.minTotalCost || listing.totalCost > config.maxTotalCost) {
    throw new Error(`Listing fora da faixa: ${listing.id} (${listing.totalCost})`);
  }
}

const dicts = {
  neighbourhoods: [],
  sources: [],
  types: [],
  photoPrefixes: [...PHOTO_PREFIXES],
  photoSuffixes: [],
  photoFull: [],
};

const columns = {
  count: canonical.length,
  totalCost: [],
  rentPrice: [],
  condoIptu: [],
  area: [],
  pricePerSqm: [],
  bedrooms: [],
  bathrooms: [],
  parking: [],
  neighbourhoodId: [],
  sourceId: [],
  typeId: [],
  tier: [],
  centralityScore: [],
  featureScore: [],
  fitScore: [],
  flags: [],
};

const searchTexts = [];
const liteRecords = [];
const detailRecords = [];

for (let ordinal = 0; ordinal < canonical.length; ordinal += 1) {
  const listing = canonical[ordinal];
  listing.ordinal = ordinal;

  columns.totalCost.push(listing.totalCost);
  columns.rentPrice.push(listing.rentPrice);
  columns.condoIptu.push(listing.condoIptu || 0);
  columns.area.push(listing.area || 0);
  columns.pricePerSqm.push(listing.pricePerSqm || 0);
  columns.bedrooms.push(listing.bedrooms || 0);
  columns.bathrooms.push(listing.bathrooms || 0);
  columns.parking.push(listing.parkingSpots || 0);
  columns.neighbourhoodId.push(getDictId(dicts.neighbourhoods, listing.neighbourhood));
  columns.sourceId.push(getDictId(dicts.sources, listing.source));
  columns.typeId.push(getDictId(dicts.types, listing.type));
  columns.tier.push(tierToIndex(listing.tier));
  columns.centralityScore.push(listing.centralityScore);
  columns.featureScore.push(listing.featureScore);
  columns.fitScore.push(listing.fitScore);
  columns.flags.push(buildFlags(listing, listing.signals, listing.isApartment));
  searchTexts.push(buildSearchText(listing));

  const photoEnc = encodePhotoUrl(listing.photoUrl || listing.photoUrls?.[0] || null, dicts);

  liteRecords.push({
    o: ordinal,
    id: listing.id,
    url: listing.url,
    title: listing.title,
    street: listing.street,
    nb: columns.neighbourhoodId.at(-1),
    src: columns.sourceId.at(-1),
    tc: listing.totalCost,
    rp: listing.rentPrice,
    ci: listing.condoIptu || 0,
    a: listing.area || 0,
    ppm: listing.pricePerSqm || 0,
    bd: listing.bedrooms || 0,
    ba: listing.bathrooms || 0,
    pk: listing.parkingSpots || 0,
    tr: columns.tier.at(-1),
    cs: listing.centralityScore,
    fs: listing.featureScore,
    ff: listing.fitScore,
    fl: columns.flags.at(-1),
    ph: photoEnc,
  });

  detailRecords.push({
    o: ordinal,
    id: listing.id,
    sourceLabel: listing.sourceLabel,
    url: listing.url,
    title: listing.title,
    type: listing.type,
    street: listing.street,
    neighbourhood: listing.neighbourhood,
    rentPrice: listing.rentPrice,
    condoPrice: listing.condoPrice,
    iptuPrice: listing.iptuPrice,
    condoIptu: listing.condoIptu,
    extraCosts: listing.extraCosts,
    totalCost: listing.totalCost,
    area: listing.area,
    pricePerSqm: listing.pricePerSqm,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parkingSpots: listing.parkingSpots,
    isFurnished: listing.isFurnished,
    acceptsPets: listing.acceptsPets,
    amenities: listing.amenities,
    installations: listing.installations,
    photoUrls: listing.photoUrls.map((url) => encodePhotoUrl(url, dicts)).filter(Boolean),
    tier: listing.tier,
    tierLabel: listing.tierLabel,
    signals: listing.signals,
    featureScore: listing.featureScore,
    fitScore: listing.fitScore,
    isApartment: listing.isApartment,
    alsoAt: listing.alsoAt || [],
  });
}

await emptyDir(outputDir);
await emptyDir(path.join(outputDir, 'lite'));
await emptyDir(path.join(outputDir, 'detail'));

const liteFiles = [];
for (let i = 0; i < liteRecords.length; i += LITE_SHARD_SIZE) {
  const shardIndex = Math.floor(i / LITE_SHARD_SIZE);
  const name = `shard-${String(shardIndex).padStart(3, '0')}.json`;
  const shard = liteRecords.slice(i, i + LITE_SHARD_SIZE);
  await writeJson(path.join(outputDir, 'lite', name), shard);
  liteFiles.push(`lite/${name}`);
}

const detailFiles = [];
for (let i = 0; i < detailRecords.length; i += DETAIL_SHARD_SIZE) {
  const shardIndex = Math.floor(i / DETAIL_SHARD_SIZE);
  const name = `shard-${String(shardIndex).padStart(3, '0')}.json`;
  const shard = detailRecords.slice(i, i + DETAIL_SHARD_SIZE);
  await writeJson(path.join(outputDir, 'detail', name), shard);
  detailFiles.push(`detail/${name}`);
}

const summary = buildSummary(canonical);
const sourceCounts = SOURCES.map((source) => ({
  id: source,
  label: SOURCE_LABELS[source] || source,
  count: canonical.filter((item) => item.source === source).length,
}));

const manifestCore = {
  version: '2.0',
  city: config.city,
  state: config.state,
  filter: {
    minTotalCost: config.minTotalCost,
    maxTotalCost: config.maxTotalCost,
  },
  collectedAt: new Date().toISOString(),
  count: canonical.length,
  sources: sourceCounts,
  shards: {
    lite: { size: LITE_SHARD_SIZE, count: liteFiles.length, files: liteFiles },
    detail: { size: DETAIL_SHARD_SIZE, count: detailFiles.length, files: detailFiles },
  },
};

const buildHash = createHash('sha256')
  .update(JSON.stringify({ columns, dicts, summary, manifestCore }))
  .digest('hex')
  .slice(0, 12);

const manifest = { ...manifestCore, buildHash };

await writeJson(path.join(outputDir, 'manifest.json'), manifest, true);
await writeJson(path.join(outputDir, 'summary.json'), summary, true);
await writeJson(path.join(outputDir, 'dicts.json'), dicts);
await writeJson(path.join(outputDir, 'columns.json'), columns);
await writeJson(path.join(outputDir, 'search.json'), searchTexts);

if (review.length) {
  await writeJson(path.join(rawDir, 'dedupe-review.json'), review, true);
}

console.log(`Database compilado em ${outputDir}`);
console.log(`Listings: ${canonical.length}`);
console.log(`Build hash: ${buildHash}`);
console.log(`Lite shards: ${liteFiles.length}, detail shards: ${detailFiles.length}`);
