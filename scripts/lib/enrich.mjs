export const TIERS = {
  core: { label: 'Núcleo central', score: 100 },
  near: { label: 'Adjacente', score: 75 },
  mid: { label: 'Intermediário', score: 50 },
  outer: { label: 'Periferia', score: 20 },
};

export const TIER_ORDER = ['core', 'near', 'mid', 'outer'];

export const NEIGHBOURHOOD_TIERS = {
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

export const COMPASS_LAYOUT = {
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

export const FLAG = {
  FURNISHED: 1 << 0,
  PETS: 1 << 1,
  APARTMENT: 1 << 2,
  SACADA: 1 << 3,
  SUN_STRONG: 1 << 4,
  SUN_WEAK: 1 << 5,
  PARKING: 1 << 6,
};

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getTier(neighbourhood) {
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

export function collectSignals(listing) {
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

export function enrichListing(listing) {
  const tier = getTier(listing.neighbourhood);
  const signals = collectSignals(listing);
  const centralityScore = TIERS[tier].score;
  const featureScore = (signals.sacada ? 35 : 0)
    + (signals.sunStrong ? 35 : signals.sunWeak ? 18 : 0)
    + (signals.balconyTags.length ? 5 : 0)
    + (signals.sunTags.length ? 5 : 0);
  const fitScore = featureScore + Math.round(centralityScore * 0.35);
  const isApartment = /apart/i.test(listing.type || listing.title || '');

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
    isApartment,
  };
}

export function buildFlags(listing, signals, isApartment) {
  let flags = 0;
  if (listing.isFurnished) flags |= FLAG.FURNISHED;
  if (listing.acceptsPets) flags |= FLAG.PETS;
  if (isApartment) flags |= FLAG.APARTMENT;
  if (signals.sacada) flags |= FLAG.SACADA;
  if (signals.sunStrong) flags |= FLAG.SUN_STRONG;
  if (signals.sunWeak) flags |= FLAG.SUN_WEAK;
  if ((listing.parkingSpots || 0) > 0) flags |= FLAG.PARKING;
  return flags;
}

export function tierToIndex(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : TIER_ORDER.length - 1;
}

export function normalizeStreet(street) {
  return normalizeText(street).replace(/\s+/g, ' ');
}

export function dedupeKey(listing) {
  const neighbourhood = normalizeText(listing.neighbourhood || 'sem bairro');
  const area = listing.area ? Math.round(listing.area) : 0;
  const bedrooms = listing.bedrooms || 0;
  const rent = Math.round((listing.rentPrice || 0) / 50) * 50;
  const street = normalizeStreet(listing.street).slice(0, 24);
  return `${neighbourhood}|${area}|${bedrooms}|${rent}|${street}`;
}

export function buildSearchText(listing) {
  return normalizeText(`${listing.title} ${listing.street} ${listing.neighbourhood}`);
}

export const PHOTO_PREFIXES = [
  'https://www.quintoandar.com.br/img/med/',
  'https://www.auxiliadorapredial.com.br/',
  'https://guarida.com.br',
];

export function encodePhotoUrl(url, dict) {
  if (!url) return null;
  for (let i = 0; i < dict.photoPrefixes.length; i += 1) {
    const prefix = dict.photoPrefixes[i];
    if (url.startsWith(prefix)) {
      const suffix = url.slice(prefix.length);
      const idx = dict.photoSuffixes.indexOf(suffix);
      if (idx >= 0) return [i, idx];
      dict.photoSuffixes.push(suffix);
      return [i, dict.photoSuffixes.length - 1];
    }
  }
  const idx = dict.photoFull.indexOf(url);
  if (idx >= 0) return [-1, idx];
  dict.photoFull.push(url);
  return [-1, dict.photoFull.length - 1];
}

export function decodePhotoUrl(encoded, dict) {
  if (!encoded) return null;
  const [prefixIdx, suffixIdx] = encoded;
  if (prefixIdx === -1) return dict.photoFull[suffixIdx] || null;
  return `${dict.photoPrefixes[prefixIdx]}${dict.photoSuffixes[suffixIdx]}`;
}
