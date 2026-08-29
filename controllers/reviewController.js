const mongoose = require('mongoose');
const Review = require('../models/Review');
const asyncHandler = require('../middleware/asyncHandler');

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const getReviews = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50, sortBy = 'createdAt', order = 'desc' } = req.query;

  const filter = {};

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { 'user.name': regex },
      { 'product.name': regex },
      { comment: regex },
    ];
  }

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name email')
      .populate('product', 'name images')
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limitNum),
    Review.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    count: reviews.length,
    total,
    page: pageNum,
    pages,
    reviews,
  });
});

const updateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid review ID', 400);
  }

  const review = await Review.findById(id);
  if (!review) throw makeError('Review not found', 404);

  if (status !== undefined) {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      throw makeError('Invalid status', 400);
    }
    review.status = status;
    await review.save();
  }

  res.status(200).json({
    success: true,
    message: 'Review updated',
    review,
  });
});

const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid review ID', 400);
  }

  const review = await Review.findById(id);
  if (!review) throw makeError('Review not found', 404);

  await review.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Review deleted',
    id: review._id,
  });
});

module.exports = { getReviews, updateReview, deleteReview };
