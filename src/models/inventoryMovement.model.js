import mongoose from 'mongoose';

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: { type: String, enum: ['purchase', 'sale', 'return', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    referenceType: { type: String, enum: ['Order', 'Manual', 'Return'], default: 'Manual' },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    warehouse: { type: String, trim: true, default: 'main' },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

export const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);
