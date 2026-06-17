'use strict';

const prisma = require('../config/prisma');
const logger = require('../utils/logger');

// Pull the actor + network context off a request for audit entries.
function contextFromReq(req) {
  if (!req) return {};
  const ipAddress =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  return {
    userId: req.user ? req.user.id : null,
    ipAddress,
    userAgent: req.headers['user-agent'] || null,
  };
}

// Write an audit row. Auditing must never break the business operation, so
// failures here are logged and swallowed. Pass a tx client to record inside an
// existing transaction.
async function log(entry, client = prisma) {
  try {
    await client.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ? String(entry.entityId) : null,
        oldValues: entry.oldValues ?? undefined,
        newValues: entry.newValues ?? undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error('Failed to write audit log', err.message);
  }
}

// Convenience: record an action using request context in one call.
async function record(req, { action, entityType, entityId, oldValues, newValues }, client) {
  return log(
    { ...contextFromReq(req), action, entityType, entityId, oldValues, newValues },
    client,
  );
}

module.exports = { log, record, contextFromReq };
