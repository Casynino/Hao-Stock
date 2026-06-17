'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRoles, ROLES } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/purchases.controller');
const { supplierCreate, supplierUpdate, supplierQuery } = require('../validators/phase2.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();
const staff = requireRoles(ROLES.WAREHOUSE_STAFF);

router.use(authenticate, staff);
router.get('/', validate(supplierQuery), ctrl.listSuppliers);
router.post('/', validate(supplierCreate), ctrl.createSupplier);
router.put('/:id', validate({ ...idParam, ...supplierUpdate }), ctrl.updateSupplier);
router.delete('/:id', validate(idParam), ctrl.removeSupplier);

module.exports = router;
