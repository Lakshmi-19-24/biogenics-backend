import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    productName: String,
    sku: String,
    quantity: { type: Number, required: true, min: 1 }, // requested quantity
    allocatedQuantity: { type: Number, default: 0 },
    backorderQuantity: { type: Number, default: 0 },
    price: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, min: 0 },
    totalPrice: { type: Number, min: 0 },
    taxRate: { type: Number, default: 0 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true, index: true },
    invoiceNumber: { type: String, trim: true },
    orderDate: { type: Date, default: Date.now, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    taxTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    status: {
      type: String,
      enum: ['draft', 'placed', 'approved', 'fulfilled', 'cancelled'],
      default: 'placed',
      index: true
    },
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid', 'overdue'], default: 'unpaid' },
    placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String
  },
  { timestamps: true }
);

orderSchema.pre('validate', function (next) {
  if (this.customer && !this.customerId) this.customerId = this.customer;
  if (this.customerId && !this.customer) this.customer = this.customerId;
  if (!this.invoiceNumber && this.orderNo) this.invoiceNumber = this.orderNo;
  this.items = (this.items || []).map((item) => {
    if (item.product && !item.productId) item.productId = item.product;
    if (item.productId && !item.product) item.product = item.productId;
    if (item.name && !item.productName) item.productName = item.name;
    if (item.productName && !item.name) item.name = item.productName;
    if (item.price != null && item.unitPrice == null) item.unitPrice = item.price;
    if (item.unitPrice != null && item.price == null) item.price = item.unitPrice;
    if (item.totalPrice == null) item.totalPrice = Number(item.quantity || 0) * Number(item.unitPrice ?? item.price ?? 0);
    return item;
  });
  next();
});

export const Order = mongoose.model('Order', orderSchema);
