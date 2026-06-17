'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const reorder = require('../services/reorder.service');

const analysis = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await reorder.reorderAnalysis({
    lookbackDays: q.lookbackDays ? Number(q.lookbackDays) : undefined,
    coverDays: q.coverDays ? Number(q.coverDays) : undefined,
  });
  return ok(res, data);
});

const lowStock = asyncHandler(async (_req, res) => {
  const data = await reorder.lowStock();
  return ok(res, data);
});

module.exports = { analysis, lowStock };
