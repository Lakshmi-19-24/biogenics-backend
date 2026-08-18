import { Router } from "express";

import {
  deleteDocument,
  listDocuments,
  updateDocument,
  uploadDocument,
  completeDocumentReminder,
  listDocumentSharingUsers,
} from "../controllers/document.controller.js";

import { authenticate } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

export const documentRouter = Router();

documentRouter.use(authenticate);

/*
 * Users who can be selected for document visibility.
 *
 * IMPORTANT:
 * This is NOT the /users management route.
 * Sales can use this only for document sharing.
 */
documentRouter.get(
  "/sharing-users",
  listDocumentSharingUsers
);

documentRouter.get(
  "/",
  listDocuments
);

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