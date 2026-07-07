const BASE_URL = 'https://www.auxiliadorapredial.com.br/alugar/residencial/rs+porto-alegre';
const USER_AGENT = 'Mozilla/5.0 (compatible; imoveis-analyzer/0.2)';

import { inCostRange, jitteredDelay, withRetry } from './crawler-io.mjs';

/**
 * @param {string} html
 */
export function parseSearchPage(html) {
  const scripts = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)].map((s) => s[1]);
  const chunk = scripts.find((s) => s.includes('initialData'));
  if (!chunk) {
    return { listings: [], totalItems: 0, totalPages: 0 };
  }

  const raw = chunk.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const listings = extractJsonArray(raw, '"initialData":[');
  const totalItems = Number(raw.match(/"totalItems":(\d+)/)?.[1] || 0);
  const totalPages = Number(raw.match(/"totalPages":(\d+)/)?.[1] || 0);

  return { listings, totalItems, totalPages };
}

/**
 * @param {string} raw
 * @param {string} marker
 */
function extractJsonArray(raw, marker) {
  const start = raw.indexOf(marker);
  if (start < 0) return [];

  let depth = 0;
  let started = false;
  let out = '';

  for (let i = start + marker.length - 1; i < raw.length; i += 1) {
    const ch = raw[i];
    out += ch;
    if (ch === '[') {
      depth += 1;
      started = true;
    } else if (ch === ']') {
      depth -= 1;
      if (started && depth === 0) break;
    }
  }

  try {
    return JSON.parse(out);
  } catch {
    return [];
  }
}

/**
 * @param {number} page
 */
export async function fetchSearchPage(page = 1) {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));

  const url = params.size ? `${BASE_URL}?${params}` : BASE_URL;
  return withRetry(async () => {
    const response = await fetch(url, {
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

/**
 * @param {object} options
 * @param {object} options.config
 * @param {object|null} [options.checkpoint]
 * @param {Set<string>} options.seenIds
 * @param {(listing: object) => Promise<boolean>} options.onListing
 * @param {(progress: object) => Promise<void>} [options.onProgress]
 */
export async function collectAuxiliadoraPredial({
  config,
  checkpoint,
  seenIds,
  onListing,
  onProgress,
}) {
  const { minTotalCost, maxTotalCost } = config;
  const sourceConfig = config.sources?.['auxiliadora-predial'] || {};
  const maxListings = sourceConfig.maxListings ?? null;

  let reportedTotal = checkpoint?.reportedTotal ?? 0;
  let totalPages = checkpoint?.totalPages ?? 1;
  let page = checkpoint?.page ?? 1;
  let collected = seenIds.size;
  let emptyStreak = checkpoint?.emptyStreak ?? 0;

  while (page <= totalPages) {
    const html = await fetchSearchPage(page);
    const parsed = parseSearchPage(html);

    if (page === 1 && !checkpoint?.reportedTotal) {
      reportedTotal = parsed.totalItems;
      totalPages = parsed.totalPages || 1;
    }

    let added = 0;
    for (const item of parsed.listings) {
      if (!item?.codigo) continue;
      const totalCost = Number(item.valores?.valorTotal) || 0;
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
    if (!parsed.listings.length) break;
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
