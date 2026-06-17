'use strict';

const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const inventory = require('./inventory.service');
const sales = require('./sales.service');
const { nextDocNumber } = require('../utils/numbering');
const { toNumber, round2 } = require('../utils/money');

const INCLUDE = {
  customer: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  items: { include: { product: true, packagingUnit: true } },
};

const FORWARD = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

function paymentStatusFor(total, paid) {
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

async function create(payload, actor) {
  if (!payload.items || payload.items.length === 0) throw ApiError.badRequest('An order needs at least one item');

  return prisma.$transaction(async (tx) => {
    const productIds = [...new Set(payload.items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const pMap = new Map(products.map((p) => [p.id, p]));
    if (pMap.size !== productIds.length) throw ApiError.badRequest('One or more products were not found');

    const lines = [];
    for (const i of payload.items) {
      const { packaging } = await inventory.convertToBase(tx, i.productId, i.packagingUnitId, i.quantity);
      const factor = packaging.baseQuantity;
      const product = pMap.get(i.productId);
      const packagingPrice = i.unitPrice != null ? Number(i.unitPrice)
        : packaging.unitPrice != null ? toNumber(packaging.unitPrice)
          : round2(toNumber(product.sellingPrice) * factor);
      lines.push({
        productId: i.productId,
        packagingUnitId: i.packagingUnitId,
        quantity: i.quantity,
        baseQuantity: i.quantity * factor,
        unitPrice: round2(packagingPrice / factor), // per base
        lineTotal: round2(packagingPrice * i.quantity),
      });
    }

    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const discount = round2(payload.discount || 0);
    const total = round2(subtotal - discount);
    const amountPaid = round2(payload.amountPaid || 0);

    let warehouseId = payload.warehouseId;
    if (!warehouseId) {
      const wh = await tx.warehouse.findFirst({ where: { isActive: true }, orderBy: { isPrimary: 'desc' } });
      warehouseId = wh ? wh.id : null;
    }

    const orderNumber = await nextDocNumber(tx.onlineOrder, 'orderNumber', 'ORD');
    const order = await tx.onlineOrder.create({
      data: {
        orderNumber,
        status: 'PENDING',
        paymentStatus: paymentStatusFor(total, amountPaid),
        customerId: payload.customerId || null,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone || null,
        customerEmail: payload.customerEmail || null,
        region: payload.region || null,
        address: payload.address || null,
        courierName: payload.courierName || null,
        trackingNumber: payload.trackingNumber || null,
        subtotal,
        discount,
        total,
        amountPaid,
        warehouseId,
        notes: payload.notes || null,
        createdById: actor ? actor.id : null,
        items: { create: lines },
      },
    });
    return tx.onlineOrder.findUnique({ where: { id: order.id }, include: INCLUDE });
  });
}

async function list(filters, pagination) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
  if (filters.search) {
    where.OR = [
      { orderNumber: { contains: filters.search, mode: 'insensitive' } },
      { customerName: { contains: filters.search, mode: 'insensitive' } },
      { customerPhone: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.onlineOrder.findMany({ where, include: INCLUDE, skip: pagination.skip, take: pagination.take, orderBy: pagination.orderBy }),
    prisma.onlineOrder.count({ where }),
  ]);
  return { items, total };
}

async function get(id) {
  const o = await prisma.onlineOrder.findUnique({ where: { id }, include: INCLUDE });
  if (!o) throw ApiError.notFound('Online order not found');
  return o;
}

// Advance an order's status. Shipping deducts stock by creating a real Sale
// (so it flows into the ledger, revenue and reports). Cancelling a shipped
// order reverses that sale.
async function updateStatus(id, status, actor) {
  const order = await prisma.onlineOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw ApiError.notFound('Online order not found');
  if (!FORWARD[order.status].includes(status)) {
    throw ApiError.badRequest(`Cannot move order from ${order.status} to ${status}`);
  }

  const data = { status };

  if (status === 'SHIPPED' && !order.saleId) {
    const sale = await sales.createSale(
      {
        type: 'CASH',
        customerId: order.customerId || null,
        warehouseId: order.warehouseId,
        amountPaid: toNumber(order.amountPaid),
        discount: toNumber(order.discount),
        notes: `Online order ${order.orderNumber}`,
        items: order.items.map((it) => ({
          productId: it.productId,
          packagingUnitId: it.packagingUnitId,
          quantity: it.quantity,
          // OnlineOrderItem.unitPrice is per-base; convert back to per-packaging.
          unitPrice: round2(toNumber(it.unitPrice) * (it.baseQuantity / it.quantity)),
        })),
      },
      actor,
    );
    data.saleId = sale.id;
    data.shippedAt = new Date();
  }

  if (status === 'DELIVERED') data.deliveredAt = new Date();

  if (status === 'CANCELLED' && order.saleId) {
    await sales.cancelSale(order.saleId, actor, `Online order ${order.orderNumber} cancelled`);
  }

  return prisma.onlineOrder.update({ where: { id }, data, include: INCLUDE });
}

async function updatePayment(id, { amountPaid, paymentStatus }) {
  const order = await prisma.onlineOrder.findUnique({ where: { id } });
  if (!order) throw ApiError.notFound('Online order not found');
  const paid = amountPaid != null ? round2(amountPaid) : toNumber(order.amountPaid);
  return prisma.onlineOrder.update({
    where: { id },
    data: { amountPaid: paid, paymentStatus: paymentStatus || paymentStatusFor(toNumber(order.total), paid) },
    include: INCLUDE,
  });
}

module.exports = { create, list, get, updateStatus, updatePayment };
