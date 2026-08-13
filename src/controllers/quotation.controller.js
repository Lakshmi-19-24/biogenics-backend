import { Quotation } from "../models/quotation.model.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { getPagination } from "../utils/pagination.js";

const makeQuotationNo = () => `QUO-${Date.now()}`;

// =====================================================
// CREATE QUOTATION
// =====================================================

export const createQuotation = asyncHandler(
  async (req, res) => {
    if (
      !Array.isArray(req.body.items) ||
      req.body.items.length === 0
    ) {
      throw new ApiError(
        400,
        "Quotation must contain at least one item"
      );
    }

    const total = req.body.items.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0) *
          Number(item.price || 0),
      0
    );

    const assignedTo = req.body.assignedTo;

    const quotation = await Quotation.create({
      ...req.body,
      quotationNo: makeQuotationNo(),
      total,
      assignedTo,
      createdBy: req.user._id,
    });

    sendResponse(
      res,
      201,
      "Quotation created",
      quotation
    );
  }
);

// =====================================================
// LIST QUOTATIONS
// =====================================================

export const listQuotations = asyncHandler(
  async (req, res) => {
    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const filter = {};

    if (req.query.customer) {
      filter.customer = req.query.customer;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Sales executives can see ONLY
    // quotations assigned to them.
    if (req.user.role === "sales") {
      filter.assignedTo = req.user._id;
    }

    const [
      items,
      total,
    ] = await Promise.all([
      Quotation.find(filter)
        .populate(
          "customer",
          "name phone"
        )
        .populate(
          "createdBy",
          "name email role"
        )
        .populate(
          "assignedTo",
          "name email role"
        )
        .populate(
          "replies.user",
          "name email role"
        )
        .skip(skip)
        .limit(limit)
        .sort("-createdAt"),

      Quotation.countDocuments(filter),
    ]);

    sendResponse(
      res,
      200,
      "Quotations fetched",
      {
        items,
        page,
        limit,
        total,
      }
    );
  }
);

// =====================================================
// UPDATE QUOTATION STATUS
// =====================================================

export const updateQuotationStatus =
  asyncHandler(async (req, res) => {
    const quotation =
      await Quotation.findByIdAndUpdate(
        req.params.id,
        {
          status: req.body.status,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!quotation) {
      throw new ApiError(
        404,
        "Quotation not found"
      );
    }

    sendResponse(
      res,
      200,
      "Quotation status updated",
      quotation
    );
  });

// =====================================================
// DELETE QUOTATION
// =====================================================

export const deleteQuotation =
  asyncHandler(async (req, res) => {
    const quotation =
      await Quotation.findByIdAndDelete(
        req.params.id
      );

    if (!quotation) {
      throw new ApiError(
        404,
        "Quotation not found"
      );
    }

    sendResponse(
      res,
      200,
      "Quotation deleted successfully",
      quotation
    );
  });

// =====================================================
// REPLY TO QUOTATION
// =====================================================

export const replyToQuotation =
  asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (
      !message ||
      !message.trim()
    ) {
      throw new ApiError(
        400,
        "Reply message is required"
      );
    }

    const quotation =
      await Quotation.findById(
        req.params.id
      );

    if (!quotation) {
      throw new ApiError(
        404,
        "Quotation not found"
      );
    }

    // Sales executive can reply ONLY
    // to their own assigned quotation.
    if (
      req.user.role === "sales" &&
      String(
        quotation.assignedTo
      ) !==
        String(req.user._id)
    ) {
      throw new ApiError(
        403,
        "You can only reply to quotations assigned to you"
      );
    }

    // Add reply
    quotation.replies.push({
      user: req.user._id,
      message: message.trim(),
    });

    await quotation.save();

    // Return updated quotation
    // with user details for replies.
    const updatedQuotation =
      await Quotation.findById(
        quotation._id
      )
        .populate(
          "customer",
          "name phone"
        )
        .populate(
          "createdBy",
          "name email role"
        )
        .populate(
          "assignedTo",
          "name email role"
        )
        .populate(
          "replies.user",
          "name email role"
        );

    sendResponse(
      res,
      200,
      "Reply added successfully",
      updatedQuotation
    );
  });