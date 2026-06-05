import { Attendance, Lead, Order, Payment, Product, User, Visit } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/apiResponse.js';

/**
 * Returns high-level KPIs for owner/admin dashboard.
 */
export const dashboardSummary = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    activeUsers,
    totalProducts,
    lowStockProducts,
    totalOrders,
    totalLeads,
    totalVisits,
    todayAttendance,
    salesAgg,
    paymentAgg
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
    Order.countDocuments(),
    Lead.countDocuments(),
    Visit.countDocuments(),
    Attendance.countDocuments({ date: new Date().toISOString().slice(0, 10) }),
    Order.aggregate([{ $group: { _id: null, total: { $sum: '$grandTotal' } } }]),
    Payment.aggregate([{ $match: { status: 'received' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);

  sendResponse(res, 200, 'Dashboard summary fetched', {
    users: { total: totalUsers, active: activeUsers },
    products: { total: totalProducts, lowStock: lowStockProducts },
    orders: { total: totalOrders, salesValue: salesAgg[0]?.total || 0 },
    leads: { total: totalLeads },
    visits: { total: totalVisits },
    attendance: { today: todayAttendance },
    payments: { received: paymentAgg[0]?.total || 0 }
  });
});

export const salesByEmployee = asyncHandler(async (_req, res) => {
  const report = await Order.aggregate([
    { $group: { _id: '$placedBy', totalSales: { $sum: '$grandTotal' }, orderCount: { $sum: 1 } } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'employee'
      }
    },
    { $unwind: '$employee' },
    { $project: { totalSales: 1, orderCount: 1, employee: { name: 1, email: 1, role: 1 } } },
    { $sort: { totalSales: -1 } }
  ]);

  sendResponse(res, 200, 'Sales by employee fetched', report);
});
