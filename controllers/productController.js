const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Collection = require('../models/Collection');
const asyncHandler = require('../middleware/asyncHandler');
const { slugify } = require('../utils/helpers');

const VALID_STATUSES = ['draft', 'active', 'archived'];
const VALID_SORT_FIELDS = [
  'name',
  'price',
  'salePrice',
  'createdAt',
  'updatedAt',
  'stock',
  'sku',
];

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

const resolveReference = async (Model, value, label, strict = false) => {
  if (!value) return null;

  if (mongoose.Types.ObjectId.isValid(value)) {
    if (strict) {
      const doc = await Model.findById(value);
      if (!doc) throw makeError(`${label} not found`, 404);
    }
    return value;
  }

  const doc = await Model.findOne({ slug: value });
  if (!doc) {
    if (strict) throw makeError(`${label} not found`, 404);
    return null;
  }
  return doc._id;
};

const findProductById = async (id) =>
  Product.findById(id)
    .populate('category', 'name slug')
    .populate('collection', 'name slug');

const getProducts = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    collection,
    minPrice,
    maxPrice,
    status,
    featured,
    newArrival,
    bestSeller,
    page = 1,
    limit = 12,
    sortBy = 'createdAt',
    order = 'desc',
  } = req.query;

  const filter = {};

  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: regex }, { description: regex }, { sku: regex }];
  }

  if (category) {
    const catId = await resolveReference(Category, category, 'Category', false);
    filter.category = catId || { $in: [] };
  }

  if (collection) {
    const collId = await resolveReference(Collection, collection, 'Collection', false);
    filter.collection = collId || { $in: [] };
  }

  if (minPrice != null || maxPrice != null) {
    filter.price = {};
    if (minPrice != null) filter.price.$gte = Number(minPrice);
    if (maxPrice != null) filter.price.$lte = Number(maxPrice);
  }

  if (status && VALID_STATUSES.includes(status)) {
    filter.status = status;
  }

  if (featured !== undefined) {
    const fb = toBoolean(featured);
    if (fb !== null) filter.featured = fb;
  }

  if (newArrival !== undefined) {
    const na = toBoolean(newArrival);
    if (na !== null) filter.newArrival = na;
  }

  if (bestSeller !== undefined) {
    const bs = toBoolean(bestSeller);
    if (bs !== null) filter.bestSeller = bs;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
  const skip = (pageNum - 1) * limitNum;

  const sortField = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .populate('collection', 'name slug')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments(filter),
  ]);

  const pages = Math.ceil(total / limitNum);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    page: pageNum,
    pages,
    products,
  });
});

const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid product ID', 400);
  }

  const product = await findProductById(id);

  if (!product) {
    throw makeError('Product not found', 404);
  }

  res.status(200).json({ success: true, product });
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('category', 'name slug')
    .populate('collection', 'name slug');

  if (!product) {
    throw makeError('Product not found', 404);
  }

  res.status(200).json({ success: true, product });
});

const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    shortDescription,
    category,
    collection,
    price,
    salePrice,
    costPrice,
    sku,
    slug,
    images,
    thumbnail,
    sizes,
    colors,
    fabric,
    material,
    care,
    stockBySize,
    stock,
    lowStockThreshold,
    featured,
    newArrival,
    bestSeller,
    status,
    meta,
  } = req.body;

  const errors = [];

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    errors.push('description is required and must be a non-empty string');
  }
  if (!category) {
    errors.push('category is required');
  }
  if (price == null || isNaN(price) || Number(price) < 0) {
    errors.push('price must be a non-negative number');
  }
  if (!images || !Array.isArray(images) || images.length === 0) {
    errors.push('images is required (non-empty array of image URLs)');
  } else if (!images.every((img) => typeof img === 'string' && img.trim())) {
    errors.push('each image must be a non-empty string');
  }
  if (salePrice != null && !isNaN(salePrice)) {
    if (Number(salePrice) < 0) {
      errors.push('salePrice must be a non-negative number');
    } else if (price != null && !isNaN(price) && Number(salePrice) >= Number(price)) {
      errors.push('salePrice must be less than price');
    }
  }
  if (costPrice != null && !isNaN(costPrice) && Number(costPrice) < 0) {
    errors.push('costPrice must be a non-negative number');
  }
  if (status != null && !VALID_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (stock !== undefined && (isNaN(stock) || Number(stock) < 0)) {
    errors.push('stock must be a non-negative number');
  }
  if (lowStockThreshold !== undefined && (isNaN(lowStockThreshold) || Number(lowStockThreshold) < 0)) {
    errors.push('lowStockThreshold must be a non-negative number');
  }

  const fb = toBoolean(featured);
  const na = toBoolean(newArrival);
  const bs = toBoolean(bestSeller);
  if (featured !== undefined && fb === null) errors.push('featured must be true or false');
  if (newArrival !== undefined && na === null) errors.push('newArrival must be true or false');
  if (bestSeller !== undefined && bs === null) errors.push('bestSeller must be true or false');

  if (sizes && !Array.isArray(sizes)) errors.push('sizes must be an array');
  if (colors && !Array.isArray(colors)) errors.push('colors must be an array');
  if (stockBySize && !Array.isArray(stockBySize)) errors.push('stockBySize must be an array');

  if (errors.length) throw makeError(errors.join('; '), 400);

  const categoryId = await resolveReference(Category, category, 'Category', true);
  let collectionId = null;
  if (collection) {
    collectionId = await resolveReference(Collection, collection, 'Collection', true);
  }

  if (sku) {
    const existing = await Product.findOne({ sku: sku.trim() });
    if (existing) throw makeError('A product with this SKU already exists', 400);
  }

  if (slug) {
    const existing = await Product.findOne({ slug: slugify(slug) });
    if (existing) throw makeError('A product with this slug already exists', 400);
  }

  const autoSlug = slugify(name);
  if (!slug && autoSlug) {
    const existingSlug = await Product.findOne({ slug: autoSlug });
    if (existingSlug) {
      throw makeError(
        'A product with this name already exists. Please provide a unique slug.',
        400
      );
    }
  }

  const productData = {
    name: name.trim(),
    description: description.trim(),
    category: categoryId,
    price: Number(price),
    images,
  };

  if (shortDescription) productData.shortDescription = shortDescription.trim();
  if (collectionId) productData.collection = collectionId;
  if (sku) productData.sku = sku.trim();
  if (slug) productData.slug = slugify(slug);
  if (thumbnail) productData.thumbnail = thumbnail;
  if (images.length > 0) productData.thumbnail = productData.thumbnail || images[0];
  if (salePrice != null) productData.salePrice = Number(salePrice);
  if (costPrice != null) productData.costPrice = Number(costPrice);
  if (sizes) productData.sizes = sizes;
  if (colors) productData.colors = colors;
  if (fabric) productData.fabric = fabric.trim();
  if (material) productData.material = material.trim();
  if (care) productData.care = care.trim();
  if (stockBySize) productData.stockBySize = stockBySize;
  if (stock !== undefined) productData.stock = Number(stock);
  if (lowStockThreshold !== undefined) productData.lowStockThreshold = Number(lowStockThreshold);
  if (featured !== undefined) productData.featured = fb;
  if (newArrival !== undefined) productData.newArrival = na;
  if (bestSeller !== undefined) productData.bestSeller = bs;
  if (status) productData.status = status;
  if (meta) productData.meta = meta;

  let product;
  try {
    product = await Product.create(productData);
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw makeError(`A product with this ${field} already exists`, 400);
    }
    throw err;
  }
  const populated = await findProductById(product._id);

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product: populated,
  });
});

const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid product ID', 400);
  }

  const product = await Product.findById(id);

  if (!product) {
    throw makeError('Product not found', 404);
  }

  const {
    name,
    description,
    shortDescription,
    category,
    collection,
    price,
    salePrice,
    costPrice,
    sku,
    slug,
    images,
    thumbnail,
    sizes,
    colors,
    fabric,
    material,
    care,
    stockBySize,
    stock,
    lowStockThreshold,
    featured,
    newArrival,
    bestSeller,
    status,
    meta,
  } = req.body;

  const errors = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) errors.push('name must be a non-empty string');
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || !description.trim()) errors.push('description must be a non-empty string');
  }
  if (category !== undefined && category && mongoose.Types.ObjectId.isValid(category)) {
    const doc = await Category.findById(category);
    if (!doc) throw makeError('Category not found', 404);
  }
  if (price !== undefined) {
    if (price == null || isNaN(price) || Number(price) < 0) {
      errors.push('price must be a non-negative number');
    }
  }
  if (salePrice !== undefined && salePrice !== null) {
    if (isNaN(salePrice) || Number(salePrice) < 0) {
      errors.push('salePrice must be a non-negative number');
    }
  }
  if (images !== undefined) {
    if (!Array.isArray(images) || images.length === 0) {
      errors.push('images must be a non-empty array');
    } else if (!images.every((img) => typeof img === 'string' && img.trim())) {
      errors.push('each image must be a non-empty string');
    }
  }
  if (costPrice !== undefined && costPrice != null) {
    if (isNaN(costPrice) || Number(costPrice) < 0) {
      errors.push('costPrice must be a non-negative number');
    }
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (stock !== undefined && (isNaN(stock) || Number(stock) < 0)) {
    errors.push('stock must be a non-negative number');
  }
  if (lowStockThreshold !== undefined && (isNaN(lowStockThreshold) || Number(lowStockThreshold) < 0)) {
    errors.push('lowStockThreshold must be a non-negative number');
  }

  const fb = featured !== undefined ? toBoolean(featured) : undefined;
  const na = newArrival !== undefined ? toBoolean(newArrival) : undefined;
  const bs = bestSeller !== undefined ? toBoolean(bestSeller) : undefined;
  if (featured !== undefined && fb === null) errors.push('featured must be true or false');
  if (newArrival !== undefined && na === null) errors.push('newArrival must be true or false');
  if (bestSeller !== undefined && bs === null) errors.push('bestSeller must be true or false');

  if (sizes !== undefined && sizes !== null && !Array.isArray(sizes)) errors.push('sizes must be an array');
  if (colors !== undefined && colors !== null && !Array.isArray(colors)) errors.push('colors must be an array');
  if (stockBySize !== undefined && stockBySize !== null && !Array.isArray(stockBySize)) {
    errors.push('stockBySize must be an array');
  }

  if (errors.length) throw makeError(errors.join('; '), 400);

  const comparePrice = price !== undefined ? Number(price) : product.price;

  if (
    salePrice !== undefined &&
    salePrice !== null &&
    !isNaN(salePrice) &&
    Number(salePrice) >= comparePrice
  ) {
    throw makeError('salePrice must be less than price', 400);
  }

  if (
    price !== undefined &&
    product.salePrice != null &&
    Number(price) <= Number(product.salePrice)
  ) {
    throw makeError('price must be greater than the current salePrice', 400);
  }

  if (name !== undefined) {
    product.name = name.trim();
    if (slug === undefined) {
      const newSlug = slugify(name);
      if (newSlug !== product.slug) {
        const existing = await Product.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) throw makeError('A product with this slug already exists', 400);
        product.slug = newSlug;
      }
    }
  }
  if (description !== undefined) product.description = description.trim();
  if (shortDescription !== undefined) {
    product.shortDescription = shortDescription
      ? shortDescription.trim()
      : product.shortDescription;
  }
  if (category !== undefined) {
    product.category = category
      ? await resolveReference(Category, category, 'Category', true)
      : product.category;
  }
  if (collection !== undefined) {
    product.collection = collection
      ? await resolveReference(Collection, collection, 'Collection', true)
      : null;
  }
  if (price !== undefined) product.price = Number(price);
  if (salePrice !== undefined) product.salePrice = salePrice != null ? Number(salePrice) : null;
  if (costPrice !== undefined) product.costPrice = costPrice != null ? Number(costPrice) : null;
  if (sku !== undefined) {
    if (sku && sku.trim() !== product.sku) {
      const existing = await Product.findOne({ sku: sku.trim(), _id: { $ne: id } });
      if (existing) throw makeError('A product with this SKU already exists', 400);
    }
    product.sku = sku ? sku.trim() : product.sku;
  }
  if (slug !== undefined) {
    if (slug) {
      const newSlug = slugify(slug);
      if (newSlug !== product.slug) {
        const existing = await Product.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) throw makeError('A product with this slug already exists', 400);
      }
      product.slug = newSlug;
    }
  }
  if (images !== undefined) {
    product.images = images;
    if (images.length > 0 && !thumbnail) {
      product.thumbnail = images[0];
    }
  }
  if (thumbnail !== undefined) product.thumbnail = thumbnail || product.thumbnail;
  if (sizes !== undefined) product.sizes = sizes || [];
  if (colors !== undefined) product.colors = colors || [];
  if (fabric !== undefined) product.fabric = fabric ? fabric.trim() : product.fabric;
  if (material !== undefined) product.material = material ? material.trim() : product.material;
  if (care !== undefined) product.care = care ? care.trim() : product.care;
  if (stockBySize !== undefined) product.stockBySize = stockBySize || [];
  if (stock !== undefined) product.stock = Number(stock);
  if (lowStockThreshold !== undefined) product.lowStockThreshold = Number(lowStockThreshold);
  if (featured !== undefined) product.featured = fb;
  if (newArrival !== undefined) product.newArrival = na;
  if (bestSeller !== undefined) product.bestSeller = bs;
  if (status !== undefined) product.status = status;
  if (meta !== undefined) product.meta = meta || product.meta;

  try {
    await product.save();
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw makeError(`A product with this ${field} already exists`, 400);
    }
    throw err;
  }
  const populated = await findProductById(product._id);

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    product: populated,
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Invalid product ID', 400);
  }

  const product = await Product.findById(id);

  if (!product) {
    throw makeError('Product not found', 404);
  }

  await product.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully',
    id: product._id,
  });
});

module.exports = {
  getProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
};
