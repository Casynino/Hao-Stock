'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/settings.controller');
const { settingUpsert } = require('../validators/misc.validator');

const router = express.Router();

router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:key', ctrl.get);
router.put('/:key', requireAdmin, validate(settingUpsert), ctrl.upsert);

module.exports = router;
