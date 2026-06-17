'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/notifications.controller');
const { notificationQuery } = require('../validators/misc.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(authenticate);
router.get('/', validate(notificationQuery), ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.markAllRead);
router.post('/:id/read', validate(idParam), ctrl.markRead);
router.post('/generate', requireAdmin, ctrl.generate);

module.exports = router;
