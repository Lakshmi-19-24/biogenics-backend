import { Quotation } from '../models/quotation.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';

const makeQuotationNo = () => `QUO-${Date.now()}`;
export const createQuotation = asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
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

  console.log(
    "QUOTATION ASSIGNED TO:",
    assignedTo
  );

  console.log(
    "REQUEST BODY:",
    req.body
  );

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
});

export const listQuotations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (req.query.customer) {
    filter.customer = req.query.customer;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Sales executives can see ONLY quotations assigned to them.
  if (req.user.role === "sales") {
    filter.assignedTo = req.user._id;
  }

  const [items, total] = await Promise.all([
    Quotation.find(filter)
      .populate("customer", "name phone")
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email role")
      .skip(skip)
      .limit(limit)
      .sort("-createdAt"),

    Quotation.countDocuments(filter),
  ]);

  sendResponse(res, 200, "Quotations fetched", {
    items,
    page,
    limit,
    total,
  });
});

export const updateQuotationStatus = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true, runValidators: true }
  );
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  sendResponse(res, 200, 'Quotation status updated', quotation);
});
