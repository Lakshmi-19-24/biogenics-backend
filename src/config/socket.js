import { Server } from "socket.io";
import { env } from "./env.js";
import { verifyAccessToken } from "../utils/token.js";
import { LocationPing } from "../models/locationPing.model.js";

let io;

/*
 * ============================================================
 * USERS WHO ARE ALLOWED TO SEND GPS
 * ============================================================
 *
 * Sales    -> sends GPS
 * Billing  -> sends GPS
 * Manager  -> sends GPS
 *
 * Owner    -> does NOT send team GPS
 * Admin    -> does NOT send team GPS
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

  io.on("connection", (socket) => {
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
     * Sales, Billing and Manager can send GPS.
     *
     * Owner/Admin cannot send team GPS.
     */
    socket.on(
      "sales:location:update",
      async (payload, ack) => {
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
              typeof ack === "function"
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
            !Number.isFinite(
              latitude
            ) ||
            !Number.isFinite(
              longitude
            )
          ) {
            if (
              typeof ack === "function"
            ) {
              ack({
                success: false,
                message:
                  "Valid latitude and longitude are required",
              });
            }

            return;
          }

          if (
            latitude < -90 ||
            latitude > 90
          ) {
            if (
              typeof ack === "function"
            ) {
              ack({
                success: false,
                message:
                  "Invalid latitude",
              });
            }

            return;
          }

          if (
            longitude < -180 ||
            longitude > 180
          ) {
            if (
              typeof ack === "function"
            ) {
              ack({
                success: false,
                message:
                  "Invalid longitude",
              });
            }

            return;
          }

          /*
           * --------------------------------------------------
           * SERVER TIME
           * --------------------------------------------------
           *
           * Always use the server's current time.
           *
           * This prevents an old device timestamp
           * from making a location look fresh.
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
              employee: userId,

              source: "socket",

              location: {
                type: "Point",
                coordinates: [
                  longitude,
                  latitude,
                ],
              },

              speed:
                payload?.speed != null
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

              accuracy:
                payload?.accuracy !=
                null
                  ? Number(
                      payload.accuracy
                    )
                  : null,

              metadata:
                payload?.metadata ||
                {},

              trackedAt,
            });

          /*
           * --------------------------------------------------
           * EVENT SENT TO OWNER + MANAGER ONLY
           * --------------------------------------------------
           *
           * ADMIN IS DELIBERATELY NOT INCLUDED.
           */

          const eventPayload = {
            _id: ping._id,

            user: userId,

            employee: {
              _id: userId,
              role: userRole,
            },

            latitude,
            longitude,

            accuracy:
              payload?.accuracy ??
              null,

            speed:
              payload?.speed ??
              0,

            battery:
              payload?.battery ??
              null,

            source: "socket",

            trackedAt:
              trackedAt.toISOString(),
          };

          /*
           * Send to Owner room.
           */
          socket
            .to("role:owner")
            .emit(
              "sales:location:updated",
              eventPayload
            );

          /*
           * Send to Manager room.
           *
           * If the sender itself is a Manager,
           * socket.to() prevents sending the event
           * back to that same socket.
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
            typeof ack === "function"
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
        } catch (error) {
          console.error(
            "❌ Socket GPS error:",
            error
          );

          if (
            typeof ack === "function"
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
  });

  return io;
};

/**
 * Returns the live Socket.IO instance.
 *
 * @returns {Server | undefined}
 */
export const getIO = () => io;