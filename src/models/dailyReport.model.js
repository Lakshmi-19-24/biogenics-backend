import mongoose from "mongoose";

const dailyReportReplySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const dailyReportSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    reportDate: {
      type: String,
      required: true,
      index: true,
    },

    visits: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Visit",
      },
    ],

    callsMade: {
      type: Number,
      default: 0,
      min: 0,
    },

    leadsCreated: {
      type: Number,
      default: 0,
      min: 0,
    },

    ordersBooked: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentsCollected: {
      type: Number,
      default: 0,
      min: 0,
    },

    summary: {
      type: String,
      required: true,
      trim: true,
    },

    blockers: String,

    tomorrowPlan: String,

    status: {
      type: String,
      enum: [
        "submitted",
        "reviewed",
        "rejected",
      ],
      default: "submitted",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedAt: Date,

    reviewNote: String,

    // ==========================================
    // REVIEW REPLIES / CONVERSATION
    // ==========================================

    replies: [
      dailyReportReplySchema,
    ],
  },

  {
    timestamps: true,
  }
);

dailyReportSchema.index(
  {
    employee: 1,
    reportDate: 1,
  },
  {
    unique: true,
  }
);

export const DailyReport =
  mongoose.model(
    "DailyReport",
    dailyReportSchema
  );