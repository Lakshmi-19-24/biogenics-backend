import { User } from '../models/user.model.js';
import { ROLES } from '../constants/roles.js';
import { createSalesProfileChangeRequest } from './user.controller.js';
import crypto from 'node:crypto';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { env } from '../config/env.js';

const durationMs = (value, fallbackMs) => {
  const match = String(value || '').trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
};

const refreshCookieOptions = () => {
  const secure = env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/api/v1/auth',
    maxAge: durationMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000)
  };
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const issueTokens = async (user, res) => {
  const payload = { id: user._id.toString(), role: user.role };
  const accessToken = createAccessToken(payload);
  const refreshToken = createRefreshToken(payload);

  user.refreshTokenHash = hashToken(refreshToken);
  user.refreshToken = undefined;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());

  return { accessToken };
};

/**
 * Registers the first/admin-created user.
 */
export const register = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  const safeUser = await User.findById(user._id).select('-password -refreshToken');
  sendResponse(res, 201, 'User registered', safeUser);
});

/**
 * Logs a user in and returns JWT tokens.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).select('+password +refreshToken');
  const compareResult = user ? await user.comparePassword(password) : false;

  if (!user || !compareResult) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(403, 'User account is inactive');

  const tokens = await issueTokens(user, res);
  const safeUser = await User.findById(user._id).select('-password -refreshToken');

  sendResponse(res, 200, 'Logged in successfully', { user: safeUser, ...tokens });
});

/**
 * Refreshes an access token using a valid refresh token.
 */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, 'Refresh token is required');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    res.clearCookie('refreshToken', refreshCookieOptions());
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.id).select('+refreshTokenHash +refreshToken');
  const incomingHash = hashToken(token);
  const storedHash = user?.refreshTokenHash || (user?.refreshToken ? hashToken(user.refreshToken) : null);
  if (!user || storedHash !== incomingHash) {
    res.clearCookie('refreshToken', refreshCookieOptions());
    throw new ApiError(401, 'Invalid refresh token');
  }

  const tokens = await issueTokens(user, res);
  const safeUser = await User.findById(user._id).select('-password -refreshToken -refreshTokenHash');
  sendResponse(res, 200, 'Token refreshed', { ...tokens, user: safeUser });
});

/**
 * Logs out the authenticated user.
 */
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  let userId = req.user?._id;

  if (!userId && token) {
    try {
      const payload = verifyRefreshToken(token);
      userId = payload.id;
    } catch (_error) {
      userId = null;
    }
  }

  if (userId) {
    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1, refreshTokenHash: 1 } });
  }
  res.clearCookie('refreshToken', refreshCookieOptions());
  sendResponse(res, 200, 'Logged out successfully');
});

export const me = asyncHandler(async (req, res) => {
  sendResponse(res, 200, 'Current user', req.user);
});

export const refreshStatus = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return sendResponse(res, 200, 'Refresh session status', {
      hasRefreshCookie: false,
      valid: false
    });
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.id).select('+refreshTokenHash +refreshToken');
    const incomingHash = hashToken(token);
    const storedHash = user?.refreshTokenHash || (user?.refreshToken ? hashToken(user.refreshToken) : null);

    return sendResponse(res, 200, 'Refresh session status', {
      hasRefreshCookie: true,
      valid: Boolean(user && storedHash === incomingHash),
      userId: user?._id,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null
    });
  } catch (_error) {
    return sendResponse(res, 200, 'Refresh session status', {
      hasRefreshCookie: true,
      valid: false
    });
  }
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  if (user.role !== ROLES.OWNER) {
    const request = await createSalesProfileChangeRequest({
      user,
      newPassword
    });

    return sendResponse(res, 202, 'Password change request sent for approval', request);
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, 200, 'Password changed successfully');
});
