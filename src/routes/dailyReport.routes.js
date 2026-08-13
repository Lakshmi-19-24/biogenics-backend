import { Router } from "express";

import {
  listDailyReports,
  listMyDailyReports,
  reviewDailyReport,
  submitDailyReport,
  replyToDailyReport,
} from "../controllers/dailyReport.controller.js";

import {
  ADMIN_ROLES,
  ROLES,
} from "../constants/roles.js";

import {
  authenticate,
  authorize,
} from "../middlewares/auth.js";

export const dailyReportRouter =
  Router();

dailyReportRouter.use(
  authenticate
);

// Submit daily report
dailyReportRouter.post(
  "/",
  submitDailyReport
);

// Employee's own reports
dailyReportRouter.get(
  "/mine",
  listMyDailyReports
);

// Management can view all reports
dailyReportRouter.get(
  "/",
  authorize(
    ...ADMIN_ROLES,
    ROLES.MANAGER
  ),
  listDailyReports
);

// Management can review reports
dailyReportRouter.patch(
  "/:id/review",
  authorize(
    ...ADMIN_ROLES,
    ROLES.MANAGER
  ),
  reviewDailyReport
);

// Admin/Manager/Sales can reply
dailyReportRouter.post(
  "/:id/reply",
  replyToDailyReport
);