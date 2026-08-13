import { Router } from "express";

import {
  createQuotation,
  listQuotations,
  updateQuotationStatus,
  deleteQuotation,
  replyToQuotation,
} from "../controllers/quotation.controller.js";

import { authenticate } from "../middlewares/auth.js";

export const quotationRouter = Router();

quotationRouter.use(authenticate);

// Create + list quotations
quotationRouter
  .route("/")
  .get(listQuotations)
  .post(createQuotation);

// Update quotation status
quotationRouter.patch(
  "/:id/status",
  updateQuotationStatus
);

// Delete quotation
quotationRouter.delete(
  "/:id",
  deleteQuotation
);

// Reply to quotation
quotationRouter.post(
  "/:id/reply",
  replyToQuotation
);