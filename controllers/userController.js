const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const asyncHandler = require('../middleware/asyncHandler');

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const getCustomers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50, sortBy = 'createdAt', order = 'desc' } = req.query;

  const filter = { role: 'customer' };

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [customers, total] = await Promise.all([
    User.find(filter)
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limitNum),
    User.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    count: customers.length,
    total,
    page: pageNum,
    pages,
    customers,
  });
});

const getCustomerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid customer ID', 400);
  }

  const customer = await User.findById(id).select('-password').populate('wishlist');

  if (!customer) {
    throw makeError('Customer not found', 404);
  }

  const orders = await Order.find({ user: customer._id }).sort('-createdAt');

  res.status(200).json({
    success: true,
    customer,
    orders,
    orderCount: orders.length,
    totalSpent: orders.reduce((sum, o) => sum + o.total, 0),
  });
});

module.exports = { getCustomers, getCustomerById };
