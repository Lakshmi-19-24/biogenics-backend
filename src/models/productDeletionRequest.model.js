import mongoose from 'mongoose';

const productDeletionRequestSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productSnapshot: {
      name: { type: String, required: true, trim: true },
      sku: { type: String, trim: true },
      supplier: { type: String, trim: true },
      category: { type: String, trim: true }
    },
    reason: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined'],
      default: 'pending',
      index: true
    },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionNote: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

productDeletionRequestSchema.index(
  { product: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

export const ProductDeletionRequest =
  mongoose.models.ProductDeletionRequest ||
  mongoose.model('ProductDeletionRequest', productDeletionRequestSchema);
