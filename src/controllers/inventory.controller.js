import { InventoryMovement } from '../models/inventoryMovement.model.js';
import { Product } from '../models/product.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';

export const listInventoryMovements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (req.query.product) filter.product = req.query.product;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.warehouse) filter.warehouse = req.query.warehouse;

  const [items, total] = await Promise.all([
    InventoryMovement.find(filter)
      .populate('product', 'name sku stock')
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt'),

    InventoryMovement.countDocuments(filter)
  ]);

  sendResponse(
    res,
    200,
    'Inventory movements fetched',
    {
      items,
      page,
      limit,
      total
    }
  );
});

export const deleteInventoryMovement = asyncHandler(async (req, res) => {
  const movement = await InventoryMovement.findById(req.params.id);

  if (!movement) {
    throw new ApiError(404, 'Inventory movement not found');
  }

  const product = await Product.findById(movement.product);

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  const quantity = Number(movement.quantity || 0);

  // Reverse the original stock change.
  // Sale originally decreases stock, so deleting it increases stock.
  // Purchase/return/adjustment originally increase stock,
  // so deleting them decreases stock.
  const reverseDelta =
    movement.type === 'sale'
      ? quantity
      : -quantity;

  if (product.stock + reverseDelta < 0) {
    throw new ApiError(
      400,
      'Cannot delete this movement because the resulting stock would be negative'
    );
  }

  product.stock += reverseDelta;

  await product.save();

  await InventoryMovement.deleteOne({
    _id: movement._id
  });

  sendResponse(
    res,
    200,
    'Inventory movement deleted',
    {
      movementId: movement._id,
      productId: product._id,
      stock: product.stock
    }
  );
});