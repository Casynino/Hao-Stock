// All time-based UI logic must use Tanzania time (Africa/Dar_es_Salaam = UTC+3).
const TZ = 'Africa/Dar_es_Salaam';

export function tzHour() {
  return parseInt(
    new Intl.DateTimeFormat('en', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
}

// 05:00–11:59 morning · 12:00–17:59 afternoon · 18:00–04:59 evening
export function tzGreeting() {
  const h = tzHour();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function tzDateLabel(opts = {}) {
  return new Date().toLocaleDateString('en', { timeZone: TZ, ...opts });
}
