export function formatBrl(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const LISTING_TITLE_PREFIXES = [
  /^alugar\s+apartamento\s*(para\s+alugar)?[:,]?\s*/i,
  /^apartamento\s+para\s+alugar[:,]?\s*/i,
  /^apartamento\s+para\s+aluguel[:,]?\s*/i,
  /^apartamento\s*[:,·\-]\s*/i,
  /^apartamento\s+/i,
  /^alugar\s+/i,
];

export function normalizeListingTitle(title: string | null | undefined): string {
  if (!title) return '';
  const original = title.trim();
  let text = original;

  let prev = '';
  while (prev !== text) {
    prev = text;
    for (const pattern of LISTING_TITLE_PREFIXES) {
      text = text.replace(pattern, '').trim();
    }
  }

  if (!text) return original;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
