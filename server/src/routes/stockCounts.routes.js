'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/stockCounts.controller');
const { stockCountCreate, stockCountQuery } = require('../validators/inventory.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const counters = requireRoles(ROLES.WAREHOUSE_STAFF, ROLES.SALES_REP);

router.use(authenticate);
router.get('/missing', ctrl.missing);
router.get('/', validate(stockCountQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', counters, validate(stockCountCreate), ctrl.create);

module.exports = router;
