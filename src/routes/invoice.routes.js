import { Router } from 'express';
import { createInvoiceFromOrder, listInvoices, updateInvoiceStatus, uploadInvoiceFile } from '../controllers/invoice.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

export const invoiceRouter = Router();

invoiceRouter.use(authenticate);
invoiceRouter.get('/', listInvoices);
invoiceRouter.post('/', authorize(...ADMIN_ROLES, ROLES.MANAGER), createInvoiceFromOrder);
invoiceRouter.patch('/:id/status', authorize(...ADMIN_ROLES, ROLES.MANAGER), updateInvoiceStatus);
invoiceRouter.post('/:id/file', authorize(...ADMIN_ROLES, ROLES.MANAGER), upload.single('file'), uploadInvoiceFile);
