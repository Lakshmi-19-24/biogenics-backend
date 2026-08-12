import { Router } from 'express';
import {
  listInventoryMovements,
  deleteInventoryMovement
} from '../controllers/inventory.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, authorize(...ADMIN_ROLES, ROLES.MANAGER));
inventoryRouter.get('/movements', listInventoryMovements);
inventoryRouter.delete('/movements/:id', deleteInventoryMovement);