'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, paginated } = require('../utils/response');
const { parsePagination } = require('../utils/pagination');
const penaltyService = require('../services/penalty.service');
const audit = require('../services/audit.service');
const { ROLES } = require('../middleware/authorize');

// POST /penalties/apply  — admin triggers daily penalty pass + deadline warnings.
const apply = asyncHandler(async (req, res) => {
  const [penalties, warnings] = await Promise.all([
    penaltyService.applyDailyPenalties(),
    penaltyService.checkApproachingDeadlines(),
  ]);
  await audit.record(req, {
    action: 'CREATE',
    entityType: 'SettlementPenalty',
    newValues: { applied: penalties.applied, skipped: penalties.skipped, deadlineWarnings: warnings.notified },
  });
  return ok(res, { penalties, warnings });
});

// GET /penalties  — list stored penalty audit records (admin) or own (rep).
const list = asyncHandler(async (req, res) => {
  const q = req.query;
  const pagination = parsePagination(q, { defaultSortBy: 'appliedAt', defaultSortDir: 'desc' });
  const filters = {};
  if (req.user.role === ROLES.SALES_REP) {
    filters.salesRepId = req.user.salesRepId;
  } else if (q.salesRepId) {
    filters.salesRepId = q.salesRepId;
  }
  if (q.settlementId) filters.settlementId = q.settlementId;

  const { items, total } = await penaltyService.listPenalties({
    ...filters,
    page: pagination.page,
    limit: pagination.limit,
  });
  return paginated(res, items, { page: pagination.page, limit: pagination.limit, total });
});

module.exports = { apply, list };
