import mongoose from 'mongoose';

const profileChangeRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profileUpdates: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      branch: { type: String, trim: true },
      territory: { type: String, trim: true }
    },
    passwordHash: { type: String, select: false },
    changeTypes: [{ type: String, enum: ['profile', 'password'], required: true }],
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

export const ProfileChangeRequest =
  mongoose.models.ProfileChangeRequest ||
  mongoose.model('ProfileChangeRequest', profileChangeRequestSchema);
