'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, requireAdmin, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/sales.controller');
const { saleCreate, saleQuery, cancelSale } = require('../validators/sales.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
// Direct warehouse sales are an admin/warehouse activity. Sales reps do NOT
// record customer sales — they only settle issued stock box by box.
const sellers = requireRoles(ROLES.WAREHOUSE_STAFF);

router.use(authenticate);
router.get('/', validate(saleQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', sellers, validate(saleCreate), ctrl.create);
router.post('/:id/cancel', requireAdmin, validate({ ...idParam, ...cancelSale }), ctrl.cancel);

module.exports = router;
