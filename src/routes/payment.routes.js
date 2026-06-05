import { Router } from 'express';
import { listPayments, recordPayment } from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';

export const paymentRouter = Router();

paymentRouter.use(authenticate);
paymentRouter.route('/').get(listPayments).post(recordPayment);
