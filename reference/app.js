const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const state = {
  catalog: null,
  filtered: [],
};

const els = {
  status: document.getElementById('status'),
  kpis: document.getElementById('kpis'),
  filtersPanel: document.getElementById('filters-panel'),
  content: document.getElementById('content'),
  kpiCount: document.getElementById('kpi-count'),
  kpiAvgTotal: document.getElementById('kpi-avg-total'),
  kpiAvgPpm: document.getElementById('kpi-avg-ppm'),
  kpiFurnished: document.getElementById('kpi-furnished'),
  kpiPets: document.getElementById('kpi-pets'),
  kpiParking: document.getElementById('kpi-parking'),
  neighbourhood: document.getElementById('filter-neighbourhood'),
  source: document.getElementById('filter-source'),
  type: document.getElementById('filter-type'),
  bedrooms: document.getElementById('filter-bedrooms'),
  furnished: document.getElementById('filter-furnished'),
  pets: document.getElementById('filter-pets'),
  search: document.getElementById('filter-search'),
  sortBy: document.getElementById('sort-by'),
  listingsBody: document.getElementById('listings-body'),
  neighbourhoodChart: document.getElementById('neighbourhood-chart'),
  visibleCount: document.getElementById('visible-count'),
  reloadBtn: document.getElementById('reload-btn'),
  fileInput: document.getElementById('file-input'),
  clearFilters: document.getElementById('clear-filters'),
};

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('error', isError);
}

function renderCatalog(catalog) {
  state.catalog = catalog;
  populateFilterOptions(catalog.listings, catalog.meta);
  applyFilters();

  const meta = catalog.meta;
  const summary = catalog.summary;
  setStatus(
    `Fonte: ${meta.source} · coletado em ${new Date(meta.collectedAt).toLocaleString('pt-BR')} · filtro total <= ${money.format(meta.filter.maxTotalCost)} · ${meta.matchedCount} no catálogo${meta.reportedTotal ? ` (${meta.reportedTotal} no QuintoAndar)` : ''}`,
  );

  els.kpiCount.textContent = String(catalog.listings.length);
  els.kpiAvgTotal.textContent = summary.totalCost.avg ? money.format(summary.totalCost.avg) : '—';
  els.kpiAvgPpm.textContent = summary.pricePerSqm.avg ? money.format(summary.pricePerSqm.avg) : '—';
  els.kpiFurnished.textContent = String(summary.furnished);
  els.kpiPets.textContent = String(summary.acceptsPets);
  els.kpiParking.textContent = String(summary.withParking);

  els.kpis.hidden = false;
  els.filtersPanel.hidden = false;
  els.content.hidden = false;
}

function populateFilterOptions(listings, meta) {
  const neighbourhoods = [...new Set(listings.map((l) => l.neighbourhood).filter(Boolean))].sort();
  const types = [...new Set(listings.map((l) => l.type).filter(Boolean))].sort();
  const sources = meta?.sources
    || [...new Set(listings.map((l) => ({ id: l.source, label: l.sourceLabel || l.source })))];
  const uniqueSources = [];
  const seen = new Set();
  for (const item of sources) {
    const id = typeof item === 'string' ? item : item.id;
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueSources.push(typeof item === 'string'
      ? { id: item, label: item }
      : item);
  }

  fillSelect(els.neighbourhood, neighbourhoods);
  fillSelect(els.type, types);
  fillSelect(els.source, uniqueSources.map((s) => s.label), uniqueSources.map((s) => s.id));
}

function fillSelect(select, values, optionValues = values) {
  const current = select.value;
  select.innerHTML = '<option value="">Todos</option>';
  values.forEach((value, index) => {
    const option = document.createElement('option');
    option.value = optionValues[index];
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = current;
}

function applyFilters() {
  if (!state.catalog) return;

  const neighbourhood = els.neighbourhood.value;
  const source = els.source.value;
  const type = els.type.value;
  const bedrooms = els.bedrooms.value;
  const furnished = els.furnished.value;
  const pets = els.pets.value;
  const search = els.search.value.trim().toLowerCase();

  state.filtered = state.catalog.listings.filter((item) => {
    if (neighbourhood && item.neighbourhood !== neighbourhood) return false;
    if (source && item.source !== source) return false;
    if (type && item.type !== type) return false;
    if (bedrooms && item.bedrooms < Number(bedrooms)) return false;
    if (furnished === 'yes' && !item.isFurnished) return false;
    if (furnished === 'no' && item.isFurnished) return false;
    if (pets === 'yes' && !item.acceptsPets) return false;
    if (pets === 'no' && item.acceptsPets) return false;
    if (search) {
      const haystack = `${item.title} ${item.street} ${item.neighbourhood}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  renderListings();
  renderNeighbourhoodChart();
}

function renderListings() {
  const [field, direction] = els.sortBy.value.split('-');
  const sorted = [...state.filtered].sort((a, b) => {
    const av = a[field] ?? 0;
    const bv = b[field] ?? 0;
    return direction === 'asc' ? av - bv : bv - av;
  });

  els.visibleCount.textContent = `${sorted.length} exibidos`;
  els.listingsBody.innerHTML = sorted.map(renderRow).join('');
}

function renderRow(item) {
  const flags = [];
  if (item.isFurnished) flags.push('<span class="flag">Mobiliado</span>');
  if (item.sourceLabel) flags.push(`<span class="flag">${escapeHtml(item.sourceLabel)}</span>`);
  if (item.acceptsPets) flags.push('<span class="flag">Pets</span>');
  if (item.parkingSpots > 0) flags.push(`<span class="flag">${item.parkingSpots} vaga(s)</span>`);
  if (item.condoIptu >= 800) flags.push('<span class="flag warn">Condo+IPTU alto</span>');

  return `
    <tr>
      <td class="title-cell">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <div class="muted">${escapeHtml(item.street || 'Endereço não informado')}</div>
      </td>
      <td>${escapeHtml(item.neighbourhood || '—')}</td>
      <td><strong>${money.format(item.totalCost)}</strong></td>
      <td>${money.format(item.rentPrice)}</td>
      <td>${item.area ?? '—'}</td>
      <td>${item.pricePerSqm ? money.format(item.pricePerSqm) : '—'}</td>
      <td>${item.bedrooms}/${item.parkingSpots}</td>
      <td><div class="flags">${flags.join('')}</div></td>
    </tr>
  `;
}

function renderNeighbourhoodChart() {
  const counts = {};
  for (const item of state.filtered) {
    const key = item.neighbourhood || 'Sem bairro';
    counts[key] = (counts[key] || 0) + 1;
  }

  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const max = rows[0]?.[1] || 1;
  els.neighbourhoodChart.innerHTML = rows.map(([name, count]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(name)} (${count})</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function loadDefaultCatalog() {
  setStatus('Carregando data/catalog.json...');
  const response = await fetch('/data/catalog.json');
  if (!response.ok) {
    throw new Error('Arquivo não encontrado. Rode npm run fetch:all ou npm run merge:catalogs');
  }
  return response.json();
}

async function bootstrap() {
  try {
    const catalog = await loadDefaultCatalog();
    renderCatalog(catalog);
  } catch (error) {
    setStatus(error.message, true);
  }
}

[
  els.neighbourhood,
  els.source,
  els.type,
  els.bedrooms,
  els.furnished,
  els.pets,
  els.search,
  els.sortBy,
].forEach((el) => el.addEventListener('input', applyFilters));

els.clearFilters.addEventListener('click', () => {
  els.neighbourhood.value = '';
  els.source.value = '';
  els.type.value = '';
  els.bedrooms.value = '';
  els.furnished.value = '';
  els.pets.value = '';
  els.search.value = '';
  applyFilters();
});

els.reloadBtn.addEventListener('click', bootstrap);

els.fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    renderCatalog(JSON.parse(text));
  } catch {
    setStatus('JSON inválido.', true);
  }
});

bootstrap();
