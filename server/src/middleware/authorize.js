'use strict';

const ApiError = require('../utils/ApiError');

const ROLES = {
  ADMIN: 'ADMIN',
  SALES_REP: 'SALES_REP',
  WAREHOUSE_STAFF: 'WAREHOUSE_STAFF',
};

// Allow only the listed roles. ADMIN always passes (full access).
function requireRoles(...allowed) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === ROLES.ADMIN) return next();
    if (allowed.includes(req.user.role)) return next();
    return next(ApiError.forbidden('You do not have access to this resource'));
  };
}

// Require a specific permission key. ADMIN bypasses the check.
function requirePermission(...keys) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === ROLES.ADMIN) return next();
    const has = keys.every((k) => req.user.permissions.includes(k));
    if (has) return next();
    return next(ApiError.forbidden('Missing required permission'));
  };
}

const requireAdmin = requireRoles(ROLES.ADMIN);

module.exports = { requireRoles, requirePermission, requireAdmin, ROLES };
