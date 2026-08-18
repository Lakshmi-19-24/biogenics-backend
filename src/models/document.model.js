import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: [
        "purchase_order",
        "quotation",
        "invoice",
        "agreement",
        "customer_document",
        "other",
      ],
      default: "other",
      index: true,
    },

    file: {
      url: {
        type: String,
        required: true,
      },

      fileId: {
        type: String,
        required: true,
      },

      name: String,
      size: Number,
      mimeType: String,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /*
     * Visibility:
     *
     * team  -> team users can see it
     * admin -> management/admin users can see it
     * users -> selected users can see it
     *
     * Existing team/admin documents continue to work.
     */
    visibility: {
      type: String,
      enum: ["team", "admin", "users"],
      default: "team",
      index: true,
    },

    /*
     * Users who are specifically allowed
     * to see the document when visibility = "users".
     */
    visibleTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Document reminder
    reminderAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Optional reminder message
    reminderNote: {
      type: String,
      trim: true,
      default: "",
    },

    // Whether reminder has been completed
    reminderCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Prevent repeated reminder notifications
    reminderNotifiedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Document =
  mongoose.models.Document ||
  mongoose.model("Document", documentSchema);