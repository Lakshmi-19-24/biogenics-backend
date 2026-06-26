import mongoose from 'mongoose';

const interactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['call', 'email', 'meeting', 'visit', 'note'], default: 'note' },
    summary: { type: String, required: true, trim: true },
    feedback: { type: String, trim: true },
    nextFollowUpAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
   type: {
  type: String,
  enum: [
    'customer',
    'clinical lab',
    'institution',
    'industry',
    'seed company',
    'hospital',
    'others'
  ],
  default: 'customer'
},
    contactPerson: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true, index: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    branch: { type: String, trim: true, index: true },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active', index: true },
    notes: String,
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    interactions: [interactionSchema]
  },
  { timestamps: true }
);

customerSchema.index({ location: '2dsphere' });

export const Customer = mongoose.model('Customer', customerSchema, 'customers');
