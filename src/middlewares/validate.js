import { ApiError } from '../utils/apiError.js';

/**
 * Validates request segments with a Joi schema map.
 *
 * @param {{ body?: import('joi').Schema, params?: import('joi').Schema, query?: import('joi').Schema }} schemas
 * @returns {import('express').RequestHandler}
 */
export const validate = (schemas) => (req, _res, next) => {
  const errors = [];

  for (const [segment, schema] of Object.entries(schemas)) {
    const { error, value } = schema.validate(req[segment], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) errors.push(...error.details.map((detail) => detail.message));
    req[segment] = value;
  }

  if (errors.length) return next(new ApiError(422, 'Validation failed', errors));
  return next();
};
