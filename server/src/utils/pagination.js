'use strict';

// Parse `page`, `limit`, `sortBy`, `sortDir` from a query object into Prisma
// skip/take/orderBy. Defensive against junk input.
function parsePagination(query = {}, defaults = {}) {
  const {
    defaultLimit = 20,
    maxLimit = 200,
    defaultSortBy = 'createdAt',
    defaultSortDir = 'desc',
    allowedSortFields = null,
  } = defaults;

  let page = parseInt(query.page, 10);
  if (Number.isNaN(page) || page < 1) page = 1;

  let limit = parseInt(query.limit, 10);
  if (Number.isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  let sortBy = query.sortBy || defaultSortBy;
  if (allowedSortFields && !allowedSortFields.includes(sortBy)) {
    sortBy = defaultSortBy;
  }

  const sortDir = String(query.sortDir).toLowerCase() === 'asc' ? 'asc' : defaultSortDir;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { [sortBy]: sortDir },
  };
}

module.exports = { parsePagination };
