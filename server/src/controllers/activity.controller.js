'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const activity = require('../services/activity.service');

const feed = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 30;
  return ok(res, await activity.feed(limit));
});

module.exports = { feed };
