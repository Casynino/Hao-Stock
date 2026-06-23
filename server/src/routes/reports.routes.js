'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/reports.controller');
const { reportQuery } = require('../validators/report.validator');

const router = express.Router();

// Reports are management information — admin and warehouse staff only.
router.use(authenticate, requireRoles(ROLES.WAREHOUSE_STAFF), validate(reportQuery));

router.get('/sales', ctrl.sales);
router.get('/products', ctrl.products);
router.get('/regional', ctrl.regional);
router.get('/sales-reps', ctrl.salesReps);
router.get('/profit', ctrl.profit);
router.get('/profit-overview', ctrl.profitOverview);
router.get('/inventory-valuation', ctrl.inventoryValuation);
router.get('/inventory-movements', ctrl.inventoryMovements);
router.get('/debts', ctrl.debts);

module.exports = router;
