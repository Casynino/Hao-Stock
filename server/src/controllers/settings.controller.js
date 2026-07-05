'use strict';

const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const audit = require('../services/audit.service');

const list = asyncHandler(async (_req, res) => {
  const settings = await prisma.setting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  return ok(res, settings);
});

const get = asyncHandler(async (req, res) => {
  const setting = await prisma.setting.findUnique({ where: { key: req.params.key } });
  return ok(res, setting);
});

// Create or update a setting by key.
const upsert = asyncHandler(async (req, res) => {
  const { value, type, group, description } = req.body;
  const setting = await prisma.setting.upsert({
    where: { key: req.params.key },
    create: {
      key: req.params.key,
      value,
      type: type || 'STRING',
      group: group || 'general',
      description: description || null,
      updatedById: req.user.id,
    },
    update: {
      value,
      type: type || undefined,
      group: group || undefined,
      description: description ?? undefined,
      updatedById: req.user.id,
    },
  });
  await audit.record(req, { action: 'UPSERT', entityType: 'Setting', entityId: setting.key, newValues: { value } });
  return ok(res, setting);
});

// ── WhatsApp notification centre (admin) ─────────────────────────────────────
const whatsappTypes = asyncHandler(async (_req, res) => {
  const wa = require('../services/whatsappNotify.service');
  return ok(res, Object.entries(wa.TYPES)
    .filter(([key]) => key !== 'TEST')
    .map(([key, t]) => ({ key, label: t.label, priority: t.priority })));
});

const whatsappHistory = asyncHandler(async (req, res) => {
  const wa = require('../services/whatsappNotify.service');
  return ok(res, await wa.history(req.query.limit));
});

const whatsappTest = asyncHandler(async (req, res) => {
  const wa = require('../services/whatsappNotify.service');
  const result = await wa.test();
  await audit.record(req, { action: 'CREATE', entityType: 'WhatsAppNotification', entityId: 'test', newValues: { sent: result.sent ?? false } });
  return ok(res, result);
});

module.exports = { list, get, upsert, whatsappTypes, whatsappHistory, whatsappTest };
