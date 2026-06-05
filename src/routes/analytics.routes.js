import { Router } from 'express';
import { dashboardSummary, salesByEmployee } from '../controllers/analytics.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate, authorize(...ADMIN_ROLES, ROLES.MANAGER));
analyticsRouter.get('/', dashboardSummary);
analyticsRouter.get('/dashboard', dashboardSummary);
analyticsRouter.get('/sales-by-employee', salesByEmployee);
