import { Router } from 'express';
import { createOrder, getOrder, listOrders, updateOrderStatus, fulfillBackorder } from '../controllers/order.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';

export const orderRouter = Router();

orderRouter.use(authenticate);
orderRouter.route('/').get(listOrders).post(createOrder);
orderRouter.get('/:id', getOrder);
orderRouter.patch('/:id/backorder', authorize(...ADMIN_ROLES, ROLES.MANAGER), fulfillBackorder);
orderRouter.patch('/:id/status', authorize(...ADMIN_ROLES, ROLES.MANAGER), updateOrderStatus);

