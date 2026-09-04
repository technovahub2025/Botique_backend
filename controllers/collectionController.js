const mongoose = require('mongoose');
const Collection = require('../models/Collection');
const asyncHandler = require('../middleware/asyncHandler');
const { slugify } = require('../utils/helpers');

const VALID_STATUSES = ['active', 'inactive'];
const VALID_SORT_FIELDS = ['name', 'slug', 'order', 'featured', 'createdAt', 'updatedAt'];

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const toBoolean = (val) => {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return null;
};

const getCollections = asyncHandler(async (req, res) => {
  const { status, featured, search, page = 1, limit = 50, sortBy = 'createdAt', order = 'desc' } = req.query;

  const filter = {};

  if (status && VALID_STATUSES.includes(status)) {
    filter.status = status;
  }

  if (featured !== undefined) {
    const fb = toBoolean(featured);
    if (fb !== null) filter.featured = fb;
  }

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: regex }, { slug: regex }, { description: regex }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const sortField = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;

  const [collections, total] = await Promise.all([
    Collection.find(filter).sort({ [sortField]: sortOrder, name: 1 }).skip(skip).limit(limitNum),
    Collection.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    count: collections.length,
    total,
    page: pageNum,
    pages,
    collections,
  });
});

const getCollectionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid collection ID', 400);
  }

  const collection = await Collection.findById(id);

  if (!collection) {
    throw makeError('Collection not found', 404);
  }

  res.status(200).json({ success: true, collection });
});

const getCollectionBySlug = asyncHandler(async (req, res) => {
  const collection = await Collection.findOne({ slug: req.params.slug });

  if (!collection) {
    throw makeError('Collection not found', 404);
  }

  res.status(200).json({ success: true, collection });
});

const createCollection = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    description,
    heroImage,
    heroImageMetadata,
    heroVideo,
    heroVideoMetadata,
    bannerImage,
    bannerImageMetadata,
    bannerVideo,
    bannerVideoMetadata,
    featured,
    status,
  } = req.body;

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

  const fb = featured !== undefined ? toBoolean(featured) : undefined;
  if (featured !== undefined && fb === null) errors.push('featured must be true or false');

  if (errors.length) throw makeError(errors.join('; '), 400);

  if (slug) {
    const existing = await Collection.findOne({ slug: slugify(slug) });
    if (existing) throw makeError('A collection with this slug already exists', 400);
  } else if (name) {
    const autoSlug = slugify(name);
    const existing = await Collection.findOne({ slug: autoSlug });
    if (existing) throw makeError('A collection with this name already exists', 400);
  }

  const collectionData = {
    name: name.trim(),
  };
  if (slug) collectionData.slug = slugify(slug);
  else collectionData.slug = slugify(name);
  if (description !== undefined && description !== null) collectionData.description = description.trim();
  if (heroImage !== undefined && heroImage !== null) collectionData.heroImage = heroImage;
  if (heroImageMetadata !== undefined && heroImageMetadata !== null) collectionData.heroImageMetadata = heroImageMetadata;
  if (heroVideo !== undefined && heroVideo !== null) collectionData.heroVideo = heroVideo;
  if (heroVideoMetadata !== undefined && heroVideoMetadata !== null) collectionData.heroVideoMetadata = heroVideoMetadata;
  if (bannerImage !== undefined && bannerImage !== null) collectionData.bannerImage = bannerImage;
  if (bannerImageMetadata !== undefined && bannerImageMetadata !== null) collectionData.bannerImageMetadata = bannerImageMetadata;
  if (bannerVideo !== undefined && bannerVideo !== null) collectionData.bannerVideo = bannerVideo;
  if (bannerVideoMetadata !== undefined && bannerVideoMetadata !== null) collectionData.bannerVideoMetadata = bannerVideoMetadata;
  if (featured !== undefined) collectionData.featured = fb;
  if (status) collectionData.status = status;

  let collection;
  try {
    collection = await Collection.create(collectionData);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw makeError(`A collection with this ${field} already exists`, 400);
    }
    throw err;
  }

  res.status(201).json({
    success: true,
    message: 'Collection created successfully',
    collection,
  });
});

const updateCollection = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, heroImage, heroImageMetadata, heroVideo, heroVideoMetadata, bannerImage, bannerImageMetadata, bannerVideo, bannerVideoMetadata, featured, status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid collection ID', 400);
  }

  const collection = await Collection.findById(id);

  if (!collection) {
    throw makeError('Collection not found', 404);
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

  const fb = featured !== undefined ? toBoolean(featured) : undefined;
  if (featured !== undefined && fb === null) errors.push('featured must be true or false');

  if (errors.length) throw makeError(errors.join('; '), 400);

  if (name !== undefined) {
    collection.name = name.trim();
    if (slug === undefined) {
      const newSlug = slugify(name);
      if (newSlug !== collection.slug) {
        const existing = await Collection.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) throw makeError('A collection with this name/slug already exists', 400);
        collection.slug = newSlug;
      }
    }
  }

  if (slug !== undefined) {
    if (slug) {
      const newSlug = slugify(slug);
      if (newSlug !== collection.slug) {
        const existing = await Collection.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) throw makeError('A collection with this slug already exists', 400);
      }
      collection.slug = newSlug;
    }
  }

  if (description !== undefined) {
    collection.description = description !== null ? description.trim() : collection.description;
  }
  if (heroImage !== undefined) collection.heroImage = heroImage;
  if (heroImageMetadata !== undefined && heroImageMetadata !== null) collection.heroImageMetadata = heroImageMetadata;
  if (heroVideo !== undefined) collection.heroVideo = heroVideo;
  if (heroVideoMetadata !== undefined && heroVideoMetadata !== null) collection.heroVideoMetadata = heroVideoMetadata;
  if (bannerImage !== undefined) collection.bannerImage = bannerImage;
  if (bannerImageMetadata !== undefined && bannerImageMetadata !== null) collection.bannerImageMetadata = bannerImageMetadata;
  if (bannerVideo !== undefined) collection.bannerVideo = bannerVideo;
  if (bannerVideoMetadata !== undefined && bannerVideoMetadata !== null) collection.bannerVideoMetadata = bannerVideoMetadata;
  if (featured !== undefined) collection.featured = fb;
  if (status !== undefined) collection.status = status;

  try {
    await collection.save();
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw makeError(`A collection with this ${field} already exists`, 400);
    }
    throw err;
  }

  res.status(200).json({
    success: true,
    message: 'Collection updated successfully',
    collection,
  });
});

const deleteCollection = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid collection ID', 400);
  }

  const collection = await Collection.findById(id);

  if (!collection) {
    throw makeError('Collection not found', 404);
  }

  await collection.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Collection deleted successfully',
    id: collection._id,
  });
});

module.exports = {
  getCollections,
  getCollectionById,
  getCollectionBySlug,
  createCollection,
  updateCollection,
  deleteCollection,
};
