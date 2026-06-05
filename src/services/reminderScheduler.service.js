import { Reminder } from '../models/reminder.model.js';
import { notifyUser } from './notification.service.js';

let reminderTimer;

export const processDueReminders = async () => {
  const dueReminders = await Reminder.find({
    status: 'pending',
    notifiedAt: { $exists: false },
    dueAt: { $lte: new Date() }
  }).limit(50);

  await Promise.all(
    dueReminders.map(async (reminder) => {
      await notifyUser({
        recipient: reminder.assignedTo.toString(),
        title: 'Reminder due',
        message: reminder.description ? `${reminder.title}: ${reminder.description}` : reminder.title,
        type: 'reminder',
        data: {
          action: 'reminder_due',
          reminderId: reminder._id.toString(),
          dueAt: reminder.dueAt
        }
      });

      reminder.notifiedAt = new Date();
      await reminder.save();
    })
  );
};

export const startReminderScheduler = () => {
  if (reminderTimer) return;

  processDueReminders().catch((error) => {
    console.error('Reminder scheduler failed:', error);
  });

  reminderTimer = setInterval(() => {
    processDueReminders().catch((error) => {
      console.error('Reminder scheduler failed:', error);
    });
  }, 30000);
};

export const stopReminderScheduler = () => {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = undefined;
};
