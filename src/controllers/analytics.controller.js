export const dashboardSummary = asyncHandler(async (req, res) => {
  const isSalesExecutive = req.user.role === "sales_executive";

  const orderFilter = isSalesExecutive
    ? { placedBy: req.user._id }
    : {};

  const leadFilter = isSalesExecutive
    ? { createdBy: req.user._id }
    : {};

  const visitFilter = isSalesExecutive
    ? { user: req.user._id }
    : {};

  const attendanceFilter = isSalesExecutive
    ? {
        user: req.user._id,
        date: new Date().toISOString().slice(0, 10),
      }
    : {
        date: new Date().toISOString().slice(0, 10),
      };

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
    paymentAgg,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({
      $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    }),

    Order.countDocuments(orderFilter),

    Lead.countDocuments(leadFilter),

    Visit.countDocuments(visitFilter),

    Attendance.countDocuments(attendanceFilter),

    Order.aggregate([
      { $match: orderFilter },
      {
        $group: {
          _id: null,
          total: { $sum: "$grandTotal" },
        },
      },
    ]),

    Payment.aggregate([
      { $match: { status: "received" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  sendResponse(res, 200, "Dashboard summary fetched", {
    users: { total: totalUsers, active: activeUsers },
    products: { total: totalProducts, lowStock: lowStockProducts },
    orders: { total: totalOrders, salesValue: salesAgg[0]?.total || 0 },
    leads: { total: totalLeads },
    visits: { total: totalVisits },
    attendance: { today: todayAttendance },
    payments: { received: paymentAgg[0]?.total || 0 },
  });
});