import { Invoice } from '../models/invoice.model.js';
import { Order } from '../models/order.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { uploadToImageKit } from '../utils/uploadToImagekit.js';

const makeInvoiceNo = () => `INV-${Date.now()}`;

export const createInvoiceFromOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.body.order);
  if (!order) throw new ApiError(404, 'Order not found');

  const existing = await Invoice.findOne({ order: order._id });
  if (existing) throw new ApiError(409, 'Invoice already exists for this order');

  const invoice = await Invoice.create({
    invoiceNo: makeInvoiceNo(),
    order: order._id,
    customer: order.customer,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    grandTotal: order.grandTotal,
    dueDate: req.body.dueDate,
    status: req.body.status || 'draft',
    createdBy: req.user._id
  });

  sendResponse(res, 201, 'Invoice created', invoice);
});

export const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.order) filter.order = req.query.order;
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    Invoice.find(filter).populate('customer', 'name phone').populate('order', 'orderNo').skip(skip).limit(limit).sort('-createdAt'),
    Invoice.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Invoices fetched', { items, page, limit, total });
});

export const updateInvoiceStatus = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true, runValidators: true }
  );
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  sendResponse(res, 200, 'Invoice status updated', invoice);
});

export const uploadInvoiceFile = asyncHandler(async (req, res) => {
  const file = await uploadToImageKit(req.file, '/biogenics/invoices');
  const invoice = await Invoice.findByIdAndUpdate(
    req.params.id,
    { file },
    { new: true, runValidators: true }
  );
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  sendResponse(res, 200, 'Invoice file uploaded', invoice);
});
