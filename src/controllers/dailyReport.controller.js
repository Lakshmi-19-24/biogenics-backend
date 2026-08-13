import { DailyReport } from "../models/dailyReport.model.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { getPagination } from "../utils/pagination.js";
import {
  emitToAdmins,
  notifyRoles,
} from "../services/notification.service.js";
import { MANAGEMENT_ROLES } from "../constants/roles.js";

const today = () =>
  new Date().toISOString().slice(0, 10);

// =====================================================
// SUBMIT / UPDATE DAILY REPORT
// =====================================================

export const submitDailyReport =
  asyncHandler(async (req, res) => {
    const reportDate =
      req.body.reportDate || today();

    const report =
      await DailyReport.findOneAndUpdate(
        {
          employee: req.user._id,
          reportDate,
        },
        {
          ...req.body,
          employee: req.user._id,
          reportDate,
          status: "submitted",
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

    emitToAdmins(
      "daily-report:submitted",
      report
    );

    await notifyRoles(
      MANAGEMENT_ROLES,
      {
        title:
          "Daily report submitted",

        message: `${req.user.name} submitted a daily report for ${reportDate}.`,

        type: "system",

        excludeUser:
          req.user._id,

        data: {
          action:
            "daily_report_submitted",

          reportId:
            report._id.toString(),

          reportDate,
        },
      }
    );

    sendResponse(
      res,
      200,
      "Daily report submitted",
      report
    );
  });

// =====================================================
// LIST ALL DAILY REPORTS
// =====================================================

export const listDailyReports =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const filter = {};

    if (req.query.employee) {
      filter.employee =
        req.query.employee;
    }

    if (req.query.reportDate) {
      filter.reportDate =
        req.query.reportDate;
    }

    if (req.query.status) {
      filter.status =
        req.query.status;
    }

    const [
      items,
      total,
    ] = await Promise.all([
      DailyReport.find(filter)
        .populate(
          "employee",
          "name email role"
        )
        .populate(
          "reviewedBy",
          "name email role"
        )
        .populate(
          "replies.user",
          "name email role"
        )
        .skip(skip)
        .limit(limit)
        .sort("-reportDate"),

      DailyReport.countDocuments(
        filter
      ),
    ]);

    sendResponse(
      res,
      200,
      "Daily reports fetched",
      {
        items,
        page,
        limit,
        total,
      }
    );
  });

// =====================================================
// LIST MY DAILY REPORTS
// =====================================================

export const listMyDailyReports =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const filter = {
      employee: req.user._id,
    };

    if (req.query.reportDate) {
      filter.reportDate =
        req.query.reportDate;
    }

    if (req.query.status) {
      filter.status =
        req.query.status;
    }

    const [
      items,
      total,
    ] = await Promise.all([
      DailyReport.find(filter)
        .populate(
          "reviewedBy",
          "name email role"
        )
        .populate(
          "replies.user",
          "name email role"
        )
        .skip(skip)
        .limit(limit)
        .sort("-reportDate"),

      DailyReport.countDocuments(
        filter
      ),
    ]);

    sendResponse(
      res,
      200,
      "My daily reports fetched",
      {
        items,
        page,
        limit,
        total,
      }
    );
  });

// =====================================================
// REVIEW DAILY REPORT
// =====================================================

export const reviewDailyReport =
  asyncHandler(async (req, res) => {
    const status =
      req.body.status;

    const update = {
      status,
    };

    if (status === "submitted") {
      // Move report back to Pending
      update.reviewNote =
        undefined;

      update.reviewedBy =
        undefined;

      update.reviewedAt =
        undefined;
    } else {
      // Reviewed or Rejected
      update.reviewNote =
        req.body.reviewNote || "";

      update.reviewedBy =
        req.user._id;

      update.reviewedAt =
        new Date();
    }

    const report =
      await DailyReport.findByIdAndUpdate(
        req.params.id,
        update,
        {
          new: true,
          runValidators: true,
        }
      )
        .populate(
          "employee",
          "name email role"
        )
        .populate(
          "reviewedBy",
          "name email role"
        )
        .populate(
          "replies.user",
          "name email role"
        );

    if (!report) {
      throw new ApiError(
        404,
        "Daily report not found"
      );
    }

    sendResponse(
      res,
      200,
      "Daily report updated",
      report
    );
  });

// =====================================================
// REPLY TO DAILY REPORT REVIEW
// =====================================================

export const replyToDailyReport =
  asyncHandler(async (req, res) => {
    const { message } =
      req.body;

    if (
      !message ||
      !message.trim()
    ) {
      throw new ApiError(
        400,
        "Reply message is required"
      );
    }

    const report =
      await DailyReport.findById(
        req.params.id
      );

    if (!report) {
      throw new ApiError(
        404,
        "Daily report not found"
      );
    }

    // =================================================
    // SALES EMPLOYEE
    // Can reply ONLY to their own report.
    // =================================================

    if (
      req.user.role === "sales" &&
      String(
        report.employee
      ) !==
        String(req.user._id)
    ) {
      throw new ApiError(
        403,
        "You can only reply to your own daily reports"
      );
    }

    // =================================================
    // ADD REPLY
    // =================================================

    report.replies.push({
      user: req.user._id,
      message:
        message.trim(),
    });

    await report.save();

    // =================================================
    // RETURN UPDATED REPORT
    // =================================================

    const updatedReport =
      await DailyReport.findById(
        report._id
      )
        .populate(
          "employee",
          "name email role"
        )
        .populate(
          "reviewedBy",
          "name email role"
        )
        .populate(
          "replies.user",
          "name email role"
        );

    sendResponse(
      res,
      200,
      "Reply added successfully",
      updatedReport
    );
  });