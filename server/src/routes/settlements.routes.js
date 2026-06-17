'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, requireAdmin, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/settlements.controller');
const { settlementQuery, settlementSettle, settlementSettleBoxes } = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const staff = requireRoles(ROLES.WAREHOUSE_STAFF);
const settlers = requireRoles(ROLES.SALES_REP, ROLES.WAREHOUSE_STAFF);

router.use(authenticate);
router.get('/', validate(settlementQuery), ctrl.list); // reps see their own (scoped in controller)
router.get('/summary', staff, ctrl.summary);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/:id/settle-boxes', settlers, validate({ ...idParam, ...settlementSettleBoxes }), ctrl.settleBoxes);
router.post('/:id/settle', staff, validate({ ...idParam, ...settlementSettle }), ctrl.settle);
router.post('/refresh-overdue', requireAdmin, ctrl.refreshOverdue);

module.exports = router;
