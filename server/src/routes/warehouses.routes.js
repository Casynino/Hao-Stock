'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/warehouses.controller');
const { warehouseCreate, warehouseUpdate } = require('../validators/people.validator');
const { namedQuery } = require('../validators/catalog.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(namedQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', requireAdmin, validate(warehouseCreate), ctrl.create);
router.put('/:id', requireAdmin, validate({ ...idParam, ...warehouseUpdate }), ctrl.update);
router.delete('/:id', requireAdmin, validate(idParam), ctrl.remove);

module.exports = router;
