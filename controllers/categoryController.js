const mongoose = require('mongoose');
const Category = require('../models/Category');
const asyncHandler = require('../middleware/asyncHandler');
const { slugify } = require('../utils/helpers');

const VALID_STATUSES = ['active', 'inactive'];
const VALID_SORT_FIELDS = ['name', 'slug', 'order', 'createdAt', 'updatedAt'];

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const getCategories = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 50, sortBy = 'order', order = 'asc' } = req.query;

  const filter = {};

  if (status && VALID_STATUSES.includes(status)) {
    filter.status = status;
  }

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: regex }, { slug: regex }, { description: regex }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const sortField = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'order';
  const sortOrder = order === 'desc' ? -1 : 1;

  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ [sortField]: sortOrder, name: 1 }).skip(skip).limit(limitNum),
    Category.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    count: categories.length,
    total,
    page: pageNum,
    pages,
    categories,
  });
});

const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid category ID', 400);
  }

  const category = await Category.findById(id);

  if (!category) {
    throw makeError('Category not found', 404);
  }

  res.status(200).json({ success: true, category });
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, description, image, video, status, order } = req.body;

  const errors = [];

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (order !== undefined && order !== null && (isNaN(order) || Number(order) < 0)) {
    errors.push('order must be a non-negative number');
  }

  if (errors.length) throw makeError(errors.join('; '), 400);

  if (slug) {
    const existing = await Category.findOne({ slug: slugify(slug) });
    if (existing) throw makeError('A category with this slug already exists', 400);
  } else if (name) {
    const autoSlug = slugify(name);
    const existing = await Category.findOne({ slug: autoSlug });
    if (existing) throw makeError('A category with this name already exists', 400);
  }

  const categoryData = {
    name: name.trim(),
  };
  if (slug) categoryData.slug = slugify(slug);
  else categoryData.slug = slugify(name);
  if (description !== undefined && description !== null) categoryData.description = description.trim();
  if (image !== undefined && image !== null) categoryData.image = image;
  if (video !== undefined && video !== null) categoryData.video = video;
  if (status) categoryData.status = status;
  if (order !== undefined && order !== null) categoryData.order = Number(order);

  let category;
  try {
    category = await Category.create(categoryData);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw makeError(`A category with this ${field} already exists`, 400);
    }
    throw err;
  }

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    category,
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, image, video, status, order } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid category ID', 400);
  }

  const category = await Category.findById(id);

  if (!category) {
    throw makeError('Category not found', 404);
  }

  const errors = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) errors.push('name must be a non-empty string');
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (order !== undefined && order !== null && (isNaN(order) || Number(order) < 0)) {
    errors.push('order must be a non-negative number');
  }

  if (errors.length) throw makeError(errors.join('; '), 400);

  if (name !== undefined) {
    category.name = name.trim();
    if (slug === undefined) {
      const newSlug = slugify(name);
      if (newSlug !== category.slug) {
        const existing = await Category.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) throw makeError('A category with this name/slug already exists', 400);
        category.slug = newSlug;
      }
    }
  }

  if (slug !== undefined) {
    if (slug) {
      const newSlug = slugify(slug);
      if (newSlug !== category.slug) {
        const existing = await Category.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) throw makeError('A category with this slug already exists', 400);
      }
      category.slug = newSlug;
    }
  }

  if (description !== undefined) {
    category.description = description !== null ? description.trim() : category.description;
  }
  if (image !== undefined) category.image = image;
  if (video !== undefined) category.video = video;
  if (status !== undefined) category.status = status;
  if (order !== undefined && order !== null) category.order = Number(order);

  try {
    await category.save();
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw makeError(`A category with this ${field} already exists`, 400);
    }
    throw err;
  }

  res.status(200).json({
    success: true,
    message: 'Category updated successfully',
    category,
  });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid category ID', 400);
  }

  const category = await Category.findById(id);

  if (!category) {
    throw makeError('Category not found', 404);
  }

  await category.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Category deleted successfully',
    id: category._id,
  });
});

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
