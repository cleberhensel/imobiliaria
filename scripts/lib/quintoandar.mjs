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

import { jitteredDelay, withRetry } from './crawler-io.mjs';

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
 * @param {number} minTotalCost
 * @param {number} maxTotalCost
 * @param {string[]} blocklist
 */
function buildFilters(minTotalCost, maxTotalCost, blocklist) {
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
      area: { range: { min: 0, max: 10000 } },
      houseTypes: ['APARTMENT', 'HOUSE', 'HOUSE_CONDO', 'STUDIO'],
      bedrooms: { range: { min: 0, max: 10 } },
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
 */
export async function countQuintoAndar(minTotalCost, maxTotalCost) {
  const data = await postSearch('/v3/search/count', {
    context: {
      mapShowing: false,
      listShowing: true,
      userId: null,
      deviceId: 'imoveis-analyzer',
    },
    filters: {
      ...buildFilters(minTotalCost, maxTotalCost, []),
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

  const reportedTotal = checkpoint?.reportedTotal ?? await countQuintoAndar(minTotalCost, maxTotalCost);
  const targetTotal = maxListings ? Math.min(maxListings, reportedTotal) : reportedTotal;

  let context = checkpoint?.context || {
    mapShowing: false,
    listShowing: true,
    userId: null,
    deviceId: 'imoveis-analyzer',
  };

  const blocklist = [...(checkpoint?.blocklist || [])];
  const pageSize = 20;
  let page = checkpoint?.page ?? 0;
  let collected = seenIds.size;

  while (collected < targetTotal) {
    const listData = await postSearch('/v2/search/list', {
      context,
      filters: {
        ...buildFilters(minTotalCost, maxTotalCost, blocklist),
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

    const hydrated = await hydrateHouses(newIds.map(Number));
    const hydratedById = new Map(hydrated.map((house) => [String(house.id), house]));

    for (const id of newIds) {
      blocklist.push(id);
      const house = hydratedById.get(id);
      if (!house) continue;

      const totalCost = Number(house.totalCost) || 0;
      if (totalCost < minTotalCost || totalCost > maxTotalCost) continue;

      const accepted = await onListing(house);
      if (accepted) collected += 1;
      if (collected >= targetTotal) break;
    }

    page += 1;
    await onProgress?.({
      page,
      reportedTotal,
      collected,
      checkpoint: {
        page,
        reportedTotal,
        blocklist,
        context,
        pagesFetched: page,
      },
    });

    await jitteredDelay(250, 350);
  }

  return {
    reportedTotal,
    pagesFetched: page,
    rawCount: collected,
  };
}
