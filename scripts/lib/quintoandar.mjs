const API_BASE = 'https://apigw.prod.quintoandar.com.br/house-listing-search';
const USER_AGENT = 'Mozilla/5.0 (compatible; imoveis-analyzer/0.1)';

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

/**
 * @param {string} path
 * @param {object} body
 */
async function postSearch(path, body, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
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
    if (attempt === retries || response.status < 500) {
      throw new Error(`API ${path} falhou: HTTP ${response.status} — ${text.slice(0, 200)}`);
    }

    await sleep(500 * attempt);
  }

  throw new Error(`API ${path} falhou após ${retries} tentativas`);
}

/**
 * @param {number} maxTotalCost
 * @param {string[]} blocklist
 */
function buildFilters(maxTotalCost, blocklist) {
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
    priceRange: [{ min: 0, max: maxTotalCost, costType: 'TOTAL_COST' }],
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
 * @param {number} maxTotalCost
 */
export async function countQuintoAndar(maxTotalCost) {
  const data = await postSearch('/v3/search/count', {
    context: {
      mapShowing: false,
      listShowing: true,
      userId: null,
      deviceId: 'imoveis-analyzer',
    },
    filters: {
      ...buildFilters(maxTotalCost, []),
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
 * @param {number} options.maxTotalCost
 * @param {number|null} [options.maxListings]
 * @param {(page: number, total: number, collected: number) => void} [options.onProgress]
 */
export async function collectQuintoAndar({ maxTotalCost, maxListings = null, onProgress }) {
  const reportedTotal = await countQuintoAndar(maxTotalCost);
  const targetTotal = maxListings ? Math.min(maxListings, reportedTotal) : reportedTotal;

  let context = {
    mapShowing: false,
    listShowing: true,
    userId: null,
    deviceId: 'imoveis-analyzer',
  };

  const houses = new Map();
  const blocklist = [];
  const pageSize = 20;
  let page = 0;

  while (houses.size < targetTotal) {
    const listData = await postSearch('/v2/search/list', {
      context,
      filters: {
        ...buildFilters(maxTotalCost, blocklist),
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
      .filter((id) => id && !houses.has(id));

    if (!newIds.length) break;

    const hydrated = await hydrateHouses(newIds.map(Number));
    const hydratedById = new Map(hydrated.map((house) => [String(house.id), house]));

    for (const id of newIds) {
      blocklist.push(id);
      const house = hydratedById.get(id);
      if (!house) continue;
      if (Number(house.totalCost) > maxTotalCost) continue;
      houses.set(id, house);
      if (houses.size >= targetTotal) break;
    }

    onProgress?.(page + 1, reportedTotal, houses.size);

    page += 1;
    await sleep(250);
  }

  return {
    reportedTotal,
    pagesFetched: page,
    rawCount: houses.size,
    houses: [...houses.values()],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
