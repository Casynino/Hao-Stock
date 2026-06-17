'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/packagingUnits.controller');
const { packagingUnitCreate, packagingUnitUpdate } = require('../validators/catalog.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', requireAdmin, validate(packagingUnitCreate), ctrl.create);
router.put('/:id', requireAdmin, validate({ ...idParam, ...packagingUnitUpdate }), ctrl.update);
router.delete('/:id', requireAdmin, validate(idParam), ctrl.remove);

module.exports = router;
