'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/commissions.controller');
const { withdrawRequest, withdrawDecide, withdrawalQuery } = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const staff = requireRoles(ROLES.WAREHOUSE_STAFF);
const reps = requireRoles(ROLES.SALES_REP);

router.use(authenticate);
router.get('/me', reps, ctrl.me);
router.get('/rule', ctrl.rule);
router.get('/summary', staff, ctrl.summary);
router.get('/rep/:salesRepId', staff, ctrl.getForRep);
router.get('/withdrawals', validate(withdrawalQuery), ctrl.listWithdrawals);
router.post('/withdrawals', reps, validate(withdrawRequest), ctrl.requestWithdrawal);
router.post('/withdrawals/:id/decide', staff, validate({ ...idParam, ...withdrawDecide }), ctrl.decideWithdrawal);

module.exports = router;
