import { Router } from 'express';
import { listDailyReports, listMyDailyReports, reviewDailyReport, submitDailyReport } from '../controllers/dailyReport.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const dailyReportRouter = Router();

dailyReportRouter.use(authenticate);
dailyReportRouter.post('/', submitDailyReport);
dailyReportRouter.get('/mine', listMyDailyReports);
dailyReportRouter.get('/', authorize(...ADMIN_ROLES, ROLES.MANAGER), listDailyReports);
dailyReportRouter.patch('/:id/review', authorize(...ADMIN_ROLES, ROLES.MANAGER), reviewDailyReport);
