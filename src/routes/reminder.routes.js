import { Router } from 'express';
import { createReminder, listReminders, updateReminder } from '../controllers/reminder.controller.js';
import { authenticate } from '../middlewares/auth.js';

export const reminderRouter = Router();

reminderRouter.use(authenticate);
reminderRouter.route('/').get(listReminders).post(createReminder);
reminderRouter.patch('/:id', updateReminder);
