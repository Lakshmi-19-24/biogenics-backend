import { Target } from '../models/target.model.js';
import { Lead } from '../models/lead.model.js';
import { Order } from '../models/order.model.js';
import { Visit } from '../models/visit.model.js';
import { ROLES } from '../constants/roles.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';
import { getPagination } from '../utils/pagination.js';
import { notifyRoles, notifyUser } from '../services/notification.service.js';
import { MANAGEMENT_ROLES } from '../constants/roles.js';

const syncTargetProgress = async (targets) =>
  Promise.all(
    targets.map(async (target) => {
      const employeeId = target.employee?._id || target.employee;
      const dateRange = { $gte: target.startsAt, $lte: target.endsAt };

      const [orderStats, visitCount, convertedLeadCount] = await Promise.all([
        Order.aggregate([
          {
            $match: {
              placedBy: employeeId,
              $or: [{ orderDate: dateRange }, { orderDate: { $exists: false }, createdAt: dateRange }],
              status: { $nin: ['draft', 'cancelled'] }
            }
          },
          {
            $group: {
              _id: null,
              achievedOrderCount: { $sum: 1 },
              achievedSalesAmount: { $sum: '$grandTotal' }
            }
          }
        ]),
        Visit.countDocuments({
          employee: employeeId,
          status: 'completed',
          $or: [{ checkOutAt: dateRange }, { checkOutAt: { $exists: false }, updatedAt: dateRange }]
        }),
        Lead.countDocuments({
          assignedTo: employeeId,
          status: 'converted',
          $or: [
            { convertedAt: dateRange },
            { convertedAt: { $exists: false }, updatedAt: dateRange }
          ]
        })
      ]);

      const progress = {
        achievedSalesAmount: orderStats[0]?.achievedSalesAmount || 0,
        achievedOrderCount: orderStats[0]?.achievedOrderCount || 0,
        achievedVisitCount: visitCount,
        achievedLeadConversions: convertedLeadCount
      };

      Object.assign(target, progress);
      if (!target.isNew && target.modifiedPaths().some((path) => path.startsWith('achieved'))) {
        await target.save();
      }
      return target;
    })
  );

export const createTarget = asyncHandler(async (req, res) => {
  const employee = await User.findById(req.body.employee).select('name role');
  if (!employee) throw new ApiError(404, 'Target employee not found');

  const allowedTargetsByRole = {
    [ROLES.OWNER]: [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_EXECUTIVE],
    [ROLES.ADMIN]: [ROLES.MANAGER, ROLES.SALES_EXECUTIVE],
    [ROLES.MANAGER]: [ROLES.SALES_EXECUTIVE]
  };
  const allowedRoles = allowedTargetsByRole[req.user.role] || [];
  if (!allowedRoles.includes(employee.role)) {
    throw new ApiError(403, 'You cannot assign targets to this role');
  }

  const target = await Target.create({ ...req.body, createdBy: req.user._id });
  let populatedTarget = await Target.findById(target._id)
    .populate('employee', 'name email role')
    .populate('createdBy', 'name role');
  [populatedTarget] = await syncTargetProgress([populatedTarget]);

  await notifyUser({
    recipient: target.employee.toString(),
    title: 'New target assigned',
    message: `${req.user.name} assigned a new target to you.`,
    type: 'target',
    data: { targetId: target._id.toString() }
  });
  await notifyRoles(MANAGEMENT_ROLES, {
    title: 'Target assigned',
    message: `${req.user.name} assigned a target to ${employee.name}.`,
    type: 'target',
    data: {
      action: 'target_assigned',
      targetId: target._id.toString(),
      employeeId: employee._id.toString(),
      employeeName: employee.name
    }
  });
  sendResponse(res, 201, 'Target created', populatedTarget);
});

export const listTargets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.user.role === ROLES.SALES_EXECUTIVE) {
    filter.employee = req.user._id;
  } else if (req.query.employee) {
    filter.employee = req.query.employee;
  }
  if (req.query.period) filter.period = req.query.period;

  const [items, total] = await Promise.all([
    Target.find(filter)
      .populate('employee', 'name email role')
      .populate('createdBy', 'name role')
      .skip(skip)
      .limit(limit)
      .sort('-startsAt'),
    Target.countDocuments(filter)
  ]);

  const syncedItems = await syncTargetProgress(items);

  sendResponse(res, 200, 'Targets fetched', { items: syncedItems, page, limit, total });
});

export const updateTargetProgress = asyncHandler(async (req, res) => {
  const target = await Target.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  sendResponse(res, 200, 'Target progress updated', target);
});
