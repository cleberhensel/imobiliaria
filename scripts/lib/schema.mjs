/** @typedef {import('./types.mjs').Listing} Listing */

export const SOURCE_LABELS = {
  quintoandar: 'QuintoAndar',
  'auxiliadora-predial': 'Auxiliadora Predial',
  guarida: 'Guarida',
};

/**
 * @param {Array<{ label: string, amount: number }>} extraCosts
 */
function sumExtras(extraCosts = []) {
  return extraCosts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

/**
 * @param {string[]} urls
 */
function uniqueUrls(urls) {
  return [...new Set(urls.filter(Boolean))];
}

/**
 * @param {string[]} photoUrls
 */
function pickPhotoFields(photoUrls) {
  const urls = uniqueUrls(photoUrls);
  return {
    photoUrls: urls,
    photoUrl: urls[0] || null,
  };
}

/**
 * @param {Record<string, unknown>} raw
 */
function quintoAndarPhotos(raw) {
  const base = 'https://www.quintoandar.com.br/img/med/';
  const list = Array.isArray(raw.imageList) ? raw.imageList : [];
  if (list.length) {
    return pickPhotoFields(list.map((file) => `${base}${file}`));
  }
  if (raw.coverImage) return pickPhotoFields([`${base}${raw.coverImage}`]);
  if (raw.banner) return pickPhotoFields([`${base}${raw.banner}`]);
  return pickPhotoFields([]);
}

/**
 * @param {Record<string, unknown>} raw
 */
function auxiliadoraPhotos(raw) {
  const fotos = Array.isArray(raw.fotos) ? raw.fotos : [];
  const pequenas = Array.isArray(raw.fotosPequenas) ? raw.fotosPequenas : [];
  return pickPhotoFields([...fotos, ...pequenas].map(String));
}

/**
 * @param {Record<string, unknown>} raw
 */
function guaridaPhotos(raw) {
  const fotos = Array.isArray(raw.fotos) ? raw.fotos : [];
  return pickPhotoFields(fotos.map((foto) => foto?.url).filter(Boolean));
}

/**
 * @param {object} params
 * @param {number} params.rentPrice
 * @param {number|null|undefined} params.condoPrice
 * @param {number|null|undefined} params.iptuPrice
 * @param {number} params.totalCost
 * @param {Array<{ label: string, amount: number }>} [params.extraCosts]
 * @param {number} [params.combinedCondoIptu]
 */
function buildCostFields({
  rentPrice,
  condoPrice,
  iptuPrice,
  totalCost,
  extraCosts = [],
  combinedCondoIptu = 0,
}) {
  const condo = Number(condoPrice) || 0;
  const iptu = Number(iptuPrice) || 0;
  const hasSplit = condo > 0 || iptu > 0;
  const condoIptu = hasSplit
    ? condo + iptu
    : Number(combinedCondoIptu) || Math.max(0, totalCost - rentPrice - sumExtras(extraCosts));

  const cleanedExtras = extraCosts
    .filter((item) => Number(item.amount) > 0)
    .map((item) => ({ label: item.label, amount: Number(item.amount) }));

  const accounted = rentPrice + (hasSplit ? condo + iptu : condoIptu) + sumExtras(cleanedExtras);
  const remainder = Math.max(0, totalCost - accounted);
  if (remainder > 0) {
    cleanedExtras.push({ label: 'Outros custos', amount: remainder });
  }

  return {
    rentPrice,
    condoPrice: hasSplit ? condo : null,
    iptuPrice: hasSplit ? iptu : null,
    condoIptu,
    extraCosts: cleanedExtras,
    totalCost,
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} source
 * @returns {Listing}
 */
export function normalizeQuintoAndarHouse(raw, source = 'quintoandar') {
  const id = String(raw.id);
  const rentPrice = Number(raw.rentPrice ?? raw.rent) || 0;
  const totalCost = Number(raw.totalCost) || 0;
  const combinedCondoIptu = Number(raw.condoIptu ?? raw.iptuPlusCondominium) || 0;
  const costs = buildCostFields({
    rentPrice,
    totalCost,
    combinedCondoIptu,
  });
  const area = Number(raw.area) || null;
  const bedrooms = Number(raw.bedrooms) || 0;
  const bathrooms = Number(raw.bathrooms) || 0;
  const parkingSpots = Number(raw.parkingSpots ?? raw.parkingSpaces) || 0;
  const address = raw.address || {};
  const street = typeof address === 'string' ? address : (address.address || '');
  const neighbourhood = raw.neighbourhood || raw.regionName || '';
  const city = (typeof address === 'object' ? address.city : null) || 'Porto Alegre';
  const amenities = Array.isArray(raw.amenities) ? raw.amenities : [];
  const installations = Array.isArray(raw.installations) ? raw.installations : [];
  const acceptsPets = amenities.includes('PODE_TER_ANIMAIS_DE_ESTIMACAO');

  return {
    id: `${source}:${id}`,
    source,
    sourceLabel: SOURCE_LABELS[source] || source,
    sourceId: id,
    url: `https://www.quintoandar.com.br/imovel/${id}`,
    title: raw.shortRentDescription || raw.type || 'Imóvel',
    type: raw.type || 'Imóvel',
    city,
    neighbourhood,
    street,
    ...costs,
    area,
    pricePerSqm: area ? Math.round((totalCost / area) * 100) / 100 : null,
    bedrooms,
    bathrooms,
    parkingSpots,
    isFurnished: Boolean(raw.isFurnished),
    acceptsPets,
    amenities,
    installations,
    ...quintoAndarPhotos(raw),
    collectedAt: new Date().toISOString(),
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [source]
 * @returns {Listing}
 */
export function normalizeAuxiliadoraListing(raw, source = 'auxiliadora-predial') {
  const id = String(raw.codigo);
  const valores = raw.valores || {};
  const rentPrice = Number(valores.valor) || 0;
  const totalCost = Number(valores.valorTotal) || 0;
  const condoPrice = Number(valores.valorCondominio) || 0;
  const iptuPrice = Number(valores.valorIptu) || 0;
  const costs = buildCostFields({
    rentPrice,
    condoPrice,
    iptuPrice,
    totalCost,
  });
  const area = Number(raw.areaPrivativa || raw.areaTotal) || null;
  const bedrooms = Number(raw.dormitorios) || 0;
  const bathrooms = Number(raw.banheiros) || 0;
  const parkingSpots = Number(raw.vagas) || 0;
  const endereco = raw.endereco || {};
  const streetParts = [
    endereco.tipoEndereco,
    endereco.logradouro,
    endereco.numero ? String(endereco.numero) : null,
  ].filter(Boolean);
  const street = streetParts.join(' ');
  const neighbourhood = endereco.bairro?.nome || '';
  const city = endereco.cidade?.nome || 'Porto Alegre';
  const characteristics = Array.isArray(raw.caracteristicaImovel)
    ? raw.caracteristicaImovel.map((item) => item.nome)
    : [];
  const campaigns = Array.isArray(raw.campanhas)
    ? raw.campanhas.map((item) => item.nome)
    : [];
  const acceptsPets = characteristics.some((name) => /pet|animal/i.test(name));
  const isFurnished = campaigns.some((name) => /mobiliad/i.test(name))
    || characteristics.some((name) => /mobiliad/i.test(name));
  const type = raw.categoria?.nome || 'Imóvel';
  const title = raw.titulo || `${type} · ${neighbourhood || city}`;
  const url = raw.link
    || `https://www.auxiliadorapredial.com.br/imovel/alugar/${id}`;

  return {
    id: `${source}:${id}`,
    source,
    sourceLabel: SOURCE_LABELS[source] || source,
    sourceId: id,
    url,
    title,
    type,
    city,
    neighbourhood,
    street,
    ...costs,
    area,
    pricePerSqm: area ? Math.round((totalCost / area) * 100) / 100 : null,
    bedrooms,
    bathrooms,
    parkingSpots,
    isFurnished,
    acceptsPets,
    amenities: characteristics,
    installations: [],
    ...auxiliadoraPhotos(raw),
    collectedAt: new Date().toISOString(),
  };
}

/**
 * @param {string|number|null|undefined} value
 */
function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/\D/g, '')) || 0;
}

/**
 * @param {Array<{ slug?: string, valor?: string }>} propriedades
 * @param {string} slug
 */
function getPropertyValue(propriedades, slug) {
  const item = propriedades.find((prop) => prop.slug === slug);
  return item ? Number(item.valor) || 0 : 0;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [source]
 * @returns {Listing}
 */
export function normalizeGuaridaListing(raw, source = 'guarida') {
  const id = String(raw.codigo);
  const valores = raw.valores || {};
  const rentPrice = parseMoney(valores.valor);
  const totalCost = parseMoney(valores.total);
  const extraCosts = [
    { label: 'Taxa de serviço', amount: parseMoney(valores.servico) },
    { label: 'Seguro incêndio', amount: parseMoney(valores.seguroFogo) },
  ];
  const costs = buildCostFields({
    rentPrice,
    condoPrice: parseMoney(valores.condominio),
    iptuPrice: parseMoney(valores.iptu),
    totalCost,
    extraCosts,
  });
  const propriedades = Array.isArray(raw.propriedades) ? raw.propriedades : [];
  const area = getPropertyValue(propriedades, 'area') || null;
  const bedrooms = getPropertyValue(propriedades, 'dormitorios');
  const bathrooms = getPropertyValue(propriedades, 'banheiro');
  const parkingSpots = getPropertyValue(propriedades, 'vaga');
  const endereco = String(raw.endereco || '');
  const neighbourhood = endereco.split(',')[0]?.trim() || '';
  const city = endereco.match(/Porto Alegre/i) ? 'Porto Alegre' : 'Porto Alegre';
  const street = String(raw.logradouro || '');
  const imovelFeatures = Array.isArray(raw.caracteristicas?.imovel)
    ? raw.caracteristicas.imovel
    : [];
  const condoFeatures = Array.isArray(raw.caracteristicas?.condominio)
    ? raw.caracteristicas.condominio
    : [];
  const amenities = [...imovelFeatures, ...condoFeatures];
  const acceptsPets = imovelFeatures.includes('pet');
  const isFurnished = imovelFeatures.includes('mobiliado')
    || /mobiliad/i.test(String(raw.titulo || ''));
  const type = raw.tipo?.nome || 'Imóvel';
  const title = raw.titulo || `${type} · ${neighbourhood || city}`;
  const url = raw.url
    ? `https://guarida.com.br${raw.url}`
    : `https://guarida.com.br/imovel/alugar/${id}`;

  return {
    id: `${source}:${id}`,
    source,
    sourceLabel: SOURCE_LABELS[source] || source,
    sourceId: id,
    url,
    title,
    type,
    city,
    neighbourhood,
    street,
    ...costs,
    area,
    pricePerSqm: area ? Math.round((totalCost / area) * 100) / 100 : null,
    bedrooms,
    bathrooms,
    parkingSpots,
    isFurnished,
    acceptsPets,
    amenities,
    installations: [],
    ...guaridaPhotos(raw),
    collectedAt: new Date().toISOString(),
  };
}

/**
 * @param {object} params
 * @param {string} params.source
 * @param {string} params.city
 * @param {string} params.state
 * @param {number} params.maxTotalCost
 * @param {number} params.fetchedPages
 * @param {number} params.rawCount
 * @param {Listing[]} params.listings
 */
export function buildCatalog({ source, city, state, maxTotalCost, fetchedPages, rawCount, reportedTotal, listings }) {
  const byNeighbourhood = {};
  for (const item of listings) {
    const key = item.neighbourhood || 'Sem bairro';
    byNeighbourhood[key] = (byNeighbourhood[key] || 0) + 1;
  }

  const totals = listings.map((l) => l.totalCost).filter(Boolean);
  const areas = listings.map((l) => l.area).filter(Boolean);
  const ppms = listings.map((l) => l.pricePerSqm).filter(Boolean);

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const min = (arr) => (arr.length ? Math.min(...arr) : null);
  const max = (arr) => (arr.length ? Math.max(...arr) : null);

  return {
    meta: {
      version: '1.0',
      source,
      sourceLabel: SOURCE_LABELS[source] || source,
      city,
      state,
      filter: { maxTotalCost },
      collectedAt: new Date().toISOString(),
      fetchedPages,
      rawCount,
      reportedTotal: reportedTotal ?? null,
      matchedCount: listings.length,
    },
    summary: {
      byNeighbourhood: Object.entries(byNeighbourhood)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      totalCost: { min: min(totals), max: max(totals), avg: avg(totals) },
      area: { min: min(areas), max: max(areas), avg: avg(areas) },
      pricePerSqm: { min: min(ppms), max: max(ppms), avg: avg(ppms) },
      furnished: listings.filter((l) => l.isFurnished).length,
      acceptsPets: listings.filter((l) => l.acceptsPets).length,
      withParking: listings.filter((l) => l.parkingSpots > 0).length,
    },
    listings,
  };
}
