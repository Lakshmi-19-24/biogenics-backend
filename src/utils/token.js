import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Creates a short-lived access token.
 *
 * @param {{ id: string, role: string }} payload
 * @returns {string}
 */
export const createAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });

/**
 * Creates a refresh token.
 *
 * @param {{ id: string, role: string }} payload
 * @returns {string}
 */
export const createRefreshToken = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });

/**
 * Verifies an access token and returns its payload.
 *
 * @param {string} token
 * @returns {{ id: string, role: string }}
 */
export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);

/**
 * Verifies a refresh token and returns its payload.
 *
 * @param {string} token
 * @returns {{ id: string, role: string }}
 */
export const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);
