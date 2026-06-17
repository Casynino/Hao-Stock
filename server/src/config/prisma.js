'use strict';

const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// Single shared PrismaClient for the whole process. In dev with nodemon the
// module cache is cleared on reload so we attach to globalThis to avoid
// exhausting the connection pool with duplicate clients.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__haoStockPrisma ||
  new PrismaClient({
    log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProd) {
  globalForPrisma.__haoStockPrisma = prisma;
}

module.exports = prisma;
