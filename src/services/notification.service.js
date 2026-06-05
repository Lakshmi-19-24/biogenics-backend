import { getIO } from '../config/socket.js';
import { Notification } from '../models/notification.model.js';
import { User } from '../models/user.model.js';

/**
 * Creates a notification and emits it to the recipient socket room.
 *
 * @param {{ recipient: string, title: string, message: string, type?: string, data?: Record<string, unknown> }} payload
 * @returns {Promise<import('../models/notification.model.js').Notification>}
 */
export const notifyUser = async (payload) => {
  const notification = await Notification.create(payload);
  getIO()?.to(`user:${payload.recipient}`).emit('notification:new', notification);
  return notification;
};

export const notifyRoles = async (roles, payload) => {
  const { excludeUser, ...notificationPayload } = payload;
  const recipients = await User.find({
    role: { $in: roles },
    isActive: true,
    ...(excludeUser ? { _id: { $ne: excludeUser } } : {})
  }).select('_id');

  return Promise.all(
    recipients.map((recipient) =>
      notifyUser({
        ...notificationPayload,
        recipient: recipient._id
      })
    )
  );
};

/**
 * Emits an event to admin and owner rooms.
 *
 * @param {string} event
 * @param {unknown} payload
 */
export const emitToAdmins = (event, payload) => {
  getIO()?.to('role:admin').to('role:owner').emit(event, payload);
};
