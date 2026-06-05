import { Router } from 'express';
import { clearAllNotifications, deleteNotification, listMyNotifications, markAllNotificationsRead, markNotificationRead } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);
notificationRouter.get('/', listMyNotifications);
notificationRouter.patch('/read-all', markAllNotificationsRead);
notificationRouter.delete('/clear-all', clearAllNotifications);
notificationRouter.patch('/:id/read', markNotificationRead);
notificationRouter.delete('/:id', deleteNotification);
