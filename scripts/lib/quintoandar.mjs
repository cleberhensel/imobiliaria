const API_BASE = 'https://apigw.prod.quintoandar.com.br/house-listing-search';
const USER_AGENT = 'Mozilla/5.0 (compatible; imoveis-analyzer/0.2)';

const FIELDS = [
  'id', 'coverImage', 'imageList', 'rent', 'totalCost', 'salePrice', 'iptuPlusCondominium',
  'area', 'address', 'regionName', 'city', 'type', 'bedrooms', 'parkingSpaces',
  'bathrooms', 'isFurnished', 'installations', 'amenities', 'shortRentDescription',
  'neighbourhood',
];

const PORTO_ALEGRE_VIEWPORT = {
  north: -29.9565731,
  south: -30.261167,
  east: -51.0869992,
  west: -51.2672847,
};

const PORTO_ALEGRE_CENTER = {
  lat: -30.0368176,
  lng: -51.2089887,
};

const DEFAULT_HOUSE_TYPES = ['APARTMENT', 'HOUSE', 'HOUSE_CONDO', 'STUDIO'];
const DEFAULT_BEDROOM_BANDS = [
  { min: 0, max: 0 },
  { min: 1, max: 1 },
  { min: 2, max: 2 },
  { min: 3, max: 3 },
  { min: 4, max: 10 },
];
const AREA_BANDS = [
  { min: 0, max: 45 },
  { min: 46, max: 60 },
  { min: 61, max: 80 },
  { min: 81, max: 100 },
  { min: 101, max: 10000 },
];

/** Soft page depth limit observed on QuintoAndar list API. */
const SAFE_PAGE_DEPTH = 900;

import { jitteredDelay, withRetry } from './crawler-io.mjs';

/**
 * @param {object} sourceConfig
 */
function resolveSearchSpec(sourceConfig = {}) {
  const houseTypes = Array.isArray(sourceConfig.houseTypes) && sourceConfig.houseTypes.length
    ? sourceConfig.houseTypes.map(String)
    : DEFAULT_HOUSE_TYPES;
  const minBedrooms = Number(sourceConfig.minBedrooms ?? 0);
  const minArea = Number(sourceConfig.minArea ?? 0);
  const bedroomBands = DEFAULT_BEDROOM_BANDS.filter((band) => band.max >= minBedrooms)
    .map((band) => ({
      min: Math.max(band.min, minBedrooms),
      max: band.max,
    }));

  return {
    houseTypes,
    minBedrooms,
    minArea,
    bedroomBands: bedroomBands.length ? bedroomBands : [{ min: minBedrooms, max: 10 }],
    areaBands: AREA_BANDS
      .map((band) => ({
        min: Math.max(band.min, minArea),
        max: band.max,
      }))
      .filter((band) => band.min <= band.max),
  };
}

/**
 * @param {string} path
 * @param {object} body
 */
async function postSearch(path, body) {
  return withRetry(async () => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return response.json();
    }

    const text = await response.text();
    const error = new Error(`API ${path} falhou: HTTP ${response.status} — ${text.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }, {
    shouldRetry: (error) => error.status === 429 || (error.status >= 500),
  });
}

/**
 * @param {object} options
 */
function buildFilters({
  minTotalCost,
  maxTotalCost,
  blocklist = [],
  bedrooms = { min: 0, max: 10 },
  houseTypes = DEFAULT_HOUSE_TYPES,
  area = { min: 0, max: 10000 },
}) {
  return {
    businessContext: 'RENT',
    blocklist,
    selectedHouses: [],
    location: {
      city: 'Porto Alegre',
      state: 'RS',
      country: 'Brasil',
      neighbourhood: null,
      street: null,
      lat: PORTO_ALEGRE_CENTER.lat,
      lng: PORTO_ALEGRE_CENTER.lng,
      viewport: PORTO_ALEGRE_VIEWPORT,
    },
    priceRange: [{ min: minTotalCost, max: maxTotalCost, costType: 'TOTAL_COST' }],
    houseSpecs: {
      area: { range: area },
      houseTypes,
      bedrooms: { range: bedrooms },
      bathrooms: { range: { min: 0, max: 10 } },
      parkingSpaces: { range: { min: 0, max: 10 } },
      suites: { range: { min: 0, max: 10 } },
    },
    sorting: { criteria: 'RELEVANCE', order: 'DESC' },
    categories: [],
  };
}

/**
 * @param {number} minTotalCost
 * @param {number} maxTotalCost
 * @param {object} [shard]
 */
export async function countQuintoAndar(minTotalCost, maxTotalCost, shard = {}) {
  const data = await postSearch('/v3/search/count', {
    context: {
      mapShowing: false,
      listShowing: true,
      userId: null,
      deviceId: 'imoveis-analyzer',
    },
    filters: {
      ...buildFilters({ minTotalCost, maxTotalCost, ...shard }),
      pagination: { pageSize: 20, offset: 0 },
    },
  });

  return data.hits?.total?.value || 0;
}

/**
 * @param {number[]} ids
 */
async function hydrateHouses(ids) {
  const data = await postSearch('/v3/search/list', {
    context: {
      mapShowing: false,
      listShowing: true,
      userId: null,
      deviceId: 'imoveis-analyzer',
    },
    filters: {
      businessContext: 'RENT',
      selectedHouses: ids.map(Number),
      blocklist: [],
    },
    fields: FIELDS,
    sorting: { criteria: 'RELEVANCE', order: 'DESC' },
  });

  return (data.hits?.hits || [])
    .map((hit) => hit._source || hit.fields)
    .filter((house) => house?.id);
}

/**
 * @param {object} house
 * @param {object} spec
 * @param {number} minTotalCost
 * @param {number} maxTotalCost
 */
function passesLocalFilters(house, spec, minTotalCost, maxTotalCost) {
  const totalCost = Number(house.totalCost) || 0;
  if (totalCost < minTotalCost || totalCost > maxTotalCost) return false;

  const bedrooms = Number(house.bedrooms) || 0;
  if (bedrooms < spec.minBedrooms) return false;

  const area = Number(house.area) || 0;
  if (area < spec.minArea) return false;

  // API type can be localized ("Apartamento"); houseTypes filter already scopes the search.
  return true;
}

/**
 * @param {number} minTotalCost
 * @param {number} maxTotalCost
 * @param {ReturnType<typeof resolveSearchSpec>} spec
 */
async function buildShards(minTotalCost, maxTotalCost, spec) {
  /** @type {{ label: string, bedrooms: {min:number,max:number}, houseTypes: string[], area: {min:number,max:number}, count: number }[]} */
  const shards = [];

  for (const bedrooms of spec.bedroomBands) {
    for (const houseType of spec.houseTypes) {
      const base = {
        bedrooms,
        houseTypes: [houseType],
        area: { min: spec.minArea, max: 10000 },
      };
      const count = await countQuintoAndar(minTotalCost, maxTotalCost, base);
      await jitteredDelay(250, 200);

      if (!count) continue;

      if (count <= SAFE_PAGE_DEPTH) {
        shards.push({
          label: `beds=${bedrooms.min}-${bedrooms.max}|type=${houseType}|area>=${spec.minArea}`,
          ...base,
          count,
        });
        continue;
      }

      for (const area of spec.areaBands) {
        const shard = { bedrooms, houseTypes: [houseType], area };
        const areaCount = await countQuintoAndar(minTotalCost, maxTotalCost, shard);
        await jitteredDelay(250, 200);
        if (!areaCount) continue;
        shards.push({
          label: `beds=${bedrooms.min}-${bedrooms.max}|type=${houseType}|area=${area.min}-${area.max}`,
          ...shard,
          count: areaCount,
        });
      }
    }
  }

  return shards;
}

/**
 * @param {object} options
 */
async function collectShard({
  minTotalCost,
  maxTotalCost,
  shard,
  maxListings,
  seenIds,
  onListing,
  onProgress,
  pagesFetchedStart = 0,
  collectedStart = 0,
  reportedTotal,
  spec,
}) {
  let context = {
    mapShowing: false,
    listShowing: true,
    userId: null,
    deviceId: 'imoveis-analyzer',
  };

  const blocklist = [];
  const pageSize = 20;
  const chunkPauseEvery = 10;
  let page = 0;
  let pagesFetched = pagesFetchedStart;
  let collected = collectedStart;
  let shardCollected = 0;

  while (true) {
    if (maxListings && collected >= maxListings) break;

    const listData = await postSearch('/v2/search/list', {
      context,
      filters: {
        ...buildFilters({
          minTotalCost,
          maxTotalCost,
          blocklist,
          bedrooms: shard.bedrooms,
          houseTypes: shard.houseTypes,
          area: shard.area,
        }),
        pagination: {
          page,
          pageSize,
          offset: page * pageSize,
          pageHasChanged: page > 0,
        },
      },
    });

    if (page === 0 && listData.search_id) {
      context = { ...context, searchId: listData.search_id };
    }

    const hits = listData.hits?.hits || [];
    if (!hits.length) break;

    const newIds = hits
      .map((hit) => String(hit._id))
      .filter((id) => id && !seenIds.has(id) && !blocklist.includes(id));

    if (!newIds.length) break;

    await jitteredDelay(400, 500);
    const hydrated = await hydrateHouses(newIds.map(Number));
    const hydratedById = new Map(hydrated.map((house) => [String(house.id), house]));

    for (const id of newIds) {
      blocklist.push(id);
      const house = hydratedById.get(id);
      if (!house) continue;
      if (!passesLocalFilters(house, spec, minTotalCost, maxTotalCost)) continue;

      const accepted = await onListing(house);
      if (accepted) {
        collected += 1;
        shardCollected += 1;
      }
      if (maxListings && collected >= maxListings) break;
    }

    page += 1;
    pagesFetched += 1;
    await onProgress?.({
      page: pagesFetched,
      reportedTotal,
      collected,
      shard: shard.label,
      shardCollected,
      checkpoint: {
        page: pagesFetched,
        reportedTotal,
        shardIndex: shard.index,
        shardLabel: shard.label,
        pagesFetched,
        collected,
      },
    });

    if (page % chunkPauseEvery === 0) {
      await jitteredDelay(3500, 2500);
    } else {
      await jitteredDelay(900, 700);
    }
  }

  return { collected, pagesFetched, shardCollected };
}

/**
 * @param {object} options
 * @param {object} options.config
 * @param {object|null} [options.checkpoint]
 * @param {Set<string>} options.seenIds
 * @param {(listing: object) => Promise<boolean>} options.onListing
 * @param {(progress: object) => Promise<void>} [options.onProgress]
 */
export async function collectQuintoAndar({
  config,
  checkpoint,
  seenIds,
  onListing,
  onProgress,
}) {
  const { minTotalCost, maxTotalCost } = config;
  const sourceConfig = config.sources?.quintoandar || {};
  const maxListings = sourceConfig.maxListings ?? null;
  const spec = resolveSearchSpec(sourceConfig);

  const reportedTotal = checkpoint?.reportedTotal
    ?? await countQuintoAndar(minTotalCost, maxTotalCost, {
      bedrooms: { min: spec.minBedrooms, max: 10 },
      houseTypes: spec.houseTypes,
      area: { min: spec.minArea, max: 10000 },
    });

  const shards = await buildShards(minTotalCost, maxTotalCost, spec);

  console.log(`\nFiltros: tipo=${spec.houseTypes.join(',')} · ≥${spec.minBedrooms} quartos · ≥${spec.minArea} m²`);
  console.log(`Shards QuintoAndar: ${shards.length} (reportado: ${reportedTotal})`);
  for (const shard of shards) {
    console.log(`  - ${shard.label}: ${shard.count}`);
  }

  let collected = seenIds.size;
  let pagesFetched = checkpoint?.pagesFetched ?? 0;
  const startShardIndex = checkpoint?.shardIndex ?? 0;

  for (let i = startShardIndex; i < shards.length; i += 1) {
    if (maxListings && collected >= maxListings) break;

    const shard = { ...shards[i], index: i };
    process.stdout.write(`\n→ Shard ${i + 1}/${shards.length}: ${shard.label} (${shard.count})\n`);

    const result = await collectShard({
      minTotalCost,
      maxTotalCost,
      shard,
      maxListings,
      seenIds,
      onListing,
      onProgress,
      pagesFetchedStart: pagesFetched,
      collectedStart: collected,
      reportedTotal,
      spec,
    });

    collected = result.collected;
    pagesFetched = result.pagesFetched;

    await jitteredDelay(4000, 3000);
  }

  return {
    reportedTotal,
    pagesFetched,
    rawCount: collected,
  };
}
