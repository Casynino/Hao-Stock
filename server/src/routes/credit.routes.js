'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, requireAdmin, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/credit.controller');
const { creditQuery, creditPayment } = require('../validators/sales.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const collectors = requireRoles(ROLES.SALES_REP, ROLES.WAREHOUSE_STAFF);

router.use(authenticate);
router.get('/', validate(creditQuery), ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/:id/payments', collectors, validate({ ...idParam, ...creditPayment }), ctrl.recordPayment);
router.post('/refresh-overdue', requireAdmin, ctrl.refreshOverdue);

module.exports = router;
