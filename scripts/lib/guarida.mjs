const SEARCH_URL = 'https://guarida.com.br/busca/alugar/residencial/porto-alegre-rs';
const API_URL = 'https://guarida.com.br/api/busca';
const USER_AGENT = 'Mozilla/5.0 (compatible; imoveis-analyzer/0.2)';

const BASE_PAYLOAD = {
  localizacao: 'porto-alegre-rs',
  negocio: 'alugar',
  finalidades: 'residencial',
  ordenacao: 'mais-relevantes',
  latitude: '0',
  longitude: '0',
  cidade: 'porto-alegre-rs',
};

import { inCostRange, jitteredDelay, withRetry } from './crawler-io.mjs';

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
  return withRetry(async () => {
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
      const error = new Error(`Falha na API Guarida: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }, {
    shouldRetry: (error) => error.status === 429 || (error.status >= 500),
  });
}

/**
 * @param {number} page
 */
export async function fetchSearchPage(page = 1) {
  if (page === 1) {
    return withRetry(async () => {
      const response = await fetch(SEARCH_URL, {
        headers: {
          Accept: 'text/html',
          'User-Agent': USER_AGENT,
        },
      });

      if (!response.ok) {
        const error = new Error(`Falha ao buscar página ${page}: HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.text();
    }, {
      shouldRetry: (error) => error.status === 429 || (error.status >= 500),
    });
  }

  return fetchSearchApi({ pagina: page });
}

/**
 * @param {string|number|null|undefined} value
 */
export function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/\D/g, '')) || 0;
}

/**
 * @param {object} options
 * @param {object} options.config
 * @param {object|null} [options.checkpoint]
 * @param {Set<string>} options.seenIds
 * @param {(listing: object) => Promise<boolean>} options.onListing
 * @param {(progress: object) => Promise<void>} [options.onProgress]
 */
export async function collectGuarida({
  config,
  checkpoint,
  seenIds,
  onListing,
  onProgress,
}) {
  const { minTotalCost, maxTotalCost } = config;
  const sourceConfig = config.sources?.guarida || {};
  const maxListings = sourceConfig.maxListings ?? null;

  let reportedTotal = checkpoint?.reportedTotal ?? 0;
  let totalPages = checkpoint?.totalPages ?? 1;
  let page = checkpoint?.page ?? 1;
  let collected = seenIds.size;
  let emptyStreak = checkpoint?.emptyStreak ?? 0;

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

    if (page === 1 && pagination && !checkpoint?.reportedTotal) {
      reportedTotal = pagination.total || 0;
      totalPages = pagination.paginas || 1;
    }

    let added = 0;
    for (const item of listings) {
      if (!item?.codigo) continue;

      const totalCost = parseMoney(item.valores?.total);
      if (!totalCost || !inCostRange(totalCost, minTotalCost, maxTotalCost)) continue;

      const id = String(item.codigo);
      if (seenIds.has(id)) continue;

      const accepted = await onListing(item);
      if (accepted) {
        added += 1;
        collected += 1;
      }

      if (maxListings && collected >= maxListings) break;
    }

    emptyStreak = added ? 0 : emptyStreak + 1;

    await onProgress?.({
      page,
      reportedTotal,
      collected,
      checkpoint: {
        page: page + 1,
        reportedTotal,
        totalPages,
        emptyStreak,
        pagesFetched: page,
      },
    });

    if (maxListings && collected >= maxListings) break;
    if (!listings.length) break;
    if (pagination && page > 1 && !pagination.temProxima) break;
    if (emptyStreak >= 3 && page > 3) break;

    page += 1;
    await jitteredDelay(300, 300);
  }

  return {
    reportedTotal,
    pagesFetched: page,
    rawCount: collected,
  };
}
