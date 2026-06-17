'use strict';

const env = require('../config/env');

// Minimal leveled logger. Avoids a heavyweight dependency while still giving
// structured, timestamped output that plays well with container log drains.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = LEVELS[env.logLevel] ?? LEVELS.info;

function emit(level, args) {
  if (LEVELS[level] > activeLevel) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(prefix, ...args);
}

module.exports = {
  error: (...args) => emit('error', args),
  warn: (...args) => emit('warn', args),
  info: (...args) => emit('info', args),
  debug: (...args) => emit('debug', args),
};
