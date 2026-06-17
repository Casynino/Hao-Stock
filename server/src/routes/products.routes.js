'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/products.controller');
const {
  productCreate,
  productUpdate,
  setPackagings,
  productQuery,
} = require('../validators/catalog.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(productQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', requireAdmin, validate(productCreate), ctrl.create);
router.put('/:id', requireAdmin, validate({ ...idParam, ...productUpdate }), ctrl.update);
router.put('/:id/packagings', requireAdmin, validate({ ...idParam, ...setPackagings }), ctrl.setPackagings);
router.delete('/:id', requireAdmin, validate(idParam), ctrl.remove);

module.exports = router;
