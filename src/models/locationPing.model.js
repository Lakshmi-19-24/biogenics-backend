import mongoose from 'mongoose';

const locationPingSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: { type: String, enum: ['socket', 'attendance', 'visit', 'manual'], default: 'socket', index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }
    },
    speed: { type: Number, default: 0 },
    battery: { type: Number, min: 0, max: 100 },
    accuracy: Number,
    trackedAt: { type: Date, default: Date.now, index: true },
    metadata: { type: Map, of: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

locationPingSchema.index({ location: '2dsphere' });
locationPingSchema.index({ employee: 1, trackedAt: -1 });

export const LocationPing = mongoose.model('LocationPing', locationPingSchema);
