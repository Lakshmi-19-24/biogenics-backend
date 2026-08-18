/**
 * Builds pagination options from a request query object.
 *
 * Default maximum limit is 100.
 *
 * Individual controllers can request a different
 * maximum by passing a second argument.
 *
 * @param {Record<string, unknown>} query
 * @param {number} maxLimit
 * @returns {{ page: number, limit: number, skip: number }}
 */
export const getPagination = (
  query,
  maxLimit = 100
) => {
  const page = Math.max(
    Number(query.page || 1),
    1
  );

  const requestedLimit = Math.max(
    Number(query.limit || 20),
    1
  );

  const limit = Math.min(
    requestedLimit,
    maxLimit
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

/**
 * Creates a case-insensitive search filter
 * for selected fields.
 *
 * @param {string | undefined} search
 * @param {string[]} fields
 * @returns {Record<string, unknown>}
 */
export const buildSearchFilter = (
  search,
  fields
) => {
  if (!search) {
    return {};
  }

  return {
    $or: fields.map(
      (field) => ({
        [field]: {
          $regex: search,
          $options: "i",
        },
      })
    ),
  };
};