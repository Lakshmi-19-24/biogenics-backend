import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    source: { type: String, enum: ['field_visit', 'website', 'referral', 'campaign', 'manual'], default: 'manual' },
    status: {
      type: String,
      enum: ['new', 'assigned','contacted', 'in_progress', 'follow_up', 'converted', 'lost'],
      default: 'new',
      index: true
    },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    expectedValue: { type: Number, default: 0 },
    convertedAt: Date,
    nextFollowUpAt: Date,
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

export const Lead = mongoose.model('Lead', leadSchema);
