import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { emitToAdmins, notifyRoles, notifyUser } from '../services/notification.service.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';

const syncOrderPaymentStatus = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');

  const [{ paid = 0 } = {}] = await Payment.aggregate([
    { $match: { order: order._id, status: 'received' } },
    { $group: { _id: '$order', paid: { $sum: '$amount' } } }
  ]);

  order.paymentStatus = paid <= 0 ? 'unpaid' : paid < order.grandTotal ? 'partial' : 'paid';
  await order.save();
  return order;
};

export const recordPayment = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.body.order);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.customer.toString() !== req.body.customer) {
    throw new ApiError(400, 'Payment customer does not match order customer');
  }

  const [{ paid = 0 } = {}] = await Payment.aggregate([
    { $match: { order: order._id, status: 'received' } },
    { $group: { _id: '$order', paid: { $sum: '$amount' } } }
  ]);

  if ((req.body.status || 'received') === 'received' && paid + req.body.amount > order.grandTotal) {
    throw new ApiError(400, 'Payment amount exceeds remaining order balance');
  }

  const payment = await Payment.create({ ...req.body, recordedBy: req.user._id });
  const updatedOrder = await syncOrderPaymentStatus(payment.order);
  emitToAdmins('payment:recorded', { payment, order: updatedOrder });
  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'Payment recorded',
    message: `${req.user.name} recorded INR ${Number(payment.amount || 0).toLocaleString('en-IN')} payment for ${updatedOrder.orderNo}.`,
    type: 'payment',
    data: {
      action: 'payment_recorded',
      paymentId: payment._id.toString(),
      orderId: updatedOrder._id.toString(),
      salesmanId: req.user._id.toString(),
      salesmanName: req.user.name
    }
  });
  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    await notifyUser({
      recipient: req.user._id,
      title: 'Payment recorded',
      message: `You recorded INR ${Number(payment.amount || 0).toLocaleString('en-IN')} payment for ${updatedOrder.orderNo}.`,
      type: 'payment',
      data: {
        action: 'own_payment_recorded',
        paymentId: payment._id.toString(),
        orderId: updatedOrder._id.toString()
      }
    });
  }
  sendResponse(res, 201, 'Payment recorded', { payment, order: updatedOrder });
});

export const listPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.order) filter.order = req.query.order;
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    Payment.find(filter).populate('customer', 'name phone').populate('order', 'orderNo grandTotal').skip(skip).limit(limit).sort('-receivedAt'),
    Payment.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Payments fetched', { items, page, limit, total });
});
