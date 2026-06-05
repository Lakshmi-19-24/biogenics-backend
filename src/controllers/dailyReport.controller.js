import { DailyReport } from '../models/dailyReport.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { emitToAdmins, notifyRoles } from '../services/notification.service.js';
import { MANAGEMENT_ROLES } from '../constants/roles.js';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Submits or updates the authenticated employee's daily call report.
 */
export const submitDailyReport = asyncHandler(async (req, res) => {
  const reportDate = req.body.reportDate || today();
  const report = await DailyReport.findOneAndUpdate(
    { employee: req.user._id, reportDate },
    { ...req.body, employee: req.user._id, reportDate, status: 'submitted' },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  emitToAdmins('daily-report:submitted', report);
  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'Daily report submitted',
    message: `${req.user.name} submitted a daily report for ${reportDate}.`,
    type: 'system',
    excludeUser: req.user._id,
    data: {
      action: 'daily_report_submitted',
      reportId: report._id.toString(),
      reportDate
    }
  });
  sendResponse(res, 200, 'Daily report submitted', report);
});

export const listDailyReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.reportDate) filter.reportDate = req.query.reportDate;
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    DailyReport.find(filter).populate('employee', 'name email role').skip(skip).limit(limit).sort('-reportDate'),
    DailyReport.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Daily reports fetched', { items, page, limit, total });
});

/**
 * Lists the authenticated employee's daily reports.
 */
export const listMyDailyReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { employee: req.user._id };
  if (req.query.reportDate) filter.reportDate = req.query.reportDate;
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    DailyReport.find(filter).skip(skip).limit(limit).sort('-reportDate'),
    DailyReport.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'My daily reports fetched', { items, page, limit, total });
});

export const reviewDailyReport = asyncHandler(async (req, res) => {
  const report = await DailyReport.findByIdAndUpdate(
    req.params.id,
    {
      status: req.body.status,
      reviewNote: req.body.reviewNote,
      reviewedBy: req.user._id,
      reviewedAt: new Date()
    },
    { new: true, runValidators: true }
  );
  if (!report) throw new ApiError(404, 'Daily report not found');

  sendResponse(res, 200, 'Daily report reviewed', report);
});
