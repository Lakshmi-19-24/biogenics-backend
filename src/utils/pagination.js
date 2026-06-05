/**
 * Builds pagination options from a request query object.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ page: number, limit: number, skip: number }}
 */
export const getPagination = (query) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
};

/**
 * Creates a case-insensitive search filter for selected fields.
 *
 * @param {string | undefined} search
 * @param {string[]} fields
 * @returns {Record<string, unknown>}
 */
export const buildSearchFilter = (search, fields) => {
  if (!search) return {};

  return {
    $or: fields.map((field) => ({
      [field]: { $regex: search, $options: 'i' }
    }))
  };
};
