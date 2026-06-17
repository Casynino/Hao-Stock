'use strict';

const { PrismaClient } = require('@prisma/client');

// Single shared PrismaClient. We attach it to globalThis so it is reused across
// dev hot-reloads (nodemon) AND warm serverless invocations on Vercel — both
// would otherwise create duplicate clients and exhaust the connection pool.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__haoStockPrisma ||
  new PrismaClient({ log: ['warn', 'error'] });

globalForPrisma.__haoStockPrisma = prisma;

module.exports = prisma;
