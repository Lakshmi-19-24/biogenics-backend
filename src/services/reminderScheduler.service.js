import { Reminder } from '../models/reminder.model.js';
import { DailyReport } from '../models/dailyReport.model.js';
import { User } from '../models/user.model.js';
import { Notification } from '../models/notification.model.js';
import { notifyUser } from './notification.service.js';
import { ROLES } from '../constants/roles.js';

let reminderTimer;

const today = () => {
  return new Date().toISOString().slice(0, 10);
};

/**
 * Process reminders that are due.
 */
export const processDueReminders = async () => {
  const dueReminders = await Reminder.find({
    status: 'pending',
    notifiedAt: { $exists: false },
    dueAt: { $lte: new Date() }
  }).limit(50);

  console.log(
    `🔔 Due reminders found: ${dueReminders.length}`
  );

  await Promise.all(
    dueReminders.map(async (reminder) => {
      console.log(
        `🚨 Sending reminder notification: ${reminder.title}`
      );

      await notifyUser({
        recipient: reminder.assignedTo.toString(),
        title: 'Reminder due',
        message: reminder.description
          ? `${reminder.title}: ${reminder.description}`
          : reminder.title,
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

/**
 * Check for sales employees who have not submitted
 * their daily report for today.
 */
export const processPendingDailyReports = async () => {
  const reportDate = today();

  const salesEmployees = await User.find({
    role: ROLES.SALES_EXECUTIVE,
    isActive: true
  }).select('_id name');

  if (!salesEmployees.length) return;

  const employeeIds = salesEmployees.map(
    (employee) => employee._id
  );

  const submittedReports = await DailyReport.find({
    employee: { $in: employeeIds },
    reportDate
  }).select('employee');

  const submittedEmployeeIds = new Set(
    submittedReports.map(
      (report) => report.employee.toString()
    )
  );

  const pendingEmployees = salesEmployees.filter(
    (employee) =>
      !submittedEmployeeIds.has(
        employee._id.toString()
      )
  );

  console.log(
    `📋 Pending daily reports: ${pendingEmployees.length}`
  );

  await Promise.all(
    pendingEmployees.map(async (employee) => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const existingNotification =
        await Notification.findOne({
          recipient: employee._id,
          'data.action': 'pending_daily_report',
          'data.reportDate': reportDate,
          createdAt: { $gte: startOfToday }
        });

      if (existingNotification) return;

      console.log(
        `📋 Sending pending report notification to ${employee.name}`
      );

      await notifyUser({
        recipient: employee._id.toString(),
        title: 'Pending Daily Report',
        message:
          'Your daily report is pending. Please submit it.',
        type: 'reminder',
        data: {
          action: 'pending_daily_report',
          reportDate,
          employeeId: employee._id.toString()
        }
      });
    })
  );
};

/**
 * Run all pending-work checks.
 */
export const processPendingWork = async () => {
  await Promise.all([
    processDueReminders(),
    processPendingDailyReports()
  ]);
};

/**
 * Start pending-work scheduler.
 */
export const startReminderScheduler = () => {
  if (reminderTimer) return;

  console.log('⏰ Pending-work scheduler started');

  processPendingWork().catch((error) => {
    console.error(
      'Pending work scheduler failed:',
      error
    );
  });

  reminderTimer = setInterval(() => {
    processPendingWork().catch((error) => {
      console.error(
        'Pending work scheduler failed:',
        error
      );
    });
  }, 30000);
};

/**
 * Stop pending-work scheduler.
 */
export const stopReminderScheduler = () => {
  if (reminderTimer) {
    clearInterval(reminderTimer);
  }

  reminderTimer = undefined;
};