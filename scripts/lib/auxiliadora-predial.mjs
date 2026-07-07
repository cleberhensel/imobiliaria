const BASE_URL = 'https://www.auxiliadorapredial.com.br/alugar/residencial/rs+porto-alegre';
const USER_AGENT = 'Mozilla/5.0 (compatible; imoveis-analyzer/0.1)';

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
  const response = await fetch(url, {
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

/**
 * @param {object} options
 * @param {number} options.maxTotalCost
 * @param {number|null} [options.maxListings]
 * @param {(page: number, total: number, collected: number) => void} [options.onProgress]
 */
export async function collectAuxiliadoraPredial({ maxTotalCost, maxListings = null, onProgress }) {
  const houses = new Map();
  let reportedTotal = 0;
  let totalPages = 1;
  let page = 1;

  while (page <= totalPages) {
    const html = await fetchSearchPage(page);
    const parsed = parseSearchPage(html);

    if (page === 1) {
      reportedTotal = parsed.totalItems;
      totalPages = parsed.totalPages || 1;
    }

    let added = 0;
    for (const item of parsed.listings) {
      if (!item?.codigo) continue;
      const totalCost = Number(item.valores?.valorTotal) || 0;
      if (!totalCost || totalCost > maxTotalCost) continue;

      const id = String(item.codigo);
      if (houses.has(id)) continue;
      houses.set(id, item);
      added += 1;

      if (maxListings && houses.size >= maxListings) break;
    }

    onProgress?.(page, reportedTotal, houses.size);

    if (maxListings && houses.size >= maxListings) break;
    if (!parsed.listings.length) break;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
