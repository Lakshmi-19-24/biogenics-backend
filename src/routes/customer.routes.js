import { Router } from 'express';
import {
  addInteraction,
  createCustomer,
  deleteCustomer,
  getCustomer,
  getPurchaseHistory,
  listDeletedCustomers,
  listCustomers,
  restoreCustomer,
  updateCustomer
} from '../controllers/customer.controller.js';
import { authenticate } from '../middlewares/auth.js';

export const customerRouter = Router();

customerRouter.use(authenticate);
customerRouter.route('/').get(listCustomers).post(createCustomer);
customerRouter.get('/bin', listDeletedCustomers);
customerRouter.get('/:id/purchase-history', getPurchaseHistory);
customerRouter.post('/:id/restore', restoreCustomer);
customerRouter.route('/:id').get(getCustomer).patch(updateCustomer).delete(deleteCustomer);
customerRouter.post('/:id/interactions', addInteraction);
