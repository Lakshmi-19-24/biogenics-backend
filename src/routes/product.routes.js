import { Router } from 'express';
import {
  adjustStock,
  createProduct,
  decideProductDeletionRequest,
  deleteProduct,
  listDeletedProducts,
  listProductDeletionRequests,
  listProducts,
  updateProduct,
  uploadProductImage
} from '../controllers/product.controller.js';
import { ADMIN_ROLES, ROLES } from '../constants/roles.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

export const productRouter = Router();

productRouter.use(authenticate);
productRouter.get('/', listProducts);
productRouter.get('/bin', listDeletedProducts);
productRouter.get('/deletion-requests', authorize(...ADMIN_ROLES), listProductDeletionRequests);
productRouter.post('/deletion-requests/:id/:decision', authorize(...ADMIN_ROLES), decideProductDeletionRequest);
productRouter.post('/', authorize(...ADMIN_ROLES, ROLES.MANAGER), createProduct);
productRouter.patch('/:id', authorize(...ADMIN_ROLES, ROLES.MANAGER), updateProduct);
productRouter.delete('/:id', authorize(...ADMIN_ROLES, ROLES.MANAGER), deleteProduct);
productRouter.post('/:id/stock', authorize(...ADMIN_ROLES, ROLES.MANAGER), adjustStock);
productRouter.post('/:id/images', authorize(...ADMIN_ROLES, ROLES.MANAGER), upload.single('file'), uploadProductImage);
