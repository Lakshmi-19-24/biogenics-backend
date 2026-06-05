import { LocationPing } from '../models/locationPing.model.js';
import { User } from '../models/user.model.js';
import { ROLES } from '../constants/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';

const visibleEmployeeRolesFor = (role) => {
  if (role === ROLES.OWNER) return null;
  if (role === ROLES.ADMIN) return [ROLES.MANAGER, ROLES.SALES_EXECUTIVE];
  if (role === ROLES.MANAGER) return [ROLES.SALES_EXECUTIVE];
  return [];
};

/**
 * Saves a location ping for the authenticated user.
 */
export const createLocationPing = asyncHandler(async (req, res) => {
  const ping = await LocationPing.create({
    employee: req.user._id,
    source: req.body.source || 'manual',
    location: { type: 'Point', coordinates: [req.body.longitude, req.body.latitude] },
    speed: req.body.speed,
    battery: req.body.battery,
    accuracy: req.body.accuracy,
    metadata: req.body.metadata,
    trackedAt: req.body.trackedAt || new Date()
  });

  sendResponse(res, 201, 'Location ping saved', ping);
});

/**
 * Lists location pings for route playback and audit.
 */
export const listLocationPings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.from || req.query.to) {
    filter.trackedAt = {};
    if (req.query.from) filter.trackedAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.trackedAt.$lte = new Date(req.query.to);
  }
  const visibleRoles = visibleEmployeeRolesFor(req.user.role);
  if (visibleRoles) {
    const visibleEmployeeIds = await User.find({ role: { $in: visibleRoles } }).distinct('_id');
    const canViewRequestedEmployee = visibleEmployeeIds.some((id) => String(id) === String(req.query.employee));
    filter.employee = req.query.employee
      ? canViewRequestedEmployee ? req.query.employee : { $in: [] }
      : { $in: visibleEmployeeIds };
  }

  const [items, total] = await Promise.all([
    LocationPing.find(filter).populate('employee', 'name email role').skip(skip).limit(limit).sort('-trackedAt'),
    LocationPing.countDocuments(filter)
  ]);

  sendResponse(res, 200, 'Location pings fetched', { items, page, limit, total });
});

/**
 * Returns the most recent location per employee.
 */
export const latestLocations = asyncHandler(async (req, res) => {
  const items = await LocationPing.aggregate([
    { $sort: { trackedAt: -1 } },
    { $group: { _id: '$employee', ping: { $first: '$$ROOT' } } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'employee'
      }
    },
    { $unwind: '$employee' },
    ...(visibleEmployeeRolesFor(req.user.role) ? [{ $match: { 'employee.role': { $in: visibleEmployeeRolesFor(req.user.role) } } }] : []),
    {
      $project: {
        _id: '$ping._id',
        source: '$ping.source',
        location: '$ping.location',
        speed: '$ping.speed',
        battery: '$ping.battery',
        accuracy: '$ping.accuracy',
        trackedAt: '$ping.trackedAt',
        employee: { _id: '$employee._id', name: '$employee.name', email: '$employee.email', role: '$employee.role' }
      }
    },
    { $sort: { trackedAt: -1 } }
  ]);

  sendResponse(res, 200, 'Latest locations fetched', items);
});
