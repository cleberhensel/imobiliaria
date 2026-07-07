const SEARCH_URL = 'https://guarida.com.br/busca/alugar/residencial/porto-alegre-rs';
const API_URL = 'https://guarida.com.br/api/busca';
const USER_AGENT = 'Mozilla/5.0 (compatible; imoveis-analyzer/0.1)';

const BASE_PAYLOAD = {
  localizacao: 'porto-alegre-rs',
  negocio: 'alugar',
  finalidades: 'residencial',
  ordenacao: 'mais-relevantes',
  latitude: '0',
  longitude: '0',
  cidade: 'porto-alegre-rs',
};

/**
 * @param {string} html
 */
export function parseSearchPage(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    return { listings: [], pagination: null };
  }

  const data = JSON.parse(match[1]);
  const search = data?.props?.pageProps?.search;
  if (!search) {
    return { listings: [], pagination: null };
  }

  return {
    listings: search.imoveis || [],
    pagination: search.paginacao || null,
    filters: search.filtros?.ativos || [],
  };
}

/**
 * @param {Record<string, unknown>} overrides
 */
export async function fetchSearchApi(overrides = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Referer: SEARCH_URL,
    },
    body: JSON.stringify({ ...BASE_PAYLOAD, ...overrides }),
  });

  if (!response.ok) {
    throw new Error(`Falha na API Guarida: HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * @param {number} page
 */
export async function fetchSearchPage(page = 1) {
  if (page === 1) {
    const response = await fetch(SEARCH_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Falha ao buscar página ${page}: HTTP ${response.status}`);
    }

    return response.text();
  }

  return fetchSearchApi({ pagina: page });
}

/**
 * @param {object} options
 * @param {number} options.maxTotalCost
 * @param {number|null} [options.maxListings]
 * @param {(page: number, total: number, collected: number) => void} [options.onProgress]
 */
export async function collectGuarida({ maxTotalCost, maxListings = null, onProgress }) {
  const houses = new Map();
  let reportedTotal = 0;
  let totalPages = 1;
  let page = 1;

  while (page <= totalPages) {
    let listings = [];
    let pagination = null;

    if (page === 1) {
      const html = await fetchSearchPage(1);
      const parsed = parseSearchPage(html);
      listings = parsed.listings;
      pagination = parsed.pagination;
    } else {
      const result = await fetchSearchApi({ pagina: page });
      listings = result.imoveis || [];
      pagination = result.paginacao || null;
    }

    if (page === 1 && pagination) {
      reportedTotal = pagination.total || 0;
      totalPages = pagination.paginas || 1;
    }

    let added = 0;
    for (const item of listings) {
      if (!item?.codigo) continue;

      const totalCost = parseMoney(item.valores?.total);
      if (!totalCost || totalCost > maxTotalCost) continue;

      const id = String(item.codigo);
      if (houses.has(id)) continue;
      houses.set(id, item);
      added += 1;

      if (maxListings && houses.size >= maxListings) break;
    }

    onProgress?.(page, reportedTotal, houses.size);

    if (maxListings && houses.size >= maxListings) break;
    if (!listings.length) break;
    if (!pagination?.temProxima) break;
    if (!added && page > 3) break;

    page += 1;
    await sleep(300);
  }

  return {
    reportedTotal,
    pagesFetched: page,
    rawCount: houses.size,
    houses: [...houses.values()],
  };
}

/**
 * @param {string|number|null|undefined} value
 */
export function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/\D/g, '')) || 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
