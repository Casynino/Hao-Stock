'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/roles.controller');
const { roleUpsert } = require('../validators/misc.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get('/', ctrl.list);
router.get('/permissions', ctrl.listPermissions);
router.get('/:id', validate(idParam), ctrl.get);
router.post('/', validate(roleUpsert), ctrl.create);
router.put('/:id', validate({ ...idParam, ...roleUpsert }), ctrl.update);
router.delete('/:id', validate(idParam), ctrl.remove);

module.exports = router;
