'use strict';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(utc);
dayjs.extend(isoWeek);

// Resolve a named period ("today" | "week" | "month" | "year") or an explicit
// from/to pair into a concrete [start, end) range for ledger/sales queries.
function resolveRange({ period, from, to, start, end } = {}) {
  // Exact datetime window (Date objects / ISO datetimes) — used for
  // timezone-correct report ranges; from/to would clamp to UTC day bounds.
  if (start && end) {
    return { start: new Date(start), end: new Date(end), label: 'custom' };
  }
  if (from || to) {
    const start = from ? dayjs(from).startOf('day') : dayjs().subtract(30, 'day').startOf('day');
    const end = to ? dayjs(to).endOf('day') : dayjs().endOf('day');
    return { start: start.toDate(), end: end.toDate(), label: 'custom' };
  }

  const now = dayjs();
  switch (period) {
    case 'today':
      return { start: now.startOf('day').toDate(), end: now.endOf('day').toDate(), label: 'today' };
    case 'week':
      return { start: now.startOf('isoWeek').toDate(), end: now.endOf('isoWeek').toDate(), label: 'week' };
    case 'year':
      return { start: now.startOf('year').toDate(), end: now.endOf('year').toDate(), label: 'year' };
    case 'month':
    default:
      return { start: now.startOf('month').toDate(), end: now.endOf('month').toDate(), label: 'month' };
  }
}

function daysBetween(a, b) {
  return dayjs(b).startOf('day').diff(dayjs(a).startOf('day'), 'day');
}

function daysOverdue(dueDate, reference = new Date()) {
  const d = daysBetween(dueDate, reference);
  return d > 0 ? d : 0;
}

// ── Tanzania time (Africa/Dar_es_Salaam = UTC+3, no DST) ─────────────────────
// All scheduled reports are anchored to the business's clock, not the server's.
const EAT_OFFSET_H = 3;
const eatNow = () => dayjs().utc().add(EAT_OFFSET_H, 'hour');
// Convert an EAT-clock dayjs back to the real UTC instant it represents.
const eatToUtc = (d) => d.subtract(EAT_OFFSET_H, 'hour');

// Exact UTC datetime window for an EAT-local day / isoWeek / month containing
// `anchor` (an EAT-clock dayjs). Returns { start, end, label } with Dates.
function eatRange(unit, anchor = eatNow()) {
  const s = anchor.startOf(unit === 'week' ? 'isoWeek' : unit);
  const e = anchor.endOf(unit === 'week' ? 'isoWeek' : unit);
  return { start: eatToUtc(s).toDate(), end: eatToUtc(e).toDate(), eatStart: s, eatEnd: e };
}

module.exports = { dayjs, resolveRange, daysBetween, daysOverdue, eatNow, eatToUtc, eatRange, EAT_OFFSET_H };
