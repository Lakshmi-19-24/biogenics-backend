import { Customer } from '../models/customer.model.js';
import { Order } from '../models/order.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { buildSearchFilter, getPagination } from '../utils/pagination.js';

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildSearchFilter(req.query.search, ['name', 'phone', 'contactPerson', 'address.city']);
  filter.isActive = { $ne: false };
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.type) filter.type = req.query.type;

  const [items, total, spendRows] = await Promise.all([
    Customer.find(filter).populate('assignedTo', 'name email role').skip(skip).limit(limit).sort('-createdAt'),
    Customer.countDocuments(filter),
    Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: '$customer', totalSpend: { $sum: '$grandTotal' }, totalOrders: { $sum: 1 } } }
    ])
  ]);

  const spendByCustomer = new Map(spendRows.map((row) => [String(row._id), row]));
  const customers = items.map((customer) => {
    const plain = customer.toObject();
    const stats = spendByCustomer.get(String(customer._id));
    return {
      ...plain,
      totalSpend: stats?.totalSpend || 0,
      totalOrders: stats?.totalOrders || 0
    };
  });

  sendResponse(res, 200, 'Customers fetched', { items: customers, page, limit, total });
});

export const listDeletedCustomers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {
    isActive: false,
    ...buildSearchFilter(req.query.search, ['name', 'phone', 'contactPerson', 'address.city'])
  };
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.type) filter.type = req.query.type;

  const [items, total] = await Promise.all([
    Customer.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('deletedBy', 'name role')
      .skip(skip)
      .limit(limit)
      .sort('-deletedAt -updatedAt'),
    Customer.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Deleted customers fetched', { items, page, limit, total });
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.create(req.body);
  sendResponse(res, 201, 'Customer created', customer);
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isActive: { $ne: false } }).populate('assignedTo', 'name email role');
  if (!customer) throw new ApiError(404, 'Customer not found');
  sendResponse(res, 200, 'Customer fetched', customer);
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate({ _id: req.params.id, isActive: { $ne: false } }, req.body, {
    new: true,
    runValidators: true
  });
  if (!customer) throw new ApiError(404, 'Customer not found');
  sendResponse(res, 200, 'Customer updated', customer);
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  if (!customer.isActive) throw new ApiError(400, 'Customer is already in the recycle bin');

  customer.isActive = false;
  customer.deletedAt = new Date();
  customer.deletedBy = req.user._id;
  await customer.save();

  sendResponse(res, 200, 'Customer moved to recycle bin', customer);
});

export const restoreCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  if (customer.isActive) throw new ApiError(400, 'Customer is already active');

  customer.isActive = true;
  customer.deletedAt = undefined;
  customer.deletedBy = undefined;
  await customer.save();

  sendResponse(res, 200, 'Customer restored', customer);
});

export const addInteraction = asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, isActive: { $ne: false } },
    { $push: { interactions: { ...req.body, createdBy: req.user._id } } },
    { new: true, runValidators: true }
  );
  if (!customer) throw new ApiError(404, 'Customer not found');
  sendResponse(res, 201, 'Interaction added', customer);
});

export const getPurchaseHistory = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isActive: { $ne: false } }).select('_id');
  if (!customer) throw new ApiError(404, 'Customer not found');

  const orders = await Order.find({
    $or: [{ customer: customer._id }, { customerId: customer._id }]
  })
    .populate('items.product', 'name category sku')
    .sort('-createdAt');

  const history = orders.map((order) => {
    const orderObject = order.toObject();
    return {
      id: orderObject._id,
      invoiceNumber: orderObject.invoiceNumber || orderObject.orderNo,
      orderDate: orderObject.orderDate || orderObject.createdAt,
      status: orderObject.status,
      grandTotal: orderObject.grandTotal || 0,
      items: (orderObject.items || []).map((item) => {
        const product = item.product || {};
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
        return {
          productId: product._id || item.product,
          productName: item.productName || item.name || product.name || 'Product',
          category: item.category || product.category || '',
          quantity,
          unitPrice,
          totalPrice: Number(item.totalPrice ?? quantity * unitPrice)
        };
      })
    };
  });

  const completedOrders = history.filter((order) => order.status !== 'cancelled');
  const totalOrders = history.length;
  const totalSpend = completedOrders.reduce((sum, order) => sum + Number(order.grandTotal || 0), 0);
  const avgOrderValue = completedOrders.length ? totalSpend / completedOrders.length : 0;
  const lastOrderDate = history[0]?.orderDate || null;

  sendResponse(res, 200, 'Purchase history fetched', {
    summary: { totalOrders, totalSpend, lastOrderDate, avgOrderValue },
    orders: history
  });
});
