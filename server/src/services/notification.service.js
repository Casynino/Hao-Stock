'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
// reorder / credit / dashboard are lazy-required inside generateSystemAlerts()
// to avoid circular deps (settlement → notification → dashboard → settlement).

// Visibility rule: a user sees their own notifications plus broadcasts
// (userId = null). Admins effectively see everything via broadcasts.
function visibilityWhere(user) {
  if (!user) return {};
  return { OR: [{ userId: user.id }, { userId: null }] };
}

async function list(user, filters, pagination) {
  const where = { ...visibilityWhere(user) };
  if (filters.type) where.type = filters.type;
  if (filters.isRead !== undefined) where.isRead = filters.isRead;
  if (filters.severity) where.severity = filters.severity;

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...visibilityWhere(user), isRead: false } }),
  ]);
  return { items, total, unread };
}

async function unreadCount(user) {
  return prisma.notification.count({ where: { ...visibilityWhere(user), isRead: false } });
}

async function markRead(id, user) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) throw ApiError.notFound('Notification not found');
  return prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
}

async function markAllRead(user) {
  const result = await prisma.notification.updateMany({
    where: { ...visibilityWhere(user), isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: result.count };
}

async function create(data) {
  return prisma.notification.create({ data });
}

// Create a notification only if an equivalent unread one does not already
// exist (avoid spamming the same alert every run).
async function createIfAbsent(data) {
  const existing = await prisma.notification.findFirst({
    where: { type: data.type, entityId: data.entityId ?? null, isRead: false },
  });
  if (existing) return existing;
  return prisma.notification.create({ data });
}

// Scan current business state and raise system alerts. Safe to run on a
// schedule or on demand.
async function generateSystemAlerts() {
  const reorder = require('./reorder.service');
  const credit = require('./credit.service');
  const dashboard = require('./dashboard.service');

  const [reorderData, lowStock, debt, repStock] = await Promise.all([
    reorder.reorderAnalysis(),
    reorder.lowStock(),
    credit.debtSummary(),
    dashboard.outstandingRepStock(),
  ]);

  let created = 0;
  const push = async (data) => {
    await createIfAbsent(data);
    created += 1;
  };

  for (const r of reorderData.recommendations) {
    await push({
      type: 'REORDER',
      severity: r.urgency === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      title: `Reorder: ${r.name}`,
      message: r.message,
      entityType: 'Product',
      entityId: r.productId,
      data: { recommendedQty: r.recommendedQty, daysRemaining: r.daysRemaining },
    });
  }

  for (const p of lowStock) {
    await push({
      type: 'LOW_STOCK',
      severity: 'WARNING',
      title: `Low stock: ${p.name}`,
      message: `${p.name} is at ${p.onHand} ${p.baseUnitName}(s), at or below the minimum of ${p.minStockLevel}.`,
      entityType: 'Product',
      entityId: p.id,
    });
  }

  if (debt.overdueAccounts > 0) {
    await push({
      type: 'OVERDUE_DEBT',
      severity: 'CRITICAL',
      title: `${debt.overdueAccounts} overdue debt account(s)`,
      message: `Overdue receivables total ${debt.overdueAmount}. Follow up required.`,
      entityType: 'Debt',
      entityId: 'overdue-summary',
    });
  }

  for (const rep of repStock) {
    await push({
      type: 'OUTSTANDING_REP_STOCK',
      severity: 'INFO',
      title: `${rep.name} holds ${rep.heldBaseUnits} unit(s)`,
      message: `${rep.name} (${rep.code}) is still holding ${rep.heldBaseUnits} base units of stock.`,
      entityType: 'SalesRepresentative',
      entityId: rep.salesRepId,
    });
  }

  return { created };
}

// Broadcast to all admins (userId = null means every admin sees it).
async function notifyAdmins(data) {
  return create({ ...data, userId: null });
}

// Notify a specific user by their User.id.
async function notifyUser(userId, data) {
  if (!userId) return;
  return create({ ...data, userId });
}

// After stock leaves a warehouse, check if any product is now at or below its
// minimum level and raise a LOW_STOCK / out-of-stock alert if needed.
// Safe to call fire-and-forget — never throws.
async function checkProductLowStock(productId) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, minStockLevel: true, baseUnitName: true },
    });
    if (!product || product.minStockLevel <= 0) return;

    const agg = await prisma.warehouseStock.aggregate({
      where: { productId },
      _sum: { baseQuantity: true },
    });
    const onHand = agg._sum.baseQuantity || 0;

    if (onHand <= 0) {
      await createIfAbsent({
        type: 'LOW_STOCK',
        severity: 'CRITICAL',
        title: `Out of stock: ${product.name}`,
        message: `${product.name} is OUT OF STOCK across all warehouses. Immediate restock required.`,
        entityType: 'Product',
        entityId: productId,
        userId: null,
      });
    } else if (onHand <= product.minStockLevel) {
      await createIfAbsent({
        type: 'LOW_STOCK',
        severity: 'WARNING',
        title: `Low stock: ${product.name}`,
        message: `${product.name} has ${onHand} ${product.baseUnitName}(s) remaining — below minimum of ${product.minStockLevel}. Restock needed.`,
        entityType: 'Product',
        entityId: productId,
        userId: null,
      });
    }
  } catch {
    // Never let a stock alert break the main flow.
  }
}

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  create,
  createIfAbsent,
  notifyAdmins,
  notifyUser,
  checkProductLowStock,
  generateSystemAlerts,
};
