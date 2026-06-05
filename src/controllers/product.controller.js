import { Product } from '../models/product.model.js';
import { ProductDeletionRequest } from '../models/productDeletionRequest.model.js';
import { InventoryMovement } from '../models/inventoryMovement.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { buildSearchFilter, getPagination } from '../utils/pagination.js';
import { uploadToImageKit } from '../utils/uploadToImagekit.js';
import { emitToAdmins, notifyRoles, notifyUser } from '../services/notification.service.js';
import { ADMIN_ROLES, MANAGEMENT_ROLES, ROLES } from '../constants/roles.js';

const notifyIfExpiryNear = async (product) => {
  if (!product.expiryDate || product.expiryNotifiedAt) return;

  const now = new Date();
  const warningDate = new Date(now);
  warningDate.setDate(warningDate.getDate() + 30);
  const expiryDate = new Date(product.expiryDate);
  if (expiryDate > warningDate) return;

  await notifyRoles(MANAGEMENT_ROLES, {
    title: expiryDate < now ? 'Product expired' : 'Product expiry approaching',
    message: `${product.name} expires on ${expiryDate.toLocaleDateString('en-IN')}.`,
    type: 'stock',
    data: {
      action: expiryDate < now ? 'product_expired' : 'product_expiry_near',
      productId: product._id.toString(),
      expiryDate
    }
  });

  product.expiryNotifiedAt = new Date();
  await product.save();
};

const softDeleteProduct = async (product, user, reason = '') => {
  if (!product.isActive) return product;

  product.isActive = false;
  product.deletedAt = new Date();
  product.deletedBy = user._id;
  product.deleteReason = reason;
  await product.save();

  return product;
};

const normalizeProductPayload = (body = {}) => {
  const payload = { ...body };
  if (body.supplier !== undefined || body.make !== undefined) {
    payload.supplier = body.supplier || body.make;
    payload.make = body.make || body.supplier;
  }
  if (body.price !== undefined) payload.price = Number(body.price || 0);
  if (body.stock !== undefined) payload.stock = Number(body.stock || 0);
  if (body.lowStockThreshold !== undefined) payload.lowStockThreshold = Number(body.lowStockThreshold);
  if (body.manufactureDate !== undefined) payload.manufactureDate = body.manufactureDate || undefined;
  if (body.expiryDate !== undefined) payload.expiryDate = body.expiryDate || undefined;
  return payload;
};

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildSearchFilter(req.query.search, ['name', 'sku', 'catalogNumber', 'category', 'supplier', 'make', 'batchNumber', 'description']);
  if (req.query.includeSystem !== 'true') filter.sku = { $ne: 'CUSTOM-ORDER-LINE' };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.make) filter.make = req.query.make;
  filter.isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;

  const [items, total] = await Promise.all([
    Product.find(filter).skip(skip).limit(limit).sort('name'),
    Product.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Products fetched', { items, page, limit, total });
});

export const listDeletedProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {
    isActive: false,
    ...buildSearchFilter(req.query.search, ['name', 'sku', 'category', 'supplier'])
  };

  const [items, total] = await Promise.all([
    Product.find(filter)
      .populate('deletedBy', 'name role')
      .skip(skip)
      .limit(limit)
      .sort('-deletedAt -updatedAt'),
    Product.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Deleted products fetched', { items, page, limit, total });
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(normalizeProductPayload(req.body));
  await notifyIfExpiryNear(product);
  sendResponse(res, 201, 'Product created', product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const payload = normalizeProductPayload(req.body);
  const product = await Product.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true
  });
  if (!product) throw new ApiError(404, 'Product not found');
  if (req.body.expiryDate) {
    product.expiryNotifiedAt = undefined;
    await product.save();
    await notifyIfExpiryNear(product);
  }
  sendResponse(res, 200, 'Product updated', product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  if (!product.isActive) throw new ApiError(400, 'Product is already in the bin');

  const reason = req.body?.reason || '';

  if (req.user.role === ROLES.MANAGER) {
    const existing = await ProductDeletionRequest.findOne({
      product: product._id,
      status: 'pending'
    });
    if (existing) throw new ApiError(400, 'A deletion request for this product is already pending');

    const request = await ProductDeletionRequest.create({
      product: product._id,
      requestedBy: req.user._id,
      productSnapshot: {
        name: product.name,
        sku: product.sku,
        supplier: product.supplier,
        category: product.category
      },
      reason
    });

    await notifyRoles(ADMIN_ROLES, {
      title: 'Product delete approval needed',
      message: `${req.user.name} requested deletion approval for ${product.name}.`,
      type: 'system',
      excludeUser: req.user._id,
      data: {
        action: 'product_delete_request',
        requestId: request._id.toString(),
        productId: product._id.toString(),
        productName: product.name,
        sku: product.sku,
        requestedBy: req.user._id.toString(),
        requestedByName: req.user.name,
        requestedByRole: req.user.role
      }
    });

    const populatedRequest = await ProductDeletionRequest.findById(request._id)
      .populate('product', 'name sku supplier category')
      .populate('requestedBy', 'name email role');

    return sendResponse(res, 202, 'Product deletion request sent for approval', populatedRequest);
  }

  if (!ADMIN_ROLES.includes(req.user.role)) {
    throw new ApiError(403, 'Only owner, admin, or manager can delete products');
  }

  await softDeleteProduct(product, req.user, reason);
  sendResponse(res, 200, 'Product moved to bin', product);
});

export const listProductDeletionRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    ProductDeletionRequest.find(filter)
      .populate('product', 'name sku supplier category isActive deletedAt')
      .populate('requestedBy', 'name email role')
      .populate('decidedBy', 'name role')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt'),
    ProductDeletionRequest.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Product deletion requests fetched', { items, page, limit, total });
});

export const decideProductDeletionRequest = asyncHandler(async (req, res) => {
  const { decision } = req.params;
  if (!['approve', 'decline'].includes(decision)) {
    throw new ApiError(400, 'Decision must be approve or decline');
  }

  const request = await ProductDeletionRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Product deletion request not found');
  if (request.status !== 'pending') throw new ApiError(400, 'This request has already been decided');

  const product = await Product.findById(request.product);
  if (!product) throw new ApiError(404, 'Product not found');

  request.status = decision === 'approve' ? 'approved' : 'declined';
  request.decidedBy = req.user._id;
  request.decidedAt = new Date();
  request.decisionNote = req.body?.note || '';

  if (decision === 'approve') {
    await softDeleteProduct(product, req.user, request.reason || request.decisionNote);
  }

  await request.save();

  await notifyUser({
    recipient: request.requestedBy,
    title: `Product deletion ${request.status}`,
    message:
      decision === 'approve'
        ? `${req.user.name} approved deletion of ${request.productSnapshot.name}.`
        : `${req.user.name} declined deletion of ${request.productSnapshot.name}.`,
    type: 'system',
    data: {
      action: 'product_delete_decision',
      requestId: request._id.toString(),
      productId: product._id.toString(),
      status: request.status
    }
  });

  const safeRequest = await ProductDeletionRequest.findById(request._id)
    .populate('product', 'name sku supplier category isActive deletedAt')
    .populate('requestedBy', 'name email role')
    .populate('decidedBy', 'name role');

  sendResponse(res, 200, `Product deletion request ${request.status}`, safeRequest);
});

export const adjustStock = asyncHandler(async (req, res) => {
  const { quantity, type, note, warehouse } = req.body;
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  const delta = type === 'sale' ? -quantity : quantity;
  if (product.stock + delta < 0) throw new ApiError(400, 'Insufficient product stock');

  product.stock += delta;
  await product.save();

  await InventoryMovement.create({
    product: product._id,
    type,
    quantity,
    note,
    warehouse,
    createdBy: req.user._id
  });

  if (product.stock <= product.lowStockThreshold) {
    emitToAdmins('inventory:low-stock', product);
    await notifyRoles(MANAGEMENT_ROLES, {
      title: 'Low stock alert',
      message: `${product.name} stock is ${product.stock}, at or below threshold ${product.lowStockThreshold}.`,
      type: 'stock',
      data: { action: 'low_stock', productId: product._id.toString(), stock: product.stock }
    });
  }

  sendResponse(res, 200, 'Stock updated', product);
});

export const uploadProductImage = asyncHandler(async (req, res) => {
  const file = await uploadToImageKit(req.file, '/biogenics/products');
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { $push: { images: { url: file.url, fileId: file.fileId, name: file.name } } },
    { new: true }
  );
  if (!product) throw new ApiError(404, 'Product not found');
  sendResponse(res, 200, 'Product image uploaded', product);
});
