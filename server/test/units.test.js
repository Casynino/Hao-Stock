'use strict';

// Unit tests for pure business logic (no database required).
// Run with: npm test   (uses Node's built-in test runner)

const test = require('node:test');
const assert = require('node:assert/strict');

const money = require('../src/utils/money');
const numbering = require('../src/utils/numbering');
const credit = require('../src/services/credit.service');

test('money.round2 avoids float drift', () => {
  assert.equal(money.round2(1.005), 1.01);
  assert.equal(money.round2(700 * 0.65), 455);
  assert.equal(money.round2('1234.567'), 1234.57);
});

test('money.toNumber coerces strings and nullish', () => {
  assert.equal(money.toNumber('250'), 250);
  assert.equal(money.toNumber(null), 0);
  assert.equal(money.toNumber(undefined), 0);
});

test('money.sum totals a mixed list', () => {
  assert.equal(money.sum([700, '800', 1700]), 3200);
});

test('numbering.pad / compactDate produce stable formats', () => {
  assert.equal(numbering.pad(7, 4), '0007');
  assert.match(numbering.compactDate(new Date('2026-06-16')), /^\d{8}$/);
  assert.equal(numbering.randomCode(6).length, 6);
});

test('credit.computeStatus reflects balance, due date and payments', () => {
  const future = new Date(Date.now() + 7 * 864e5);
  const past = new Date(Date.now() - 7 * 864e5);

  assert.equal(credit.computeStatus({ balance: 0, amountPaid: 1000, dueDate: future }), 'PAID');
  assert.equal(credit.computeStatus({ balance: 500, amountPaid: 0, dueDate: future }), 'OPEN');
  assert.equal(credit.computeStatus({ balance: 500, amountPaid: 200, dueDate: future }), 'PARTIAL');
  assert.equal(credit.computeStatus({ balance: 500, amountPaid: 200, dueDate: past }), 'OVERDUE');
});
