import mongoose from 'mongoose';

const targetSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    period: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly'], default: 'monthly' },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    salesAmountTarget: { type: Number, default: 0 },
    orderCountTarget: { type: Number, default: 0 },
    visitCountTarget: { type: Number, default: 0 },
    leadConversionTarget: { type: Number, default: 0 },
    achievedSalesAmount: { type: Number, default: 0 },
    achievedOrderCount: { type: Number, default: 0 },
    achievedVisitCount: { type: Number, default: 0 },
    achievedLeadConversions: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

export const Target = mongoose.model('Target', targetSchema);
