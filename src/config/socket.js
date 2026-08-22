import { Server } from "socket.io";
import { env } from "./env.js";
import { verifyAccessToken } from "../utils/token.js";
import { LocationPing } from "../models/locationPing.model.js";
import { hasActiveCheckIn } from "../controllers/location.controller.js";

let io;

/*
 * ============================================================
 * USERS WHO ARE ALLOWED TO SEND GPS
 * ============================================================
 *
 * Sales    -> sends GPS
 * Billing  -> sends GPS
 * Manager  -> sends GPS
 * Admin    -> sends GPS
 *
 * Owner    -> does NOT send team GPS
 */
const TRACKED_ROLES = [
  "admin",
  "sales",
  "billing",
  "manager",
];

/*
 * ============================================================
 * USERS WHO CAN VIEW TEAM GPS
 * ============================================================
 *
 * Owner   -> can view
 * Manager -> can view
 *
 * Admin   -> CANNOT view
 */
const GPS_VIEWER_ROLES = [
  "owner",
  "manager",
];

/*
 * Maximum acceptable GPS accuracy.
 *
 * Example:
 * accuracy = 20    -> good
 * accuracy = 500   -> acceptable
 * accuracy = 2000  -> maximum accepted
 * accuracy = 5000  -> rejected
 */
const MAX_ACCURACY_METERS = 2000;

/*
 * ============================================================
 * COORDINATE VALIDATION
 * ============================================================
 */
const isValidCoordinate = (
  latitude,
  longitude
) => {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
};

/*
 * ============================================================
 * ACCURACY VALIDATION
 * ============================================================
 */
const isAcceptableAccuracy = (
  accuracy
) => {
  if (accuracy == null) {
    return true;
  }

  const value = Number(
    accuracy
  );

  if (!Number.isFinite(value)) {
    return false;
  }

  return (
    value >= 0 &&
    value <= MAX_ACCURACY_METERS
  );
};

/**
 * Initializes Socket.IO and attaches
 * authentication-aware room membership.
 *
 * @param {import('node:http').Server} server
 * @returns {Server}
 */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  });

  /*
   * ==========================================================
   * SOCKET AUTHENTICATION
   * ==========================================================
   */

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token;

      if (!token) {
        return next(
          new Error(
            "Socket auth token is required"
          )
        );
      }

      socket.user =
        verifyAccessToken(token);

      return next();
    } catch (_error) {
      return next(
        new Error(
          "Invalid socket token"
        )
      );
    }
  });

  /*
   * ==========================================================
   * CONNECTION
   * ==========================================================
   */

  io.on(
    "connection",
    (socket) => {
      const userId =
        socket.user?.id;

      const userRole = String(
        socket.user?.role || ""
      ).toLowerCase();

      console.log(
        `🔌 Socket connected: ${userId} (${userRole})`
      );

      /*
       * Every user gets their personal room.
       */
      socket.join(
        `user:${userId}`
      );

      /*
       * Every user joins their role room.
       */
      socket.join(
        `role:${userRole}`
      );

      /*
       * ========================================================
       * GPS LOCATION UPDATE
       * ========================================================
       *
       * Admin, Sales, Billing and Manager
       * can send GPS.
       *
       * Sales, Billing and Manager must
       * have an active check-in.
       *
       * Owner cannot send team GPS.
       */
      socket.on(
        "sales:location:update",
        async (
          payload,
          ack
        ) => {
          try {
            /*
             * --------------------------------------------------
             * CHECK SENDER ROLE
             * --------------------------------------------------
             */

            if (
              !TRACKED_ROLES.includes(
                userRole
              )
            ) {
              console.warn(
                `🚫 GPS rejected for role: ${userRole}`
              );

              if (
                typeof ack ===
                "function"
              ) {
                ack({
                  success: false,
                  message:
                    "GPS tracking is not enabled for this user role",
                });
              }

              return;
            }

            /*
             * --------------------------------------------------
             * CHECK ACTIVE ATTENDANCE
             * --------------------------------------------------
             *
             * Sales, Billing and Manager
             * can send GPS only while checked in.
             *
             * Admin is not subjected to this
             * check-in requirement.
             */

            if (
              [
                "sales",
                "billing",
                "manager",
              ].includes(
                userRole
              )
            ) {
              const activeCheckIn =
                await hasActiveCheckIn(
                  userId
                );

              if (
                !activeCheckIn
              ) {
                console.warn(
                  `🚫 GPS rejected: ${userId} is not checked in`
                );

                if (
                  typeof ack ===
                  "function"
                ) {
                  ack({
                    success: false,
                    message:
                      "GPS tracking requires an active check-in",
                  });
                }

                return;
              }
            }

            /*
             * --------------------------------------------------
             * VALIDATE COORDINATES
             * --------------------------------------------------
             */

            const latitude =
              Number(
                payload?.latitude
              );

            const longitude =
              Number(
                payload?.longitude
              );

            if (
              !isValidCoordinate(
                latitude,
                longitude
              )
            ) {
              if (
                typeof ack ===
                "function"
              ) {
                ack({
                  success: false,
                  message:
                    "Valid latitude and longitude are required",
                });
              }

              return;
            }

            /*
             * --------------------------------------------------
             * VALIDATE GPS ACCURACY
             * --------------------------------------------------
             */

            const accuracy =
              payload?.accuracy !=
              null
                ? Number(
                    payload.accuracy
                  )
                : null;

            if (
              !isAcceptableAccuracy(
                accuracy
              )
            ) {
              console.warn(
                `🚫 GPS rejected: accuracy ${accuracy}m is too low`
              );

              if (
                typeof ack ===
                "function"
              ) {
                ack({
                  success: false,
                  message:
                    "GPS accuracy is too low",
                });
              }

              return;
            }

            /*
             * --------------------------------------------------
             * SERVER TIME
             * --------------------------------------------------
             *
             * Always use server time.
             */

            const trackedAt =
              new Date();

            /*
             * --------------------------------------------------
             * SAVE LOCATION
             * --------------------------------------------------
             */

            const ping =
              await LocationPing.create({
                employee:
                  userId,

                source:
                  "socket",

                location: {
                  type: "Point",

                  coordinates: [
                    longitude,
                    latitude,
                  ],
                },

                speed:
                  payload?.speed !=
                  null
                    ? Number(
                        payload.speed
                      )
                    : 0,

                battery:
                  payload?.battery !=
                  null
                    ? Number(
                        payload.battery
                      )
                    : null,

                accuracy,

                metadata:
                  payload?.metadata ||
                  {},

                trackedAt,
              });

            /*
             * --------------------------------------------------
             * EVENT PAYLOAD
             * --------------------------------------------------
             */

            const eventPayload = {
              _id:
                ping._id,

              user:
                userId,

              employee: {
                _id:
                  userId,

                role:
                  userRole,
              },

              latitude,

              longitude,

              accuracy,

              speed:
                payload?.speed ??
                0,

              battery:
                payload?.battery ??
                null,

              source:
                "socket",

              trackedAt:
                trackedAt.toISOString(),
            };

            /*
             * --------------------------------------------------
             * SEND TO OWNER
             * --------------------------------------------------
             */

            socket
              .to("role:owner")
              .emit(
                "sales:location:updated",
                eventPayload
              );

            /*
             * --------------------------------------------------
             * SEND TO MANAGER
             * --------------------------------------------------
             */

            socket
              .to("role:manager")
              .emit(
                "sales:location:updated",
                eventPayload
              );

            /*
             * --------------------------------------------------
             * ACK TO SENDER
             * --------------------------------------------------
             */

            if (
              typeof ack ===
              "function"
            ) {
              ack({
                success: true,

                trackedAt:
                  trackedAt.toISOString(),

                locationId:
                  ping._id,
              });
            }

            console.log(
              `📍 GPS updated: ${userId} (${userRole}) → ${latitude}, ${longitude}`
            );
          } catch (
            error
          ) {
            console.error(
              "❌ Socket GPS error:",
              error
            );

            if (
              typeof ack ===
              "function"
            ) {
              ack({
                success: false,

                message:
                  error.message ||
                  "Failed to save location",
              });
            }
          }
        }
      );

      /*
       * ========================================================
       * DISCONNECT
       * ========================================================
       */

      socket.on(
        "disconnect",
        (reason) => {
          console.log(
            `🔌 Socket disconnected: ${userId} (${userRole})`,
            reason
          );
        }
      );
    }
  );

  return io;
};

/**
 * Returns the live Socket.IO instance.
 *
 * @returns {Server | undefined}
 */
export const getIO = () => io;