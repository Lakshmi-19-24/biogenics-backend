import { Router } from 'express';
import {
  createQuotation,
  listQuotations,
  updateQuotationStatus,
  deleteQuotation,
} from "../controllers/quotation.controller.js";
import { authenticate } from '../middlewares/auth.js';

export const quotationRouter = Router();

quotationRouter.use(authenticate);
quotationRouter.route('/').get(listQuotations).post(createQuotation);
quotationRouter.patch('/:id/status', updateQuotationStatus);
quotationRouter.delete("/:id", deleteQuotation);