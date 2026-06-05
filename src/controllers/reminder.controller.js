import { Reminder } from '../models/reminder.model.js';
import { MANAGEMENT_ROLES } from '../constants/roles.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { notifyRoles, notifyUser } from '../services/notification.service.js';

export const createReminder = asyncHandler(async (req, res) => {
  const assignedTo =
    MANAGEMENT_ROLES.includes(req.user.role) && req.body.assignedTo
      ? req.body.assignedTo
      : req.user._id;

  const reminder = await Reminder.create({ ...req.body, assignedTo, createdBy: req.user._id });
  const populatedReminder = await Reminder.findById(reminder._id).populate('assignedTo createdBy', 'name email role');
  await notifyUser({
    recipient: assignedTo,
    title: 'Reminder created',
    message: reminder.description ? `${reminder.title}: ${reminder.description}` : reminder.title,
    type: 'reminder',
    data: {
      action: 'reminder_created',
      reminderId: reminder._id.toString(),
      dueAt: reminder.dueAt
    }
  });
  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'Reminder created',
    message: `${req.user.name} created reminder: ${reminder.title}.`,
    type: 'reminder',
    excludeUser: assignedTo,
    data: {
      action: 'reminder_created_management',
      reminderId: reminder._id.toString(),
      assignedTo: assignedTo.toString(),
      dueAt: reminder.dueAt
    }
  });
  sendResponse(res, 201, 'Reminder created', populatedReminder);
});

export const listReminders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = MANAGEMENT_ROLES.includes(req.user.role)
    ? {}
    : { $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }] };
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.lead) filter.lead = req.query.lead;

  const [items, total] = await Promise.all([
    Reminder.find(filter).populate('assignedTo createdBy', 'name email role').skip(skip).limit(limit).sort('dueAt'),
    Reminder.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Reminders fetched', { items, page, limit, total });
});

export const updateReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findOneAndUpdate({
    _id: req.params.id,
    $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }]
  }, req.body, {
    new: true,
    runValidators: true
  }).populate('assignedTo createdBy', 'name email role');
  if (!reminder) throw new ApiError(404, 'Reminder not found');
  sendResponse(res, 200, 'Reminder updated', reminder);
});
