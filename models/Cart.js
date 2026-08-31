const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, required: true },
    salePrice: { type: Number, default: null },
    size: { type: String },
    color: { type: String },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, item) => {
    const price = item.salePrice || item.price;
    return sum + price * item.quantity;
  }, 0);
});

cartSchema.virtual('total').get(function () {
  return this.subtotal;
});

cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
