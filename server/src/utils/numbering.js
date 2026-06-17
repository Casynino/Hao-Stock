'use strict';

function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

function compactDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Generate a human-readable, per-day sequential document number such as
// SALE-20260616-0007. `delegate` is a Prisma model delegate (e.g. tx.sale),
// `field` the unique column, `prefix` the document prefix. The surrounding
// unique constraint is the real guarantee; this just produces friendly values.
async function nextDocNumber(delegate, field, prefix) {
  const datePart = compactDate();
  const like = `${prefix}-${datePart}-`;
  const count = await delegate.count({
    where: { [field]: { startsWith: like } },
  });
  return `${like}${pad(count + 1)}`;
}

// Short uppercase alphanumeric code, e.g. for SKUs or rep codes.
function randomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

module.exports = { nextDocNumber, randomCode, compactDate, pad };
