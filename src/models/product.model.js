import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    sku: { type: String, required: true, unique: true, trim: true },
    catalogNumber: { type: String, trim: true, index: true },
    category: { type: String, trim: true, index: true },
    description: String,
    specifications: { type: Map, of: String },
    price: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'piece' },
    batchNumber: String,
    manufactureDate: Date,
    expiryDate: Date,
    expiryNotifiedAt: Date,
    supplier: String,
    make: { type: String, trim: true, index: true },
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    sourceCatalog: {
      workbook: String,
      sheet: String,
      row: Number,
      stockAsOn: String
    },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deleteReason: { type: String, trim: true, default: '' },
    images: [
      {
        url: String,
        fileId: String,
        name: String
      }
    ],
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export const Product = mongoose.model('Product', productSchema);
