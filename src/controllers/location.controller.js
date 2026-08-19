import { LocationPing } from "../models/locationPing.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/apiResponse.js";
import { getPagination } from "../utils/pagination.js";

/*
 * ============================================================
 * ROLES ALLOWED TO SEND / BE TRACKED
 * ============================================================
 *
 * Sales     -> tracked
 * Billing   -> tracked
 * Manager   -> tracked
 *
 * Owner     -> can view team GPS, but is not tracked
 * Admin     -> cannot view team GPS and is not tracked
 */
const TRACKED_ROLES = [
  "admin",
  "sales",
  "billing",
  "manager",
];

/*
 * ============================================================
 * ROLES ALLOWED TO VIEW TEAM GPS
 * ============================================================
 */
const GPS_VIEWER_ROLES = [
  "owner",
  "manager",
];

/*
 * ============================================================
 * CREATE LOCATION PING
 * ============================================================
 *
 * Every authenticated Sales / Billing / Manager user
 * can send their own location.
 */
export const createLocationPing =
  asyncHandler(async (req, res) => {
    const userRole = String(
      req.user?.role || ""
    ).toLowerCase();

    /*
     * Only Sales, Billing and Manager
     * should send team tracking locations.
     */
    if (!TRACKED_ROLES.includes(userRole)) {
      return sendResponse(
        res,
        403,
        "GPS tracking is not enabled for this user role"
      );
    }

    const latitude = Number(
      req.body.latitude
    );

    const longitude = Number(
      req.body.longitude
    );

    /*
     * Validate coordinates.
     */
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return sendResponse(
        res,
        400,
        "Valid latitude and longitude are required"
      );
    }

    /*
     * Latitude must be between -90 and 90.
     */
    if (
      latitude < -90 ||
      latitude > 90
    ) {
      return sendResponse(
        res,
        400,
        "Invalid latitude"
      );
    }

    /*
     * Longitude must be between -180 and 180.
     */
    if (
      longitude < -180 ||
      longitude > 180
    ) {
      return sendResponse(
        res,
        400,
        "Invalid longitude"
      );
    }

    const ping =
      await LocationPing.create({
        employee: req.user._id,

        source:
          req.body.source ||
          "manual",

        location: {
          type: "Point",
          coordinates: [
            longitude,
            latitude,
          ],
        },

        speed:
          req.body.speed != null
            ? Number(req.body.speed)
            : 0,

        battery:
          req.body.battery != null
            ? Number(req.body.battery)
            : null,

        accuracy:
          req.body.accuracy != null
            ? Number(req.body.accuracy)
            : null,

        metadata:
          req.body.metadata || {},

        trackedAt:
          req.body.trackedAt
            ? new Date(
                req.body.trackedAt
              )
            : new Date(),
      });

    /*
     * Populate employee information
     * before returning the response.
     */
    await ping.populate(
      "employee",
      "name email role"
    );

    sendResponse(
      res,
      201,
      "Location ping saved",
      ping
    );
  });

/*
 * ============================================================
 * LIST LOCATION HISTORY
 * ============================================================
 *
 * Only Owner and Manager can view
 * location history.
 */
export const listLocationPings =
  asyncHandler(async (req, res) => {
    const viewerRole = String(
      req.user?.role || ""
    ).toLowerCase();

    if (
      !GPS_VIEWER_ROLES.includes(
        viewerRole
      )
    ) {
      return sendResponse(
        res,
        403,
        "Access denied"
      );
    }

    const {
      page,
      limit,
      skip,
    } = getPagination(
      req.query
    );

    const filter = {};

    /*
     * Only show locations belonging to
     * Sales, Billing and Manager users.
     *
     * We apply this through employee IDs
     * below.
     */
    const trackedUsers =
      await import(
        "../models/user.model.js"
      ).then(
        ({ User }) =>
          User.find({
            isActive: {
              $ne: false,
            },

            role: {
              $in: TRACKED_ROLES,
            },
          }).select("_id")
      );

    const trackedUserIds =
      trackedUsers.map(
        (user) => user._id
      );

    filter.employee = {
      $in: trackedUserIds,
    };

    /*
     * Optional employee filter.
     */
    if (req.query.employee) {
      filter.employee =
        req.query.employee;
    }

    /*
     * Optional source filter.
     */
    if (req.query.source) {
      filter.source =
        req.query.source;
    }

    /*
     * Optional date range.
     */
    if (
      req.query.from ||
      req.query.to
    ) {
      filter.trackedAt = {};

      if (req.query.from) {
        filter.trackedAt.$gte =
          new Date(
            req.query.from
          );
      }

      if (req.query.to) {
        filter.trackedAt.$lte =
          new Date(
            req.query.to
          );
      }
    }

    const [
      items,
      total,
    ] = await Promise.all([
      LocationPing.find(
        filter
      )
        .populate(
          "employee",
          "name email role"
        )
        .skip(skip)
        .limit(limit)
        .sort({
          trackedAt: -1,
        }),

      LocationPing.countDocuments(
        filter
      ),
    ]);

    sendResponse(
      res,
      200,
      "Location pings fetched",
      {
        items,
        page,
        limit,
        total,
      }
    );
  });

/*
 * ============================================================
 * LATEST LOCATION PER EMPLOYEE
 * ============================================================
 *
 * This is what the Owner and Manager
 * GPS Tracking page uses.
 *
 * Returns ONLY:
 *
 * Sales
 * Billing
 * Manager
 *
 * and returns ONLY the latest GPS point
 * for each person.
 */
export const latestLocations =
  asyncHandler(async (req, res) => {
    const viewerRole = String(
      req.user?.role || ""
    ).toLowerCase();

    /*
     * Only Owner and Manager
     * can see team GPS.
     */
    if (
      !GPS_VIEWER_ROLES.includes(
        viewerRole
      )
    ) {
      return sendResponse(
        res,
        403,
        "Access denied"
      );
    }

    const items =
      await LocationPing.aggregate([
        /*
         * Latest location first.
         */
        {
          $sort: {
            trackedAt: -1,
          },
        },

        /*
         * Get latest ping per employee.
         */
        {
          $group: {
            _id: "$employee",
            ping: {
              $first: "$$ROOT",
            },
          },
        },

        /*
         * Get employee details.
         */
        {
          $lookup: {
            from: "users",

            localField: "_id",

            foreignField: "_id",

            as: "employee",
          },
        },

        {
          $unwind:
            "$employee",
        },

        /*
         * VERY IMPORTANT:
         *
         * Only Sales, Billing and Manager
         * appear on the Owner/Manager map.
         *
         * Owner and Admin are excluded.
         */
        {
          $match: {
            "employee.role": {
              $in: TRACKED_ROLES,
            },

            "employee.isActive": {
              $ne: false,
            },
          },
        },

        /*
         * Return clean response.
         */
        {
          $project: {
            _id: "$ping._id",

            source:
              "$ping.source",

            location:
              "$ping.location",

            speed:
              "$ping.speed",

            battery:
              "$ping.battery",

            accuracy:
              "$ping.accuracy",

            trackedAt:
              "$ping.trackedAt",

            metadata:
              "$ping.metadata",

            employee: {
              _id:
                "$employee._id",

              name:
                "$employee.name",

              email:
                "$employee.email",

              role:
                "$employee.role",
            },
          },
        },

        /*
         * Latest updated people first.
         */
        {
          $sort: {
            trackedAt: -1,
          },
        },
      ]);

    sendResponse(
      res,
      200,
      "Latest locations fetched",
      items
    );
  });