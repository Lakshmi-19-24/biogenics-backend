import { Router } from 'express';
import { createTarget, listTargets, updateTargetProgress } from '../controllers/target.controller.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const targetRouter = Router();

targetRouter.use(authenticate);
targetRouter.get('/', listTargets);
targetRouter.post('/', authorize(...MANAGEMENT_ROLES), createTarget);
targetRouter.patch('/:id/progress', authorize(...MANAGEMENT_ROLES), updateTargetProgress);
