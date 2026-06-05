import { Router } from 'express';
import {
  checkInVisit,
  completeVisit,
  createVisit,
  listVisits,
  uploadVisitAttachment
} from '../controllers/visit.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

export const visitRouter = Router();

visitRouter.use(authenticate);
visitRouter.route('/').get(listVisits).post(createVisit);
visitRouter.patch('/:id/check-in', checkInVisit);
visitRouter.patch('/:id/complete', completeVisit);
visitRouter.post('/:id/attachments', upload.single('file'), uploadVisitAttachment);
