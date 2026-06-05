import { Order } from '../models/order.model.js';
import { Product } from '../models/product.model.js';
import { Customer } from '../models/customer.model.js';
import { InventoryMovement } from '../models/inventoryMovement.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { emitToAdmins, notifyRoles, notifyUser } from '../services/notification.service.js';
import { MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';

const makeOrderNo = () => `ORD-${Date.now()}`;

const normalizeLegacyOrderBody = async (body, userId) => {
  if (Array.isArray(body.items) && body.items.length > 0 && body.customer) return body;

  const customerName = typeof body.customer === 'string' ? body.customer : body.customerName;
  if (!customerName) return body;

  const customer = await Customer.findOneAndUpdate(
    { name: customerName },
    {
      $setOnInsert: {
        name: customerName,
        phone: body.phone,
        notes: body.notes
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const amount = Number(body.totalAmount || body.grandTotal || 0);
  const product = await Product.findOneAndUpdate(
    { sku: 'CUSTOM-ORDER-LINE' },
    {
      $setOnInsert: {
        name: 'Custom order line',
        sku: 'CUSTOM-ORDER-LINE',
        category: 'Custom',
        stock: 100000,
        lowStockThreshold: 1,
        createdBy: userId
      },
      $set: { price: amount }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    ...body,
    customer: customer._id,
    items: [{ product: product._id, quantity: 1 }],
    status: {
      Pending: 'draft',
      Confirmed: 'approved',
      Shipped: 'approved',
      Delivered: 'fulfilled',
      Cancelled: 'cancelled'
    }[body.status] || body.status || 'placed'
  };
};

/**
 * Creates an order, snapshots product prices, and reduces inventory.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const body = await normalizeLegacyOrderBody(req.body, req.user._id);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ApiError(400, 'Order must contain at least one item');
  }

  const items = [];
  let subtotal = 0;
  let taxTotal = 0;
  const inventoryMovements = [];

  for (const item of body.items || []) {
    const product = await Product.findById(item.product);
    if (!product || !product.isActive) throw new ApiError(404, `Product not available: ${item.product}`);
    const allocatedQty = Math.min(product.stock, item.quantity);
    const backorderQty = item.quantity - allocatedQty;

    const lineSubtotal = product.price * item.quantity; // full order amount
    const lineTax = (lineSubtotal * product.taxRate) / 100;
    subtotal += lineSubtotal;
    taxTotal += lineTax;

    const lineName = product.supplier ? `${product.supplier} - ${product.name}` : product.name;

    items.push({
      product: product._id,
      name: lineName,
      sku: product.sku,
      quantity: item.quantity, // ordered quantity
      allocatedQuantity: allocatedQty,
      backorderQuantity: backorderQty,
      price: product.price,
      taxRate: product.taxRate
    });

    // Reduce stock and create allocation movement only if there is stock to allocate
    if (allocatedQty > 0) {
      product.stock -= allocatedQty;
      await product.save();

      // Movement for allocated quantity
      inventoryMovements.push({
        product: product._id,
        type: 'sale',
        quantity: allocatedQty,
        referenceType: 'Order',
        note: 'Allocated',
        createdBy: req.user._id
      });
    }
    // If there is a backorder, record it as a sale movement with note
    if (backorderQty > 0) {
      inventoryMovements.push({
        product: product._id,
        type: 'sale',
        quantity: backorderQty,
        referenceType: 'Order',
        note: 'Backorder (remaining)',
        createdBy: req.user._id
      });
    }
  }

  const order = await Order.create({
    ...body,
    orderNo: makeOrderNo(),
    items,
    subtotal,
    taxTotal,
    grandTotal: subtotal + taxTotal,
    placedBy: req.user._id
  });

  await InventoryMovement.insertMany(
    inventoryMovements.map((movement) => ({ ...movement, referenceId: order._id }))
  );

  emitToAdmins('order:created', order);
  // If order is immediately marked as fulfilled, clear backorders
  if (order.status === 'fulfilled') {
    order.items.forEach(item => {
      item.backorderQuantity = 0;
      item.allocatedQuantity = item.quantity;
    });
    await order.save();
  }
  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'New order created',
    message: `${req.user.name} created ${order.orderNo} with value INR ${Number(order.grandTotal || 0).toLocaleString('en-IN')}.`,
    type: 'order',
    data: {
      action: 'order_created',
      orderId: order._id.toString(),
      salesmanId: req.user._id.toString(),
      salesmanName: req.user.name
    }
  });
  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    await notifyUser({
      recipient: req.user._id,
      title: 'Order created',
      message: `You created ${order.orderNo} with value INR ${Number(order.grandTotal || 0).toLocaleString('en-IN')}.`,
      type: 'order',
      data: { action: 'own_order_created', orderId: order._id.toString() }
    });
  }
  sendResponse(res, 201, 'Order created', order);
});

export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.customer) filter.customer = req.query.customer;
  if (req.query.placedBy) filter.placedBy = req.query.placedBy;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('customer', 'name phone')
      .populate('placedBy', 'name email role')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt'),
    Order.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Orders fetched', { items, page, limit, total });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('customer')
    .populate('placedBy approvedBy', 'name email role');
  if (!order) throw new ApiError(404, 'Order not found');
  sendResponse(res, 200, 'Order fetched', order);
});


// Fulfill backorder for a specific order item
export const fulfillBackorder = asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const { product, quantity } = req.body; // product id and quantity to allocate now
  if (!product || !quantity) {
    throw new ApiError(400, 'Product and quantity are required');
  }
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');

  const item = order.items.find(i => i.product.toString() === product && i.backorderQuantity > 0);
  if (!item) throw new ApiError(400, 'No backorder found for this product in the order');

  const allocateQty = Math.min(item.backorderQuantity, Number(quantity));
  const productDoc = await Product.findById(product);
  if (!productDoc) throw new ApiError(404, 'Product not found');

  // Ensure sufficient stock to fulfill the requested quantity
  if (productDoc.stock < allocateQty) {
    throw new ApiError(400, `Insufficient stock (${productDoc.stock}) for requested fulfillment of ${allocateQty}`);
  }
  const stockAllocated = Math.min(productDoc.stock, allocateQty);
  productDoc.stock -= stockAllocated;
  await productDoc.save();

  // Update order item allocations
  item.allocatedQuantity += stockAllocated;
  item.backorderQuantity -= allocateQty;

  await order.save();

  // Record inventory movements
  const movements = [];
  if (stockAllocated > 0) {
    movements.push({
      product: productDoc._id,
      type: 'sale',
      quantity: stockAllocated,
      referenceType: 'Order',
      referenceId: order._id,
      note: 'Allocated (fulfill backorder)',
      createdBy: req.user._id
    });
  }
  if (allocateQty > stockAllocated) {
    // still backorder remaining after this allocation
    movements.push({
      product: productDoc._id,
      type: 'sale',
      quantity: allocateQty - stockAllocated,
      referenceType: 'Order',
      referenceId: order._id,
      note: 'Backorder (remaining)',
      createdBy: req.user._id
    });
  }

  if (movements.length) await InventoryMovement.insertMany(movements);

  sendResponse(res, 200, 'Backorder fulfillment updated', order);
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, approvedBy: req.user._id },
    { new: true, runValidators: true }
  );
  if (!order) throw new ApiError(404, 'Order not found');

  // If order is marked as fulfilled, clear backorders
  if (order.status === 'fulfilled') {
    order.items.forEach(item => {
      item.backorderQuantity = 0;
      // allocated quantity should be full quantity if not already
      item.allocatedQuantity = item.quantity;
    });
    await order.save();
  }

  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'Order status updated',
    message: `${req.user.name} updated ${order.orderNo} to ${order.status}.`,
    type: 'order',
    data: {
      action: 'order_status_updated',
      orderId: order._id.toString(),
      status: order.status,
      salesmanId: req.user._id.toString(),
      salesmanName: req.user.name
    }
  });
  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    await notifyUser({
      recipient: req.user._id,
      title: 'Order status updated',
      message: `You updated ${order.orderNo} to ${order.status}.`,
      type: 'order',
      data: { action: 'own_order_status_updated', orderId: order._id.toString(), status: order.status }
    });
  }
  sendResponse(res, 200, 'Order status updated', order);
});
