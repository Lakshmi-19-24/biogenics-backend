import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['purchase_order', 'quotation', 'invoice', 'agreement', 'customer_document', 'other'],
      default: 'other',
      index: true
    },
    file: {
      url: { type: String, required: true },
      fileId: { type: String, required: true },
      name: String,
      size: Number,
      mimeType: String
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: ['team', 'admin'], default: 'team' }
  },
  { timestamps: true }
);

export const Document = mongoose.model('Document', documentSchema);
