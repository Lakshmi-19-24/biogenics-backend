import { Router } from "express";

import {
  deleteDocument,
  listDocuments,
  updateDocument,
  uploadDocument,
  completeDocumentReminder,
} from "../controllers/document.controller.js";

import { authenticate } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

export const documentRouter = Router();

documentRouter.use(authenticate);

documentRouter.get("/", listDocuments);

documentRouter.post(
  "/",
  upload.single("file"),
  uploadDocument
);

documentRouter.patch(
  "/:id/reminder/complete",
  completeDocumentReminder
);

documentRouter
  .route("/:id")
  .patch(updateDocument)
  .delete(deleteDocument);