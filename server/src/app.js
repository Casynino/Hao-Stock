'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./utils/logger');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Behind a proxy/load balancer (Render, Railway, Fly, Nginx) so rate-limit and
// req.ip see the real client address.
app.set('trust proxy', 1);

app.use(helmet());

// CORS — reflect only configured origins; allow non-browser tools (no origin).
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isProd) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));
}

// Global rate limiter (auth endpoints add a stricter one of their own).
app.use(
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests, slow down' } },
  }),
);

// Liveness probe (no auth, no DB).
app.get('/api/health', (_req, res) =>
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }),
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
