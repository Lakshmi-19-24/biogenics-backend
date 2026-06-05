import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/token.js';
import { User } from '../models/user.model.js';

/**
 * Authenticates a request using a bearer access token.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = bearer;

  if (!token) throw new ApiError(401, 'Authentication required');

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.id).select('-password -refreshToken');

  if (!user || !user.isActive) throw new ApiError(401, 'User is inactive or no longer exists');

  req.user = user;
  next();
});

/**
 * Restricts a route to one of the provided roles.
 *
 * @param  {...string} roles
 * @returns {import('express').RequestHandler}
 */
export const authorize = (...roles) => (req, _res, next) => {
  const role = String(req.user?.role || '').toLowerCase().trim();
  if (role === 'owner') return next();
  if (!roles.includes(role)) {
    return next(new ApiError(403, 'You do not have permission to perform this action'));
  }
  return next();
};
