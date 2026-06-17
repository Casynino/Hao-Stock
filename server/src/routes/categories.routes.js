'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { makeNamedController } = require('../controllers/namedResource.controller');
const { namedCreate, namedUpdate, namedQuery } = require('../validators/catalog.validator');
const { idParam } = require('../validators/common.validator');

const ctrl = makeNamedController({ model: 'category', entityType: 'Category', productFk: 'categoryId' });
const router = express.Router();

router.use(authenticate);
router.get('/', validate(namedQuery), ctrl.list);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', requireAdmin, validate(namedCreate), ctrl.create);
router.put('/:id', requireAdmin, validate({ ...idParam, ...namedUpdate }), ctrl.update);
router.delete('/:id', requireAdmin, validate(idParam), ctrl.remove);

module.exports = router;
