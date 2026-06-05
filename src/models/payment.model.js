import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    mode: { type: String, enum: ['cash', 'bank_transfer', 'upi', 'card', 'online_gateway'], required: true },
    status: { type: String, enum: ['pending', 'received', 'failed', 'refunded'], default: 'received' },
    transactionRef: String,
    receivedAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: String
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
