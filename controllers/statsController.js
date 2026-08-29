const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const [
    totalOrders,
    totalProducts,
    totalCustomers,
    ordersByStatus,
    lowStockProducts,
    totalSalesAgg,
  ] = await Promise.all([
    Order.countDocuments({}),
    Product.countDocuments({}),
    User.countDocuments({ role: 'customer' }),
    Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]),
    Product.countDocuments({
      $or: [
        { stock: { $lt: 5 } },
        { 'stockBySize.quantity': { $lt: 5 } },
      ],
    }),
    Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ]);

  const statusMap = {};
  ordersByStatus.forEach((s) => {
    statusMap[s._id] = s.count;
  });

  const totalSales = totalSalesAgg.length > 0 ? totalSalesAgg[0].total : 0;

  const recentOrders = await Order.find({})
    .populate('user', 'name email')
    .sort('-createdAt')
    .limit(5);

  res.status(200).json({
    success: true,
    stats: {
      totalSales: Math.round(totalSales),
      totalOrders,
      totalCustomers,
      totalProducts,
      pendingOrders: statusMap.pending || 0,
      lowStockProducts,
      ordersByStatus: {
        pending: statusMap.pending || 0,
        confirmed: statusMap.confirmed || 0,
        processing: statusMap.processing || 0,
        shipped: statusMap.shipped || 0,
        delivered: statusMap.delivered || 0,
        cancelled: statusMap.cancelled || 0,
        returned: statusMap.returned || 0,
      },
    },
    recentOrders: recentOrders.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      total: o.total,
      orderStatus: o.orderStatus,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
      user: o.user,
    })),
  });
});

module.exports = { getStats };
