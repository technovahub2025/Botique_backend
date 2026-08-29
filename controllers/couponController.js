const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const asyncHandler = require('../middleware/asyncHandler');

const toBoolean = (val) => {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return null;
};

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const getDiscount = (coupon, subtotal) => {
  if (coupon.discountType === 'percentage') {
    return (subtotal * coupon.value) / 100;
  }
  return coupon.value;
};

const getCoupons = asyncHandler(async (req, res) => {
  const { search, status, active, page = 1, limit = 50, sortBy = 'createdAt', order = 'desc' } = req.query;

  const filter = {};
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ code: regex }, { description: regex }];
  }
  if (status !== undefined) filter.active = status === 'active';
  if (active !== undefined) {
    const ab = toBoolean(active);
    if (ab !== null) filter.active = ab;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const sortField = ['code', 'createdAt', 'updatedAt', 'value', 'startDate', 'endDate'].includes(sortBy)
    ? sortBy
    : 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limitNum),
    Coupon.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    count: coupons.length,
    total,
    page: pageNum,
    pages,
    coupons,
  });
});

const getCouponById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    if (mongoose.Types.ObjectId.isValid(id)) throw makeError('Invalid coupon ID', 400);
  }

  const coupon = await Coupon.findById(id);
  if (!coupon) throw makeError('Coupon not found', 404);

  res.status(200).json({ success: true, coupon });
});

const validateCoupon = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const subtotal = parseFloat(req.query.subtotal) || 0;

  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) {
    return res.status(200).json({ valid: false, message: 'Coupon not found' });
  }

  const now = new Date();
  const errors = [];

  if (!coupon.active || now < coupon.startDate || now > coupon.endDate) {
    errors.push('Coupon is not valid');
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    errors.push('Usage limit reached');
  }

  if (subtotal > 0 && coupon.minOrder > 0 && subtotal < coupon.minOrder) {
    errors.push(`Minimum order of ${coupon.minOrder} required`);
  }

  if (errors.length) {
    return res.status(200).json({ valid: false, message: errors.join(', '), coupon: null });
  }

  let discount = getDiscount(coupon, subtotal);
  if (coupon.maxDiscount !== null && discount > coupon.maxDiscount) {
    discount = coupon.maxDiscount;
  }

  res.status(200).json({
    valid: true,
    coupon,
    discount,
    message: 'Coupon validated',
  });
});

const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType,
    value,
    minOrder = 0,
    maxDiscount = null,
    startDate,
    endDate,
    usageLimit = null,
    perUserLimit = 1,
    active = true,
  } = req.body;

  const errors = [];

  if (!code || typeof code !== 'string' || !code.trim()) {
    errors.push('code is required');
  }
  if (!['percentage', 'fixed'].includes(discountType || '')) {
    errors.push('discountType must be percentage or fixed');
  }
  if (value == null || isNaN(value) || Number(value) <= 0) {
    errors.push('value must be a positive number');
  }
  if (!startDate || !endDate) {
    errors.push('startDate and endDate are required');
  }

  if (errors.length) throw makeError(errors.join('; '), 400);

  const existing = await Coupon.findOne({ code: code.toUpperCase() });
  if (existing) throw makeError('A coupon with this code already exists', 400);

  const coupon = await Coupon.create({
    code: code.toUpperCase(),
    description,
    discountType,
    value: Number(value),
    minOrder: Number(minOrder),
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    usageLimit: usageLimit ? Number(usageLimit) : null,
    perUserLimit: Number(perUserLimit) || 1,
    active,
  });

  res.status(201).json({
    success: true,
    message: 'Coupon created successfully',
    coupon,
  });
});

const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid coupon ID', 400);
  }

  const coupon = await Coupon.findById(id);
  if (!coupon) throw makeError('Coupon not found', 404);

  const {
    code,
    description,
    discountType,
    value,
    minOrder,
    maxDiscount,
    startDate,
    endDate,
    usageLimit,
    perUserLimit,
    active,
  } = req.body;

  if (code !== undefined) {
    const existing = await Coupon.findOne({ code: code.toUpperCase(), _id: { $ne: id } });
    if (existing) throw makeError('A coupon with this code already exists', 400);
    coupon.code = code.toUpperCase();
  }
  if (description !== undefined) coupon.description = description;
  if (discountType !== undefined) {
    if (!['percentage', 'fixed'].includes(discountType)) throw makeError('Invalid discountType');
    coupon.discountType = discountType;
  }
  if (value !== undefined) coupon.value = Number(value);
  if (minOrder !== undefined) coupon.minOrder = Number(minOrder);
  if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount ? Number(maxDiscount) : null;
  if (startDate !== undefined) coupon.startDate = new Date(startDate);
  if (endDate !== undefined) coupon.endDate = new Date(endDate);
  if (usageLimit !== undefined) coupon.usageLimit = usageLimit ? Number(usageLimit) : null;
  if (perUserLimit !== undefined) coupon.perUserLimit = Number(perUserLimit);
  if (active !== undefined) coupon.active = active;

  await coupon.save();

  res.status(200).json({
    success: true,
    message: 'Coupon updated successfully',
    coupon,
  });
});

const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid coupon ID', 400);
  }

  const coupon = await Coupon.findById(id);
  if (!coupon) throw makeError('Coupon not found', 404);

  await coupon.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Coupon deleted successfully',
    id: coupon._id,
  });
});

module.exports = {
  getCoupons,
  getCouponById,
  validateCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getDiscount,
};
