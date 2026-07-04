import { Router } from 'express';
import { dashboardSummary, salesByEmployee } from '../controllers/analytics.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const analyticsRouter = Router();

// Login required for all analytics routes
analyticsRouter.use(authenticate);

// Dashboard can be accessed by Admin, Manager and Sales Executive
analyticsRouter.get(
  '/dashboard',
  authorize(...ADMIN_ROLES, ROLES.MANAGER, ROLES.SALES_EXECUTIVE),
  dashboardSummary
);

// Admin & Manager only
analyticsRouter.get(
  '/',
  authorize(...ADMIN_ROLES, ROLES.MANAGER),
  dashboardSummary
);

analyticsRouter.get(
  '/sales-by-employee',
  authorize(...ADMIN_ROLES, ROLES.MANAGER),
  salesByEmployee
);