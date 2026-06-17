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

module.exports = { list, get, upsert };
