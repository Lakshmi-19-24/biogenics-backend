import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['sales', 'collection', 'follow_up', 'support', 'other'], default: 'sales' },
    status: { type: String, enum: ['planned', 'checked_in', 'completed', 'missed'], default: 'planned' },
    checkInAt: Date,
    checkOutAt: Date,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    geoFenceVerified: { type: Boolean, default: false },
    feedback: String,
    notes: String,
    attachments: [
      {
        url: String,
        fileId: String,
        name: String,
        mimeType: String
      }
    ]
  },
  { timestamps: true }
);

visitSchema.index({ location: '2dsphere' });

export const Visit = mongoose.model('Visit', visitSchema);
