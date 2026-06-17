'use strict';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(utc);
dayjs.extend(isoWeek);

// Resolve a named period ("today" | "week" | "month" | "year") or an explicit
// from/to pair into a concrete [start, end) range for ledger/sales queries.
function resolveRange({ period, from, to } = {}) {
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

module.exports = { dayjs, resolveRange, daysBetween, daysOverdue };
