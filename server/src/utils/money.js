'use strict';

const env = require('../config/env');
const { Prisma } = require('@prisma/client');

// Coerce a value that may be a Prisma.Decimal, string, or number into a JS
// number. Prisma returns Decimal instances for @db.Decimal columns.
function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

// Round to 2 decimal places, avoiding binary float drift (e.g. 1.005).
function round2(value) {
  const n = toNumber(value);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Build a Prisma.Decimal from any numeric-ish input, rounded to 2dp.
function toDecimal(value) {
  return new Prisma.Decimal(round2(value).toFixed(2));
}

function sum(values) {
  return round2(values.reduce((acc, v) => acc + toNumber(v), 0));
}

// Format for reports/exports using the configured locale & currency.
function formatCurrency(value) {
  try {
    return new Intl.NumberFormat(env.business.locale, {
      style: 'currency',
      currency: env.business.currency,
      maximumFractionDigits: 0,
    }).format(toNumber(value));
  } catch {
    return `${env.business.currency} ${round2(value).toLocaleString()}`;
  }
}

module.exports = { toNumber, round2, toDecimal, sum, formatCurrency };
