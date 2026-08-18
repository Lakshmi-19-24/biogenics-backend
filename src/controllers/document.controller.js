import { Document } from "../models/document.model.js";
import { User } from "../models/user.model.js";

import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { getPagination } from "../utils/pagination.js";
import { uploadToImageKit } from "../utils/uploadToImagekit.js";

import { MANAGEMENT_ROLES } from "../constants/roles.js";

/*
 * ============================================================
 * NORMALIZE visibleTo
 * ============================================================
 */

const normalizeVisibleTo = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      // Not JSON.
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

/*
 * ============================================================
 * DOCUMENT ACCESS
 * ============================================================
 */

const documentAccessFilter = (user) => {
  /*
   * Owner / Admin / Manager can see everything.
   */
  if (MANAGEMENT_ROLES.includes(user.role)) {
    return {};
  }

  /*
   * Normal users:
   *
   * team      -> visible to team
   * admin     -> uploader can see own admin document
   * users     -> specifically selected users
   * private   -> old documents uploaded by themselves
   */
  return {
    $or: [
      {
        visibility: "team",
      },
      {
        visibility: "admin",
        uploadedBy: user._id,
      },
      {
        visibility: "users",
        visibleTo: user._id,
      },
      {
        visibility: "private",
        uploadedBy: user._id,
      },
    ],
  };
};

/*
 * ============================================================
 * DOCUMENT MANAGEMENT PERMISSION
 * ============================================================
 */

const canManageDocument = (
  document,
  user
) =>
  MANAGEMENT_ROLES.includes(user.role) ||
  String(document.uploadedBy) ===
    String(user._id);

/*
 * ============================================================
 * DOCUMENT SHARING USERS
 * ============================================================
 *
 * Only these three users are returned:
 *
 * Chandru
 * Chandan
 * Shilpa
 */

export const listDocumentSharingUsers =
  asyncHandler(async (req, res) => {
    const allowedNames = [
      "chandru",
      "chandan",
      "shilpa",
    ];

    const users = await User.find({
      isActive: true,

      $expr: {
        $in: [
          {
            $toLower: {
              $trim: {
                input: "$name",
              },
            },
          },
          allowedNames,
        ],
      },
    })
      .select(
        "_id name email role branch territory"
      )
      .sort({
        name: 1,
      });

    console.log(
      "DOCUMENT SHARING USERS:",
      users.map((user) => ({
        id: user._id,
        name: user.name,
        role: user.role,
      }))
    );

    sendResponse(
      res,
      200,
      "Document sharing users fetched",
      {
        items: users,
        total: users.length,
      }
    );
  });

/*
 * ============================================================
 * UPLOAD DOCUMENT
 * ============================================================
 */

export const uploadDocument =
  asyncHandler(async (req, res) => {
    console.log("UPLOAD API HIT");
    console.log("User:", req.user);

    if (!req.file) {
      throw new ApiError(
        400,
        "Document file is required"
      );
    }

    const file =
      await uploadToImageKit(
        req.file,
        "/biogenics/documents"
      );

    let visibility =
      req.body.visibility;

    if (
      ![
        "team",
        "admin",
        "users",
      ].includes(visibility)
    ) {
      visibility = "team";
    }

    let visibleTo =
      normalizeVisibleTo(
        req.body.visibleTo
      );

    /*
     * Specific users must have
     * at least one selected user.
     */
    if (
      visibility === "users" &&
      visibleTo.length === 0
    ) {
      throw new ApiError(
        400,
        "Please select at least one user"
      );
    }

    /*
     * If visibility is not
     * specific users, clear visibleTo.
     */
    if (visibility !== "users") {
      visibleTo = [];
    }

    const document =
      await Document.create({
        ...req.body,

        visibility,

        visibleTo,

        file,

        uploadedBy:
          req.user._id,
      });

    /*
     * Return populated document.
     */
    const populatedDocument =
      await Document.findById(
        document._id
      )
        .populate(
          "uploadedBy",
          "name email role"
        )
        .populate(
          "visibleTo",
          "name email role"
        );

    sendResponse(
      res,
      201,
      "Document uploaded",
      populatedDocument
    );
  });

/*
 * ============================================================
 * LIST DOCUMENTS
 * ============================================================
 *
 * IMPORTANT:
 *
 * Documents can load up to 1000 records.
 *
 * The global pagination maximum can remain
 * at 100 for other modules.
 */

export const listDocuments =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      skip,
    } = getPagination(
      req.query,
      1000
    );

    const filter =
      documentAccessFilter(
        req.user
      );

    if (req.query.customer) {
      filter.customer =
        req.query.customer;
    }

    if (req.query.order) {
      filter.order =
        req.query.order;
    }

    if (req.query.category) {
      filter.category =
        req.query.category;
    }

    const [
      items,
      total,
    ] = await Promise.all([
      Document.find(filter)
        .populate(
          "uploadedBy",
          "name email role"
        )
        .populate(
          "visibleTo",
          "name email role"
        )
        .skip(skip)
        .limit(limit)
        .sort("-createdAt"),

      Document.countDocuments(
        filter
      ),
    ]);

    sendResponse(
      res,
      200,
      "Documents fetched",
      {
        items,
        page,
        limit,
        total,
      }
    );
  });

/*
 * ============================================================
 * UPDATE DOCUMENT
 * ============================================================
 */

export const updateDocument =
  asyncHandler(async (req, res) => {
    const allowed = [
      "title",
      "category",
      "customer",
      "order",
      "visibility",
      "visibleTo",
      "reminderAt",
      "reminderNote",
      "reminderCompleted",
    ];

    const payload = {};

    for (const key of allowed) {
      if (
        req.body[key] !==
        undefined
      ) {
        payload[key] =
          req.body[key];
      }
    }

    /*
     * Validate visibility.
     */
    if (
      payload.visibility &&
      ![
        "team",
        "admin",
        "users",
      ].includes(
        payload.visibility
      )
    ) {
      payload.visibility =
        "team";
    }

    /*
     * Normalize selected users.
     */
    if (
      payload.visibleTo !==
      undefined
    ) {
      payload.visibleTo =
        normalizeVisibleTo(
          payload.visibleTo
        );
    }

    /*
     * Specific users requires
     * at least one selected user.
     */
    if (
      payload.visibility ===
        "users" &&
      (!payload.visibleTo ||
        payload.visibleTo.length ===
          0)
    ) {
      throw new ApiError(
        400,
        "Please select at least one user"
      );
    }

    /*
     * Clear selected users when
     * visibility is team/admin.
     */
    if (
      payload.visibility &&
      payload.visibility !==
        "users"
    ) {
      payload.visibleTo = [];
    }

    /*
     * Find existing document.
     */
    const existing =
      await Document.findOne({
        _id: req.params.id,
        ...documentAccessFilter(
          req.user
        ),
      });

    if (!existing) {
      throw new ApiError(
        404,
        "Document not found"
      );
    }

    /*
     * Check permission.
     */
    if (
      !canManageDocument(
        existing,
        req.user
      )
    ) {
      throw new ApiError(
        403,
        "You cannot update this document"
      );
    }

    /*
     * Update only this document.
     */
    const document =
      await Document.findByIdAndUpdate(
        req.params.id,
        payload,
        {
          new: true,
          runValidators: true,
        }
      )
        .populate(
          "uploadedBy",
          "name email role"
        )
        .populate(
          "visibleTo",
          "name email role"
        );

    if (!document) {
      throw new ApiError(
        404,
        "Document not found"
      );
    }

    sendResponse(
      res,
      200,
      "Document updated",
      document
    );
  });

/*
 * ============================================================
 * DELETE DOCUMENT
 * ============================================================
 *
 * This deletes ONLY the selected document.
 *
 * Creating a new document never calls this function.
 */

export const deleteDocument =
  asyncHandler(async (req, res) => {
    const document =
      await Document.findOne({
        _id: req.params.id,
        ...documentAccessFilter(
          req.user
        ),
      });

    if (!document) {
      throw new ApiError(
        404,
        "Document not found"
      );
    }

    if (
      !canManageDocument(
        document,
        req.user
      )
    ) {
      throw new ApiError(
        403,
        "You cannot delete this document"
      );
    }

    await Document.deleteOne({
      _id: document._id,
    });

    sendResponse(
      res,
      200,
      "Document deleted",
      {
        id: req.params.id,
      }
    );
  });

/*
 * ============================================================
 * COMPLETE REMINDER
 * ============================================================
 */

export const completeDocumentReminder =
  asyncHandler(async (req, res) => {
    const document =
      await Document.findOne({
        _id: req.params.id,
        ...documentAccessFilter(
          req.user
        ),
      });

    if (!document) {
      throw new ApiError(
        404,
        "Document not found"
      );
    }

    if (
      !canManageDocument(
        document,
        req.user
      )
    ) {
      throw new ApiError(
        403,
        "You cannot update this document reminder"
      );
    }

    document.reminderCompleted =
      true;

    await document.save();

    sendResponse(
      res,
      200,
      "Document reminder completed",
      document
    );
  });