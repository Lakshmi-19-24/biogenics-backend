import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: String,
    dueAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending', index: true },
    notifiedAt: Date,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

export const Reminder = mongoose.model('Reminder', reminderSchema);
