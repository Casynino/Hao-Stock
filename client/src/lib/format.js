import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const CURRENCY = import.meta.env.VITE_CURRENCY || 'TZS';
const LOCALE = import.meta.env.VITE_LOCALE || 'en-TZ';

export function formatCurrency(value, { compact = false } = {}) {
  const n = Number(value || 0);
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      maximumFractionDigits: 0,
      notation: compact ? 'compact' : 'standard',
    }).format(n);
  } catch {
    return `${CURRENCY} ${n.toLocaleString()}`;
  }
}

export function formatNumber(value, { compact = false } = {}) {
  const n = Number(value || 0);
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(n);
}

export function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

export function formatDate(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY');
}

export function formatDateTime(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY, HH:mm');
}

export function fromNow(value) {
  if (!value) return '';
  return dayjs(value).fromNow();
}

// Pluralize a unit name for display ("Box" -> "Boxes", "Carton" -> "Cartons").
export function pluralizeUnit(unit = 'unit') {
  if (!unit) return 'units';
  if (/[^aeiou]y$/i.test(unit)) return `${unit.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(unit)) return `${unit}es`;
  return `${unit}s`;
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
