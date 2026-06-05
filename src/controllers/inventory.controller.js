import { InventoryMovement } from '../models/inventoryMovement.model.js';
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
    InventoryMovement.find(filter).populate('product', 'name sku stock').populate('createdBy', 'name email').skip(skip).limit(limit).sort('-createdAt'),
    InventoryMovement.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Inventory movements fetched', { items, page, limit, total });
});
