const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const TIERS = {
  core: { label: 'Núcleo central', score: 100, angle: 0 },
  near: { label: 'Adjacente', score: 75, angle: 60 },
  mid: { label: 'Intermediário', score: 50, angle: 120 },
  outer: { label: 'Periferia', score: 20, angle: 180 },
};

const NEIGHBOURHOOD_TIERS = {
  'Centro Histórico': 'core',
  'Cidade Baixa': 'core',
  'Bom Fim': 'core',
  'Menino Deus': 'core',
  Floresta: 'core',
  Independência: 'core',
  Azenha: 'core',
  'Praia de Belas': 'core',
  Petrópolis: 'near',
  'Rio Branco': 'near',
  Santana: 'near',
  'Moinhos de Vento': 'near',
  Navegantes: 'near',
  Farroupilha: 'near',
  'Mont Serrat': 'near',
  'Bela Vista': 'near',
  Auxiliadora: 'near',
  Cristal: 'near',
  'São Geraldo': 'near',
  Higienópolis: 'near',
  Glória: 'near',
  Cecília: 'near',
  Partenon: 'mid',
  Teresópolis: 'mid',
  'Alto Petrópolis': 'mid',
  'Jardim Botânico': 'mid',
  Humaitá: 'mid',
  "Passo d'Areia": 'mid',
  'Passo d`Areia': 'mid',
  'Passo da Areia': 'mid',
  'Passo D’areia': 'mid',
  'Passo d’Areia': 'mid',
  'Cristo Redentor': 'mid',
  Sarandi: 'mid',
  Nonoai: 'mid',
  Fátima: 'mid',
  'Vila Ipiranga': 'mid',
};

const PRIORITY_WEIGHTS = {
  apartment: 15,
  sacada: 25,
  sun: 25,
  sunWeak: 14,
  pets: 10,
  parking: 10,
};

const CENTRALITY_WEIGHT = 35;
const NEIGHBOURHOOD_STORAGE_KEY = 'imoveis-explorer:bairros';
const NEIGHBOURHOOD_URL_PARAM = 'bairro';

const COMPASS_LAYOUT = {
  'Centro Histórico': { x: 210, y: 210, r: 34 },
  'Cidade Baixa': { x: 250, y: 230, r: 28 },
  'Bom Fim': { x: 190, y: 170, r: 26 },
  'Menino Deus': { x: 260, y: 190, r: 26 },
  Petrópolis: { x: 160, y: 150, r: 30 },
  'Rio Branco': { x: 120, y: 190, r: 24 },
  Santana: { x: 150, y: 230, r: 24 },
  'Moinhos de Vento': { x: 170, y: 110, r: 22 },
  Navegantes: { x: 250, y: 140, r: 22 },
  Farroupilha: { x: 290, y: 170, r: 20 },
  Floresta: { x: 230, y: 260, r: 20 },
  Azenha: { x: 280, y: 250, r: 18 },
  Partenon: { x: 90, y: 250, r: 22 },
  Humaitá: { x: 70, y: 180, r: 18 },
  Teresópolis: { x: 100, y: 120, r: 18 },
  'Alto Petrópolis': { x: 130, y: 90, r: 16 },
  'Jardim Botânico': { x: 60, y: 140, r: 18 },
  'Bela Vista': { x: 310, y: 210, r: 18 },
  'São Geraldo': { x: 320, y: 250, r: 16 },
};

const state = {
  catalog: null,
  enriched: [],
  filtered: [],
  preset: 'focus',
  selectedTier: '',
  selectedNeighbourhoods: new Set(),
  neighbourhoodSearch: '',
  selectedSources: new Set(),
  pinned: new Set(),
  view: 'cards',
  photoIndexById: new Map(),
  galleryExpandedById: new Map(),
};

const els = {
  status: document.getElementById('status'),
  funnel: document.getElementById('funnel'),
  dashboard: document.getElementById('dashboard'),
  resultsHead: document.getElementById('results-head'),
  resultsTitle: document.getElementById('results-title'),
  resultsSubtitle: document.getElementById('results-subtitle'),
  cards: document.getElementById('cards'),
  empty: document.getElementById('empty'),
  tierFilters: document.getElementById('tier-filters'),
  neighbourhoodFilters: document.getElementById('neighbourhood-filters'),
  neighbourhoodSearch: document.getElementById('neighbourhood-search'),
  neighbourhoodHint: document.getElementById('neighbourhood-hint'),
  neighbourhoodClear: document.getElementById('neighbourhood-clear'),
  neighbourhoodCentral: document.getElementById('neighbourhood-central'),
  sourceFilters: document.getElementById('source-filters'),
  sortBy: document.getElementById('sort-by'),
  priorityApartment: document.getElementById('priority-apartment'),
  prioritySacada: document.getElementById('priority-sacada'),
  prioritySun: document.getElementById('priority-sun'),
  priorityPets: document.getElementById('priority-pets'),
  priorityParking: document.getElementById('priority-parking'),
  scatter: document.getElementById('scatter'),
  compass: document.getElementById('compass'),
  compareBtn: document.getElementById('compare-btn'),
  compareCount: document.getElementById('compare-count'),
  clearPins: document.getElementById('clear-pins'),
  reloadBtn: document.getElementById('reload-btn'),
  fileInput: document.getElementById('file-input'),
  detailDialog: document.getElementById('detail-dialog'),
  detailContent: document.getElementById('detail-content'),
  detailClose: document.getElementById('detail-close'),
  compareDialog: document.getElementById('compare-dialog'),
  compareContent: document.getElementById('compare-content'),
  compareClose: document.getElementById('compare-close'),
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getTier(neighbourhood) {
  if (!neighbourhood) return 'outer';
  if (NEIGHBOURHOOD_TIERS[neighbourhood]) return NEIGHBOURHOOD_TIERS[neighbourhood];

  const norm = normalizeText(neighbourhood);
  for (const [name, tier] of Object.entries(NEIGHBOURHOOD_TIERS)) {
    if (normalizeText(name) === norm) return tier;
  }

  for (const [name, tier] of Object.entries(NEIGHBOURHOOD_TIERS)) {
    const key = normalizeText(name).slice(0, 5);
    if (key.length >= 4 && norm.includes(key)) return tier;
  }

  return 'outer';
}

function collectSignals(listing) {
  const amenities = [...(listing.amenities || []), ...(listing.installations || [])];
  const title = listing.title || '';
  const amenText = amenities.join(' ');
  const haystack = normalizeText(`${title} ${amenText}`);

  const sacada = /sacada|varanda|balcon|varanda_gourmet/.test(haystack);
  const sunStrong = /sol da manha|sol da tarde|luminosidade|insolacao|nascente|poente|pega sol|muito sol|sol o dia/.test(haystack);
  const sunWeak = !sunStrong && /(?:^|[\s_])sol(?:[\s_]|$)|sol da|claridade|iluminad/.test(haystack)
    && !/solteiro|consol/.test(haystack);

  const sunTags = amenities.filter((tag) => /sol|lumin|nascente|poente|insol|clar/i.test(tag)
    && !/solteiro|consol/i.test(tag));

  const balconyTags = amenities.filter((tag) => /sacada|varanda|balcon/i.test(tag));

  return {
    sacada,
    sun: sunStrong || sunWeak,
    sunStrong,
    sunWeak,
    sunTags,
    balconyTags,
  };
}

function enrichListing(listing) {
  const tier = getTier(listing.neighbourhood);
  const signals = collectSignals(listing);
  const centralityScore = TIERS[tier].score;
  const featureScore = (signals.sacada ? 35 : 0)
    + (signals.sunStrong ? 35 : signals.sunWeak ? 18 : 0)
    + (signals.balconyTags.length ? 5 : 0)
    + (signals.sunTags.length ? 5 : 0);
  const fitScore = featureScore + Math.round(centralityScore * 0.35);

  return {
    ...listing,
    photoUrls: Array.isArray(listing.photoUrls) && listing.photoUrls.length
      ? listing.photoUrls
      : listing.photoUrl
        ? [listing.photoUrl]
        : [],
    tier,
    tierLabel: TIERS[tier].label,
    centralityScore,
    signals,
    featureScore,
    fitScore,
    isApartment: /apart/i.test(listing.type || listing.title || ''),
  };
}

function getActivePriorities() {
  return {
    apartment: els.priorityApartment.checked,
    sacada: els.prioritySacada.checked,
    sun: els.prioritySun.checked,
    pets: els.priorityPets.checked,
    parking: els.priorityParking.checked,
  };
}

function matchesPriority(item, key) {
  if (key === 'apartment') return item.isApartment;
  if (key === 'sacada') return item.signals.sacada;
  if (key === 'sun') return item.signals.sun;
  if (key === 'pets') return item.acceptsPets;
  if (key === 'parking') return item.parkingSpots > 0;
  return false;
}

function computeAdherence(item, priorities) {
  let earned = Math.round(item.centralityScore * (CENTRALITY_WEIGHT / 100));
  let max = CENTRALITY_WEIGHT;

  if (priorities.apartment) {
    max += PRIORITY_WEIGHTS.apartment;
    if (item.isApartment) earned += PRIORITY_WEIGHTS.apartment;
  }
  if (priorities.sacada) {
    max += PRIORITY_WEIGHTS.sacada;
    if (item.signals.sacada) earned += PRIORITY_WEIGHTS.sacada;
  }
  if (priorities.sun) {
    max += PRIORITY_WEIGHTS.sun;
    if (item.signals.sunStrong) earned += PRIORITY_WEIGHTS.sun;
    else if (item.signals.sunWeak) earned += PRIORITY_WEIGHTS.sunWeak;
  }
  if (priorities.pets) {
    max += PRIORITY_WEIGHTS.pets;
    if (item.acceptsPets) earned += PRIORITY_WEIGHTS.pets;
  }
  if (priorities.parking) {
    max += PRIORITY_WEIGHTS.parking;
    if (item.parkingSpots > 0) earned += PRIORITY_WEIGHTS.parking;
  }

  const adherenceScore = max ? Math.round((earned / max) * 100) : item.fitScore;
  const activeKeys = Object.entries(priorities).filter(([, active]) => active).map(([key]) => key);
  const matchedCount = activeKeys.filter((key) => matchesPriority(item, key)).length;
  const matchesAllPriorities = activeKeys.length > 0 && matchedCount === activeKeys.length;

  return {
    adherenceScore,
    matchedCount,
    activeCount: activeKeys.length,
    matchesAllPriorities,
  };
}

function applyPreset() {
  if (state.preset === 'focus') {
    els.priorityApartment.checked = true;
    els.prioritySacada.checked = true;
    els.prioritySun.checked = true;
    els.priorityPets.checked = false;
    els.priorityParking.checked = false;
    state.selectedTier = '';
    els.sortBy.value = 'fit-desc';
  } else if (state.preset === 'relaxed') {
    els.priorityApartment.checked = true;
    els.prioritySacada.checked = true;
    els.prioritySun.checked = false;
    els.priorityPets.checked = false;
    els.priorityParking.checked = false;
    state.selectedTier = '';
    els.sortBy.value = 'fit-desc';
  }
}

function passesFilters(item) {
  if (state.selectedTier && item.tier !== state.selectedTier) return false;
  if (state.selectedNeighbourhoods.size) {
    const name = item.neighbourhood || 'Sem bairro';
    if (!state.selectedNeighbourhoods.has(name)) return false;
  }
  if (state.selectedSources.size && !state.selectedSources.has(item.source)) return false;
  return true;
}

function sortListings(listings) {
  const [field, direction] = els.sortBy.value.split('-');
  return [...listings].sort((a, b) => {
    if (field === 'fit') {
      return direction === 'asc'
        ? a.adherenceScore - b.adherenceScore
        : b.adherenceScore - a.adherenceScore;
    }
    if (field === 'centrality') {
      return direction === 'asc'
        ? a.centralityScore - b.centralityScore
        : b.centralityScore - a.centralityScore;
    }
    const av = a[field] ?? 0;
    const bv = b[field] ?? 0;
    return direction === 'asc' ? av - bv : bv - av;
  });
}

function applyFilters() {
  if (!state.catalog) return;

  const priorities = getActivePriorities();
  state.filtered = sortListings(
    state.enriched
      .filter(passesFilters)
      .map((item) => ({
        ...item,
        ...computeAdherence(item, priorities),
      })),
  );
  renderAll();
}

function markCustomPreset() {
  state.preset = 'custom';
  document.querySelectorAll('.preset').forEach((el) => el.classList.remove('active'));
  document.querySelector('[data-preset="custom"]')?.classList.add('active');
}

function readNeighbourhoodsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.getAll(NEIGHBOURHOOD_URL_PARAM).filter(Boolean);
}

function readNeighbourhoodsFromSession() {
  try {
    const raw = sessionStorage.getItem(NEIGHBOURHOOD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeNeighbourhoodsToSession(names) {
  sessionStorage.setItem(NEIGHBOURHOOD_STORAGE_KEY, JSON.stringify(names));
}

function writeNeighbourhoodsToUrl(names) {
  const url = new URL(window.location.href);
  url.searchParams.delete(NEIGHBOURHOOD_URL_PARAM);
  for (const name of names) url.searchParams.append(NEIGHBOURHOOD_URL_PARAM, name);
  history.replaceState({ bairros: names }, '', url);
}

function persistNeighbourhoodSelection() {
  const names = [...state.selectedNeighbourhoods].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  writeNeighbourhoodsToSession(names);
  writeNeighbourhoodsToUrl(names);
}

function restoreNeighbourhoodSelection() {
  const fromUrl = readNeighbourhoodsFromUrl();
  const stored = fromUrl.length ? fromUrl : readNeighbourhoodsFromSession();
  const known = new Set(getNeighbourhoodOptions().map((option) => option.name));
  const valid = stored.filter((name) => known.has(name));

  state.selectedNeighbourhoods = new Set(valid);

  if (stored.length && valid.length !== stored.length) {
    persistNeighbourhoodSelection();
  }
}

function updateNeighbourhoodSelection(mutator) {
  mutator();
  persistNeighbourhoodSelection();
  markCustomPreset();
  applyFilters();
}

function getNeighbourhoodOptions() {
  const counts = {};
  for (const item of state.enriched) {
    const name = item.neighbourhood || 'Sem bairro';
    counts[name] = (counts[name] || 0) + 1;
  }

  const tierOrder = { core: 0, near: 1, mid: 2, outer: 3 };
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, tier: getTier(name) }))
    .sort((a, b) => {
      const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
      if (tierDiff !== 0) return tierDiff;
      return b.count - a.count || a.name.localeCompare(b.name, 'pt-BR');
    });
}

function renderNeighbourhoodFilters() {
  const query = normalizeText(state.neighbourhoodSearch);
  const options = getNeighbourhoodOptions().filter((option) => {
    if (!query) return true;
    return normalizeText(option.name).includes(query);
  });

  const selectedCount = state.selectedNeighbourhoods.size;
  els.neighbourhoodHint.textContent = selectedCount
    ? `${selectedCount} bairro(s) selecionado(s)`
    : 'Nenhum selecionado = todos';

  els.neighbourhoodFilters.innerHTML = options.map((option) => `
    <label class="neighbourhood-option">
      <input
        type="checkbox"
        value="${escapeHtml(option.name)}"
        ${state.selectedNeighbourhoods.has(option.name) ? 'checked' : ''}
      />
      <span class="neighbourhood-name">${escapeHtml(option.name)}</span>
      <span class="neighbourhood-count">${option.count}</span>
      <span class="neighbourhood-tier ${option.tier}">${escapeHtml(TIERS[option.tier].label)}</span>
    </label>
  `).join('') || '<p class="neighbourhood-empty">Nenhum bairro encontrado.</p>';

  els.neighbourhoodFilters.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      updateNeighbourhoodSelection(() => {
        if (input.checked) state.selectedNeighbourhoods.add(input.value);
        else state.selectedNeighbourhoods.delete(input.value);
      });
    });
  });
}

function renderAll() {
  renderFunnel();
  renderNeighbourhoodFilters();
  renderCompass();
  renderScatter();
  renderCards();
  updateResultsHead();
  els.dashboard.hidden = false;
  els.resultsHead.hidden = false;
  els.cards.hidden = state.filtered.length === 0;
  els.empty.hidden = state.filtered.length !== 0;
}

function renderFunnel() {
  const all = state.enriched;
  const priorities = getActivePriorities();
  const apartments = all.filter((item) => item.isApartment);
  const central = all.filter((item) => ['core', 'near', 'mid'].includes(item.tier));
  const withSacada = all.filter((item) => item.signals.sacada);
  const withSun = all.filter((item) => item.signals.sun);
  const highAdherence = state.filtered.filter((item) => item.matchesAllPriorities).length;
  const visible = state.filtered.length;
  const steps = [
    ['Catálogo', all.length],
    ['Apartamentos', apartments.length],
    ['Centrais', central.length],
    ['Com sacada', withSacada.length],
    ['Com sol', withSun.length],
    ['No recorte', visible],
    ['Alta aderência', highAdherence],
  ];
  const max = steps[0][1] || 1;

  els.funnel.hidden = false;
  els.funnel.innerHTML = steps.map(([label, count]) => `
    <article class="funnel-step" style="--fill:${(count / max).toFixed(3)}">
      <span>${label}</span>
      <strong>${count}</strong>
    </article>
  `).join('');
}

function renderTierFilters() {
  const counts = Object.fromEntries(Object.keys(TIERS).map((tier) => [tier, 0]));
  for (const item of state.enriched) counts[item.tier] += 1;

  els.tierFilters.innerHTML = Object.entries(TIERS).map(([tier, meta]) => `
    <button type="button" class="tier-btn ${state.selectedTier === tier ? 'active' : ''}" data-tier="${tier}">
      <span>${meta.label}</span>
      <small>${counts[tier] || 0}</small>
    </button>
  `).join('');

  els.tierFilters.querySelectorAll('[data-tier]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTier = state.selectedTier === button.dataset.tier ? '' : button.dataset.tier;
      markCustomPreset();
      renderTierFilters();
      applyFilters();
    });
  });
}

function renderSourceFilters() {
  const sources = state.catalog.meta?.sources
    || [...new Map(state.enriched.map((item) => [item.source, item.sourceLabel])).entries()]
      .map(([id, label]) => ({ id, label }));

  els.sourceFilters.innerHTML = sources.map((source) => `
    <button type="button" class="chip ${state.selectedSources.has(source.id) ? 'active' : ''}" data-source="${source.id}">
      ${escapeHtml(source.label || source.id)}
    </button>
  `).join('');

  els.sourceFilters.querySelectorAll('[data-source]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.source;
      if (state.selectedSources.has(id)) state.selectedSources.delete(id);
      else state.selectedSources.add(id);
      markCustomPreset();
      renderSourceFilters();
      applyFilters();
    });
  });
}

function renderCompass() {
  const counts = {};
  for (const item of state.filtered) {
    const key = item.neighbourhood || 'Sem bairro';
    counts[key] = (counts[key] || 0) + 1;
  }

  const nodes = Object.entries(COMPASS_LAYOUT).map(([name, layout]) => {
    const count = counts[name] || 0;
    const tier = getTier(name);
    const radius = layout.r + Math.min(count, 12) * 1.2;
    const fill = tier === 'core' ? '#f5a623' : tier === 'near' ? '#ffd166' : tier === 'mid' ? '#3ecfbd' : '#667085';
    const active = state.selectedNeighbourhoods.has(name) ? 'active' : '';
    return `
      <g class="compass-node ${active}" data-neighbourhood="${escapeHtml(name)}" transform="translate(${layout.x}, ${layout.y})">
        <circle r="${radius}" fill="${fill}" opacity="${count ? 0.85 : 0.18}"></circle>
        <text text-anchor="middle" y="4" fill="#10131a" font-size="${count ? 11 : 9}" font-weight="700">${count || ''}</text>
        <text text-anchor="middle" y="${radius + 14}" fill="#d7dde7" font-size="10">${escapeHtml(shortName(name))}</text>
      </g>
    `;
  }).join('');

  els.compass.innerHTML = `
    <rect width="420" height="420" fill="#121722" rx="24"></rect>
    <circle cx="210" cy="210" r="170" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"></circle>
    <circle cx="210" cy="210" r="120" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"></circle>
    <circle cx="210" cy="210" r="70" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"></circle>
    <text x="210" y="24" text-anchor="middle" fill="#9aa3b2" font-size="11">N</text>
    ${nodes}
  `;

  els.compass.querySelectorAll('[data-neighbourhood]').forEach((node) => {
    node.addEventListener('click', () => {
      const name = node.dataset.neighbourhood;
      updateNeighbourhoodSelection(() => {
        if (state.selectedNeighbourhoods.has(name)) state.selectedNeighbourhoods.delete(name);
        else state.selectedNeighbourhoods.add(name);
      });
    });
  });
}

function renderScatter() {
  const canvas = els.scatter;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const items = state.filtered.length ? state.filtered : state.enriched.filter((item) => item.isApartment);
  const prices = items.map((item) => item.totalCost).filter(Boolean);
  const minPrice = Math.min(...prices, 800);
  const maxPrice = Math.max(...prices, 4500);

  ctx.fillStyle = '#121722';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let i = 1; i <= 4; i += 1) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(width - 12, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#9aa3b2';
  ctx.font = '11px sans-serif';
  ctx.fillText('Centralidade →', width - 118, height - 10);
  ctx.save();
  ctx.translate(16, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Total (R$)', 0, 0);
  ctx.restore();

  for (const item of items) {
    const x = 48 + ((item.centralityScore - 10) / 90) * (width - 72);
    const y = height - 24 - ((item.totalCost - minPrice) / (maxPrice - minPrice || 1)) * (height - 48);
    const score = item.adherenceScore ?? item.fitScore;
    const radius = score >= 80 ? 7 : score >= 55 ? 5.5 : 4;
    const color = score >= 80 ? '#f5a623' : score >= 55 ? '#3ecfbd' : '#667085';

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.globalAlpha = state.filtered.includes(item) ? 0.95 : 0.25;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function renderCards() {
  els.cards.classList.toggle('compact', state.view === 'compact');
  els.cards.innerHTML = state.filtered.map((item) => renderCard(item)).join('');
  bindCardGalleries();
  els.cards.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openDetail(button.dataset.open));
  });
  els.cards.querySelectorAll('[data-pin]').forEach((button) => {
    button.addEventListener('click', () => togglePin(button.dataset.pin));
  });
}

function renderPriorityMatches(item) {
  const priorities = getActivePriorities();
  const labels = {
    apartment: 'Apto',
    sacada: 'Sacada',
    sun: 'Sol',
    pets: 'Pets',
    parking: 'Vaga',
  };

  return Object.entries(priorities)
    .filter(([, active]) => active)
    .map(([key]) => {
      const on = matchesPriority(item, key);
      return `<span class="priority-match ${on ? 'on' : 'off'}">${labels[key]}</span>`;
    })
    .join('');
}

function getPhotoUrls(item) {
  return item.photoUrls?.length ? item.photoUrls : item.photoUrl ? [item.photoUrl] : [];
}

function getPhotoIndex(itemId) {
  return state.photoIndexById.get(itemId) || 0;
}

function setPhotoIndex(itemId, index) {
  state.photoIndexById.set(itemId, index);
}

function isGalleryExpanded(itemId) {
  return state.galleryExpandedById.get(itemId) === true;
}

function setGalleryExpanded(itemId, expanded) {
  if (expanded) state.galleryExpandedById.set(itemId, true);
  else state.galleryExpandedById.delete(itemId);
}

function renderGalleryCloseButton(itemId) {
  return `
    <button
      type="button"
      class="gallery-close glass-control"
      data-gallery-back="${itemId}"
      aria-label="Voltar aos dados completos"
      title="Voltar aos dados"
    >✕</button>
  `;
}

function renderCardGallery(item) {
  const photos = getPhotoUrls(item);
  const index = getPhotoIndex(item.id);
  const safeIndex = photos.length ? index % photos.length : 0;
  const current = photos[safeIndex] || null;

  return `
    <div class="card-gallery">
      <div class="gallery-stage">
        ${current
    ? `<img class="gallery-image" src="${current}" alt="" loading="lazy" />`
    : '<div class="placeholder">Sem foto</div>'}
      </div>
    </div>
  `;
}

function renderGalleryControls(item) {
  const photos = getPhotoUrls(item);
  const index = getPhotoIndex(item.id);
  const safeIndex = photos.length ? index % photos.length : 0;
  const hasNav = photos.length > 1;

  if (!hasNav) return '';

  return `
    <div class="gallery-controls">
      <button type="button" class="gallery-nav prev glass-control" data-gallery-prev="${item.id}" aria-label="Foto anterior">‹</button>
      <button type="button" class="gallery-nav next glass-control" data-gallery-next="${item.id}" aria-label="Próxima foto">›</button>
      <span class="gallery-counter glass-control">${safeIndex + 1}/${photos.length}</span>
    </div>
  `;
}

function applyCardGalleryLayout(card, itemId) {
  const expanded = isGalleryExpanded(itemId);
  card.classList.toggle('gallery-focus', expanded);
  const footer = card.querySelector('.card-glass-footer');
  if (footer) footer.hidden = !expanded;
}

function collapseGalleryData(card, itemId) {
  setGalleryExpanded(itemId, false);
  applyCardGalleryLayout(card, itemId);
}

function swapImageWithTransition(image, nextSrc, direction = 1) {
  if (!image || !nextSrc) return;

  const animClass = direction >= 0 ? 'gallery-enter-next' : 'gallery-enter-prev';
  image.classList.remove('gallery-enter-next', 'gallery-enter-prev', 'gallery-fade-out');
  image.classList.add('gallery-fade-out');

  window.setTimeout(() => {
    image.src = nextSrc;
    image.classList.remove('gallery-fade-out');
    image.classList.add(animClass);
    window.setTimeout(() => image.classList.remove(animClass), 360);
  }, 140);
}

function swapGalleryImage(card, nextSrc, direction = 1) {
  swapImageWithTransition(card.querySelector('.gallery-image'), nextSrc, direction);
}

function updateCardGallery(card, item, nextIndex, direction = 1) {
  const photos = getPhotoUrls(item);
  if (!photos.length) return;

  const index = ((nextIndex % photos.length) + photos.length) % photos.length;
  const prevIndex = getPhotoIndex(item.id);
  if (index === prevIndex) return;

  setPhotoIndex(item.id, index);
  swapGalleryImage(card, photos[index], index > prevIndex ? 1 : -1);

  const counter = card.querySelector('.gallery-counter');
  if (counter) counter.textContent = `${index + 1}/${photos.length}`;
}

function renderCard(item) {
  const pinned = state.pinned.has(item.id);
  const score = item.adherenceScore ?? item.fitScore;
  const galleryExpanded = isGalleryExpanded(item.id);
  const adherenceClass = item.matchesAllPriorities
    ? 'adherence-high'
    : item.matchedCount > 0
      ? 'adherence-partial'
      : '';
  const scoreClass = item.matchesAllPriorities
    ? ''
    : item.matchedCount > 0
      ? 'partial'
      : 'low';
  const tags = [
    `<span class="tag core">${escapeHtml(item.tierLabel)}</span>`,
    item.signals.sacada ? '<span class="tag balcony">Sacada</span>' : '',
    item.signals.sun ? `<span class="tag sun">${item.signals.sunStrong ? 'Sol confirmado' : 'Sol provável'}</span>` : '',
    item.acceptsPets ? '<span class="tag">Pets</span>' : '',
    item.parkingSpots > 0 ? `<span class="tag">${item.parkingSpots} vaga(s)</span>` : '',
    `<span class="tag">${escapeHtml(item.sourceLabel || item.source)}</span>`,
  ].filter(Boolean).join('');

  return `
    <article class="card ${state.view === 'compact' ? 'compact-row' : ''} ${pinned ? 'pinned' : ''} ${adherenceClass} ${galleryExpanded ? 'gallery-focus' : ''}" data-listing-id="${item.id}">
      <div class="card-media">
        ${renderCardGallery(item)}
      </div>
      <div class="card-image-zone">
        <div class="card-score glass-control ${scoreClass}">${score}% aderência</div>
        ${renderGalleryControls(item)}
      </div>
      <div class="card-data-sheet glass-panel">
        <div class="card-body-full">
          <div class="card-top">
            <h3><a href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>
          </div>
          <div class="card-body-grid">
            ${renderCardInfo(item)}
            <div class="card-costs">
              <p class="costs-title">Custos mensais</p>
              ${renderCostGrid(item)}
            </div>
          </div>
          <div class="card-meta-row">
            <div class="priority-matches">${renderPriorityMatches(item)}</div>
            <div class="tag-row">${tags}</div>
          </div>
          <div class="card-actions">
            <button type="button" class="glass-control" data-open="${item.id}">Detalhes</button>
            <button type="button" class="glass-control" data-pin="${item.id}">${pinned ? 'Remover pin' : 'Fixar comparar'}</button>
          </div>
        </div>
      </div>
      <div class="card-glass-footer glass-panel" ${galleryExpanded ? '' : 'hidden'}>
        <div class="compact-copy">
          <span class="compact-address">${escapeHtml(formatLogradouro(item))}</span>
          <span class="compact-neighbourhood">${escapeHtml(item.neighbourhood || 'Sem bairro')}</span>
        </div>
        <strong class="compact-total">${money.format(item.totalCost)}</strong>
        ${renderGalleryCloseButton(item.id)}
      </div>
    </article>
  `;
}

function bindCardGalleries() {
  for (const item of state.filtered) {
    const card = els.cards.querySelector(`[data-listing-id="${item.id}"]`);
    if (!card) continue;
    applyCardGalleryLayout(card, item.id);
  }
}

function updateResultsHead() {
  const avg = average(state.filtered.map((item) => item.totalCost));
  const avgFit = average(state.filtered.map((item) => item.adherenceScore ?? item.fitScore));
  const high = state.filtered.filter((item) => item.matchesAllPriorities).length;
  els.resultsTitle.textContent = `${state.filtered.length} imóveis no recorte`;
  els.resultsSubtitle.textContent = state.filtered.length
    ? `Média total ${money.format(avg)} · aderência média ${Math.round(avgFit)}% · ${high} com match total · ${presetLabel()}`
    : 'Ajuste bairros, centralidade ou imobiliária.';
}

function presetLabel() {
  if (state.preset === 'focus') return 'Foco: apto + sacada + sol';
  if (state.preset === 'relaxed') return 'Ampliado: apto + sacada';
  return 'Personalizado';
}

function renderDetailGallery(item, scoreClass, score) {
  const photos = getPhotoUrls(item);
  const index = getPhotoIndex(item.id);
  const safeIndex = photos.length ? index % photos.length : 0;
  const current = photos[safeIndex] || null;
  const hasNav = photos.length > 1;

  return `
    <div class="detail-gallery" data-detail-gallery="${item.id}">
      <div class="detail-gallery-stage">
        ${current
    ? `<img class="detail-gallery-image gallery-image" src="${current}" alt="" />`
    : '<div class="detail-gallery-empty">Sem foto</div>'}
        ${hasNav ? `
          <button type="button" class="detail-gallery-nav prev glass-control" data-detail-prev="${item.id}" aria-label="Foto anterior">‹</button>
          <button type="button" class="detail-gallery-nav next glass-control" data-detail-next="${item.id}" aria-label="Próxima foto">›</button>
          <span class="detail-gallery-counter glass-control">${safeIndex + 1}/${photos.length}</span>
        ` : ''}
        <span class="detail-score glass-control ${scoreClass}">${score}% aderência</span>
      </div>
      ${hasNav ? `
        <div class="detail-thumbs" role="tablist" aria-label="Miniaturas">
          ${photos.map((url, thumbIndex) => `
            <button
              type="button"
              class="detail-thumb ${thumbIndex === safeIndex ? 'active' : ''}"
              data-detail-thumb="${item.id}"
              data-thumb-index="${thumbIndex}"
              aria-label="Foto ${thumbIndex + 1}"
              role="tab"
              aria-selected="${thumbIndex === safeIndex ? 'true' : 'false'}"
            >
              <img src="${url}" alt="" loading="lazy" />
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderDetailTable(rows) {
  return `
    <table class="detail-table">
      <tbody>
        ${rows.map(([label, value]) => `
          <tr>
            <th scope="row">${escapeHtml(label)}</th>
            <td>${value}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderDetailSpecTable(item) {
  return renderDetailTable([
    ['Quartos', escapeHtml(String(item.bedrooms || '—'))],
    ['Banheiros', escapeHtml(String(item.bathrooms || '—'))],
    ['Área', item.area ? `${item.area} m²` : '—'],
    ['R$/m²', item.pricePerSqm ? money.format(item.pricePerSqm) : '—'],
    ['Vagas', escapeHtml(String(item.parkingSpots || '—'))],
    ['Fonte', escapeHtml(item.sourceLabel || item.source)],
  ]);
}

function renderDetailCostTable(item) {
  const lines = getCostLines(item);

  return `
    <table class="detail-table detail-table-costs">
      <tbody>
        ${lines.map((line) => `
          <tr class="${line.total ? 'total' : ''} ${line.extra ? 'extra' : ''} ${line.muted ? 'muted' : ''}">
            <th scope="row">${escapeHtml(line.label)}</th>
            <td>${formatMoneyValue(line.amount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderDetailSignals(item) {
  const signals = [
    ...(item.signals.balconyTags.length ? item.signals.balconyTags : []),
    ...(item.signals.sunTags.length ? item.signals.sunTags : []),
    item.signals.sacada && !item.signals.balconyTags.length ? ['sacada (título/descrição)'] : [],
    item.signals.sun && !item.signals.sunTags.length ? ['sol (título/descrição)'] : [],
  ].flat();

  if (!signals.length) return '';

  return `
    <div class="detail-block glass-panel subtle">
      <p class="detail-section-label">Sinais detectados</p>
      <p class="detail-signals-copy">${signals.map(escapeHtml).join(' · ')}</p>
    </div>
  `;
}

function updateDetailGallery(item, nextIndex, direction = 1) {
  const photos = getPhotoUrls(item);
  if (!photos.length) return;

  const index = ((nextIndex % photos.length) + photos.length) % photos.length;
  const prevIndex = getPhotoIndex(item.id);
  if (index === prevIndex) return;

  setPhotoIndex(item.id, index);

  const root = els.detailContent.querySelector(`[data-detail-gallery="${item.id}"]`);
  if (!root) return;

  swapImageWithTransition(root.querySelector('.detail-gallery-image'), photos[index], index > prevIndex ? 1 : -1);

  const counter = root.querySelector('.detail-gallery-counter');
  if (counter) counter.textContent = `${index + 1}/${photos.length}`;

  root.querySelectorAll('.detail-thumb').forEach((button, thumbIndex) => {
    const active = thumbIndex === index;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function openDetail(id) {
  const item = state.enriched.find((entry) => entry.id === id);
  if (!item) return;

  const score = item.adherenceScore ?? item.fitScore;
  const scoreClass = item.matchesAllPriorities
    ? 'high'
    : item.matchedCount > 0
      ? 'partial'
      : 'low';
  const tags = [
    `<span class="tag core">${escapeHtml(item.tierLabel)}</span>`,
    item.signals.sacada ? '<span class="tag balcony">Sacada/varanda</span>' : '',
    item.signals.sun ? `<span class="tag sun">${item.signals.sunStrong ? 'Sol confirmado' : 'Sol provável'}</span>` : '',
    item.acceptsPets ? '<span class="tag">Pets</span>' : '',
    item.parkingSpots > 0 ? `<span class="tag">${item.parkingSpots} vaga(s)</span>` : '',
    `<span class="tag">${escapeHtml(item.sourceLabel || item.source)}</span>`,
  ].filter(Boolean).join('');

  els.detailContent.innerHTML = `
    <div class="detail-layout">
      ${renderDetailGallery(item, scoreClass, score)}
      <div class="detail-panel">
        <header class="detail-header">
          <p class="detail-kicker">${escapeHtml(item.neighbourhood || 'Sem bairro')}</p>
          <h2 class="detail-title">${escapeHtml(formatLogradouro(item))}</h2>
          <p class="detail-subtitle">${escapeHtml(item.title)}</p>
        </header>

        <div class="detail-tags tag-row">${tags}</div>

        <div class="detail-block glass-panel">
          <div class="priority-matches">${renderPriorityMatches(item)}</div>
        </div>

        <div class="detail-block glass-panel">
          ${renderDetailSpecTable(item)}
        </div>

        <div class="detail-block glass-panel">
          ${renderDetailCostTable(item)}
        </div>

        ${renderDetailSignals(item)}

        <div class="detail-actions">
          <a class="detail-action primary glass-control" href="${item.url}" target="_blank" rel="noopener noreferrer">Abrir anúncio</a>
          <button type="button" class="glass-control" data-pin="${item.id}" id="detail-pin">${state.pinned.has(item.id) ? 'Remover pin' : 'Fixar comparar'}</button>
        </div>
      </div>
    </div>
  `;

  els.detailDialog.showModal();
  document.getElementById('detail-pin')?.addEventListener('click', () => {
    togglePin(item.id);
    openDetail(item.id);
  });
}

function togglePin(id) {
  if (state.pinned.has(id)) state.pinned.delete(id);
  else if (state.pinned.size >= 3) {
    setStatus('Máximo de 3 imóveis para comparar.', true);
    return;
  } else state.pinned.add(id);

  els.compareCount.textContent = String(state.pinned.size);
  els.compareBtn.disabled = state.pinned.size < 2;
  renderCards();
}

function openCompare() {
  const items = [...state.pinned].map((id) => state.enriched.find((item) => item.id === id)).filter(Boolean);
  els.compareContent.innerHTML = items.map((item) => `
    <article class="compare-card">
      ${item.photoUrl ? `<img src="${item.photoUrl}" alt="" />` : '<div class="placeholder">Sem foto</div>'}
      <h3>${escapeHtml(item.title)}</h3>
      <p class="compare-logradouro">${escapeHtml(formatLogradouro(item))}</p>
      <p>${escapeHtml(item.neighbourhood || '')}</p>
      ${renderCostGrid(item, { compact: true })}
      <div class="tag-row">
        ${item.signals.sacada ? '<span class="tag balcony">Sacada</span>' : ''}
        ${item.signals.sun ? '<span class="tag sun">Sol</span>' : ''}
        <span class="tag core">${escapeHtml(item.tierLabel)}</span>
      </div>
    </article>
  `).join('');
  els.compareDialog.showModal();
}

function renderCatalog(catalog) {
  state.catalog = catalog;
  state.neighbourhoodSearch = '';
  els.neighbourhoodSearch.value = '';
  state.enriched = catalog.listings.map(enrichListing);
  restoreNeighbourhoodSelection();
  renderTierFilters();
  renderSourceFilters();
  renderNeighbourhoodFilters();
  applyPreset();
  applyFilters();

  const meta = catalog.meta;
  setStatus(
    `${meta.matchedCount} imóveis · ${meta.sources?.map((s) => s.label).join(', ') || 'multi-fonte'} · coletado ${new Date(meta.collectedAt).toLocaleString('pt-BR')}`,
  );
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('error', isError);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function shortName(name) {
  return name.length > 14 ? `${name.slice(0, 12)}…` : name;
}

function formatLogradouro(item) {
  return item.street?.trim() || 'Logradouro não informado';
}

function formatMoneyValue(amount) {
  return amount > 0 ? money.format(amount) : '—';
}

function getCostLines(item) {
  const lines = [
    { label: 'Aluguel', amount: item.rentPrice || 0 },
  ];

  if (item.condoPrice != null && item.condoPrice > 0) {
    lines.push({ label: 'Condomínio', amount: item.condoPrice });
  }
  if (item.iptuPrice != null && item.iptuPrice > 0) {
    lines.push({ label: 'IPTU', amount: item.iptuPrice });
  }
  if ((item.condoPrice == null || item.condoPrice === 0)
    && (item.iptuPrice == null || item.iptuPrice === 0)
    && item.condoIptu > 0) {
    lines.push({ label: 'Condomínio + IPTU', amount: item.condoIptu, muted: true });
  }

  for (const extra of item.extraCosts || []) {
    if (extra.amount > 0) {
      lines.push({ label: extra.label, amount: extra.amount, extra: true });
    }
  }

  const accounted = lines.reduce((sum, line) => sum + line.amount, 0);
  const remainder = Math.max(0, (item.totalCost || 0) - accounted);
  const hasOtherExtra = (item.extraCosts || []).some((extra) => /outros/i.test(extra.label));
  if (remainder > 0 && !hasOtherExtra) {
    lines.push({ label: 'Outros custos', amount: remainder, extra: true });
  }

  lines.push({ label: 'Total mensal', amount: item.totalCost || 0, total: true });

  return lines;
}

function renderCostGrid(item, { compact = false } = {}) {
  const lines = getCostLines(item);

  return `
    <div class="cost-grid ${compact ? 'compact' : ''}">
      ${lines.map((line) => `
        <div class="cost-row ${line.total ? 'total' : ''} ${line.extra ? 'extra' : ''} ${line.muted ? 'muted' : ''}">
          <span class="cost-label">${escapeHtml(line.label)}</span>
          <strong class="cost-value">${formatMoneyValue(line.amount)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCardInfo(item) {
  return `
    <div class="card-info">
      <p class="card-logradouro">${escapeHtml(formatLogradouro(item))}</p>
      <div class="info-grid">
        <div class="info-item">
          <span>Bairro</span>
          <strong>${escapeHtml(item.neighbourhood || 'Sem bairro')}</strong>
        </div>
        <div class="info-item">
          <span>Quartos</span>
          <strong>${item.bedrooms || '—'}</strong>
        </div>
        <div class="info-item">
          <span>Área</span>
          <strong>${item.area ? `${item.area} m²` : '—'}</strong>
        </div>
        <div class="info-item">
          <span>R$/m²</span>
          <strong>${item.pricePerSqm ? money.format(item.pricePerSqm) : '—'}</strong>
        </div>
        <div class="info-item">
          <span>Vagas</span>
          <strong>${item.parkingSpots || '—'}</strong>
        </div>
        <div class="info-item">
          <span>Fonte</span>
          <strong>${escapeHtml(item.sourceLabel || item.source)}</strong>
        </div>
      </div>
    </div>
  `;
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
  if (!response.ok) throw new Error('Arquivo não encontrado. Rode npm run merge:catalogs');
  return response.json();
}

async function bootstrap() {
  try {
    renderCatalog(await loadDefaultCatalog());
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    state.preset = button.dataset.preset;
    document.querySelectorAll('.preset').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
    if (state.preset !== 'custom') applyPreset();
    applyFilters();
  });
});

document.querySelectorAll('.view-btn').forEach((button) => {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('.view-btn').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
    renderCards();
  });
});

[
  els.sortBy,
  els.priorityApartment,
  els.prioritySacada,
  els.prioritySun,
  els.priorityPets,
  els.priorityParking,
].forEach((el) => el.addEventListener('change', () => {
  markCustomPreset();
  if (el !== els.sortBy) els.sortBy.value = 'fit-desc';
  applyFilters();
}));

els.neighbourhoodSearch.addEventListener('input', () => {
  state.neighbourhoodSearch = els.neighbourhoodSearch.value;
  renderNeighbourhoodFilters();
});

els.neighbourhoodClear.addEventListener('click', () => {
  updateNeighbourhoodSelection(() => state.selectedNeighbourhoods.clear());
});

els.neighbourhoodCentral.addEventListener('click', () => {
  updateNeighbourhoodSelection(() => {
    state.selectedNeighbourhoods.clear();
    for (const item of state.enriched) {
      if (['core', 'near', 'mid'].includes(item.tier)) {
        state.selectedNeighbourhoods.add(item.neighbourhood || 'Sem bairro');
      }
    }
  });
});

window.addEventListener('popstate', () => {
  if (!state.catalog) return;
  restoreNeighbourhoodSelection();
  renderNeighbourhoodFilters();
  applyFilters();
});

els.reloadBtn.addEventListener('click', bootstrap);
els.clearPins.addEventListener('click', () => {
  state.pinned.clear();
  els.compareCount.textContent = '0';
  els.compareBtn.disabled = true;
  renderCards();
});
els.compareBtn.addEventListener('click', openCompare);
els.detailClose.addEventListener('click', () => els.detailDialog.close());
els.compareClose.addEventListener('click', () => els.compareDialog.close());

els.detailContent.addEventListener('click', (event) => {
  const prevBtn = event.target.closest('[data-detail-prev]');
  const nextBtn = event.target.closest('[data-detail-next]');
  const thumbBtn = event.target.closest('[data-detail-thumb]');
  const itemId = prevBtn?.dataset.detailPrev
    || nextBtn?.dataset.detailNext
    || thumbBtn?.dataset.detailThumb;
  if (!itemId) return;

  event.preventDefault();

  const item = state.enriched.find((entry) => entry.id === itemId);
  if (!item) return;

  if (thumbBtn) {
    updateDetailGallery(item, Number(thumbBtn.dataset.thumbIndex), 0);
    return;
  }

  const current = getPhotoIndex(itemId);
  const delta = nextBtn ? 1 : -1;
  updateDetailGallery(item, current + delta, delta);
});

els.detailDialog.addEventListener('keydown', (event) => {
  if (!els.detailDialog.open) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

  const gallery = els.detailContent.querySelector('[data-detail-gallery]');
  if (!gallery) return;

  const item = state.enriched.find((entry) => entry.id === gallery.dataset.detailGallery);
  if (!item || getPhotoUrls(item).length <= 1) return;

  event.preventDefault();
  const current = getPhotoIndex(item.id);
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  updateDetailGallery(item, current + delta, delta);
});

els.fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    renderCatalog(JSON.parse(await file.text()));
  } catch {
    setStatus('JSON inválido.', true);
  }
});

els.cards.addEventListener('click', (event) => {
  const backBtn = event.target.closest('[data-gallery-back]');
  const nextBtn = event.target.closest('[data-gallery-next]');
  const prevBtn = event.target.closest('[data-gallery-prev]');
  const listingId = backBtn?.dataset.galleryBack
    || nextBtn?.dataset.galleryNext
    || prevBtn?.dataset.galleryPrev;
  if (!listingId) return;

  event.preventDefault();
  event.stopPropagation();

  const item = state.filtered.find((entry) => entry.id === listingId)
    || state.enriched.find((entry) => entry.id === listingId);
  const card = event.target.closest('[data-listing-id]');
  if (!item || !card) return;

  if (backBtn) {
    collapseGalleryData(card, listingId);
    return;
  }

  const current = getPhotoIndex(listingId);
  const delta = nextBtn ? 1 : -1;
  const nextIndex = current + delta;

  if (nextBtn && current === 0 && getPhotoUrls(item).length > 1) {
    setGalleryExpanded(listingId, true);
    applyCardGalleryLayout(card, listingId);
  }

  updateCardGallery(card, item, nextIndex, delta);
});

bootstrap();
