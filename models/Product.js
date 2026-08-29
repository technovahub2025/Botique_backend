const mongoose = require('mongoose');
const { slugify } = require('../utils/helpers');

const sizeStockSchema = new mongoose.Schema({
  size: { type: String, required: true },
  quantity: { type: Number, default: 0, min: 0 },
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    sku: { type: String, unique: true, trim: true },
    description: { type: String, required: true },
    shortDescription: { type: String, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    collection: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0, default: null },
    costPrice: { type: Number, min: 0, default: null },
    images: [{ type: String, required: true }],
    thumbnail: { type: String },
    sizes: [{ type: String, trim: true }],
    colors: [{ type: String, trim: true }],
    fabric: { type: String, trim: true },
    material: { type: String, trim: true },
    care: { type: String, trim: true },
    stockBySize: [sizeStockSchema],
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    featured: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    bestSeller: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    meta: {
      title: { type: String },
      description: { type: String },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

productSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = slugify(this.name);
  }
  if (this.images && this.images.length > 0 && !this.thumbnail) {
    this.thumbnail = this.images[0];
  }
  next();
});

productSchema.virtual('discount').get(function () {
  if (this.salePrice && this.price) {
    return Math.round(((this.price - this.salePrice) / this.price) * 100);
  }
  return 0;
});

productSchema.virtual('effectivePrice').get(function () {
  return this.salePrice || this.price;
});

productSchema.virtual('isOnSale').get(function () {
  return this.salePrice && this.salePrice < this.price;
});

productSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
