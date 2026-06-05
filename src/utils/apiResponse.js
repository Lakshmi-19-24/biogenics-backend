/**
 * Sends a consistent JSON response body.
 *
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message
 * @param {unknown} [data]
 * @returns {import('express').Response}
 */
export const sendResponse = (res, statusCode, message, data = null) =>
  res.status(statusCode).json({
    success: statusCode < 400,
    message,
    data
  });
