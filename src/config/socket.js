import { Server } from 'socket.io';
import { env } from './env.js';
import { verifyAccessToken } from '../utils/token.js';
import { LocationPing } from '../models/locationPing.model.js';

let io;

/**
 * Initializes Socket.IO and attaches auth-aware room membership.
 *
 * @param {import('node:http').Server} server
 * @returns {Server}
 */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Socket auth token is required'));

      socket.user = verifyAccessToken(token);
      return next();
    } catch (_error) {
      return next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    socket.join(`role:${socket.user.role}`);

    socket.on('sales:location:update', async (payload, ack) => {
      const trackedAt = new Date();
      const eventPayload = {
        user: socket.user.id,
        ...payload,
        trackedAt: trackedAt.toISOString()
      };

      try {
        if (typeof payload?.latitude === 'number' && typeof payload?.longitude === 'number') {
          await LocationPing.create({
            employee: socket.user.id,
            source: 'socket',
            location: { type: 'Point', coordinates: [payload.longitude, payload.latitude] },
            speed: payload.speed,
            battery: payload.battery,
            accuracy: payload.accuracy,
            metadata: payload.metadata,
            trackedAt
          });
        }

        socket.to('role:owner').to('role:admin').to('role:manager').emit('sales:location:updated', eventPayload);
        if (typeof ack === 'function') ack({ success: true, trackedAt: eventPayload.trackedAt });
      } catch (error) {
        if (typeof ack === 'function') ack({ success: false, message: error.message });
      }
    });
  });

  return io;
};

/**
 * Returns the live Socket.IO instance.
 *
 * @returns {Server | undefined}
 */
export const getIO = () => io;
