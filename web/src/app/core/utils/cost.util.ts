export interface CostLine {
  label: string;
  amount: number;
  total?: boolean;
  extra?: boolean;
  muted?: boolean;
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function formatBrl(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return money.format(value);
}

export function formatMoneyValue(amount: number): string {
  return amount > 0 ? money.format(amount) : '—';
}

export function formatLogradouro(street?: string | null): string {
  return street?.trim() || 'Logradouro não informado';
}

export function shortName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 12)}…` : name;
}

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function getCostLines(item: {
  rentPrice?: number;
  condoPrice?: number | null;
  iptuPrice?: number | null;
  condoIptu?: number;
  extraCosts?: { label: string; amount: number }[];
  totalCost?: number;
}): CostLine[] {
  const lines: CostLine[] = [{ label: 'Aluguel', amount: item.rentPrice || 0 }];

  if (item.condoPrice != null && item.condoPrice > 0) {
    lines.push({ label: 'Condomínio', amount: item.condoPrice });
  }
  if (item.iptuPrice != null && item.iptuPrice > 0) {
    lines.push({ label: 'IPTU', amount: item.iptuPrice });
  }
  if ((item.condoPrice == null || item.condoPrice === 0)
    && (item.iptuPrice == null || item.iptuPrice === 0)
    && (item.condoIptu || 0) > 0) {
    lines.push({ label: 'Condomínio + IPTU', amount: item.condoIptu || 0, muted: true });
  }

  for (const extra of item.extraCosts || []) {
    if (extra.amount > 0) lines.push({ label: extra.label, amount: extra.amount, extra: true });
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
