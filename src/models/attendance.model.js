import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    checkInAt: Date,
    checkOutAt: Date,
    sessions: [
      {
        checkInAt: Date,
        checkOutAt: Date,
        checkInLocation: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [0, 0] }
        },
        checkOutLocation: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [0, 0] }
        },
        totalMinutes: { type: Number, default: 0 },
        breakMinutes: { type: Number, default: 0 }
      }
    ],
    breakMinutes: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave', 'half_day'], default: 'present' },
    checkInLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    checkOutLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    correctionRequested: { type: Boolean, default: false },
    correctionReason: String,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
