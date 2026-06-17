'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, requireAdmin, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/inventory.controller');
const { stockIn, adjustment, damage, balanceQuery, movementQuery } = require('../validators/inventory.validator');

const router = express.Router();
const warehouseStaff = requireRoles(ROLES.WAREHOUSE_STAFF);

router.use(authenticate);

router.get('/balances', validate(balanceQuery), ctrl.balances);
router.get('/movements', validate(movementQuery), ctrl.movements);

router.post('/stock-in', warehouseStaff, validate(stockIn), ctrl.stockIn);
router.post('/adjustments', warehouseStaff, validate(adjustment), ctrl.adjust);
router.post('/damage', warehouseStaff, validate(damage), ctrl.damage);
router.post('/recompute-caches', requireAdmin, ctrl.recomputeCaches);

module.exports = router;
