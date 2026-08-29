const Wishlist = require('../models/Wishlist');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateShipping, calculateTax } = require('../utils/helpers');

const TAX_RATE = 0.12;

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const calculateTotals = (cartDoc) => {
  const subtotal = cartDoc.subtotal || 0;

  if (subtotal === 0 && (cartDoc.itemCount === 0 || !cartDoc.itemCount)) {
    return {
      itemCount: 0,
      subtotal: 0,
      shipping: 0,
      tax: 0,
      total: 0,
    };
  }

  const shipping = calculateShipping(subtotal, 'standard');
  const tax = calculateTax(subtotal, TAX_RATE);
  const total = subtotal + shipping + tax;

  return {
    itemCount: cartDoc.itemCount || 0,
    subtotal,
    shipping,
    tax,
    total,
  };
};

const getWishlist = asyncHandler(async (req, res) => {
  let wishlist = await Wishlist.findOne({ user: req.user._id }).populate('items.product');

  if (!wishlist) {
    wishlist = await Wishlist.create({ user: req.user._id, items: [] });
  }

  res.status(200).json({
    success: true,
    wishlist: {
      _id: wishlist._id,
      user: wishlist.user,
      items: wishlist.items,
      createdAt: wishlist.createdAt,
      updatedAt: wishlist.updatedAt,
    },
  });
});

const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    throw makeError('Product ID is required', 400);
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw makeError('Product not found', 404);
  }

  let wishlist = await Wishlist.findOne({ user: req.user._id });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: req.user._id, items: [] });
  }

  const existing = wishlist.items.find(
    (item) => item.product.toString() === productId
  );

  if (existing) {
    throw makeError('Product is already in your wishlist', 400);
  }

  wishlist.items.push({ product: productId });
  await wishlist.save();

  const populated = await Wishlist.findById(wishlist._id).populate('items.product');

  res.status(201).json({
    success: true,
    message: 'Added to wishlist',
    wishlist: {
      _id: populated._id,
      user: populated.user,
      items: populated.items,
      createdAt: populated.createdAt,
      updatedAt: populated.updatedAt,
    },
  });
});

const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const wishlist = await Wishlist.findOne({ user: req.user._id });
  if (!wishlist) {
    throw makeError('Wishlist not found', 404);
  }

  const existing = wishlist.items.find(
    (item) => item.product.toString() === productId
  );

  if (!existing) {
    throw makeError('Product is not in your wishlist', 404);
  }

  wishlist.items = wishlist.items.filter(
    (item) => item.product.toString() !== productId
  );
  await wishlist.save();

  const populated = await Wishlist.findById(wishlist._id).populate('items.product');

  res.status(200).json({
    success: true,
    message: 'Removed from wishlist',
    wishlist: {
      _id: populated._id,
      user: populated.user,
      items: populated.items,
      createdAt: populated.createdAt,
      updatedAt: populated.updatedAt,
    },
  });
});

const moveToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1, size, color } = req.body;

  if (!productId) {
    throw makeError('Product ID is required', 400);
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw makeError('Product not found', 404);
  }

  const wishlist = await Wishlist.findOne({ user: req.user._id });
  if (!wishlist) {
    throw makeError('Wishlist not found', 404);
  }

  const existing = wishlist.items.find(
    (item) => item.product.toString() === productId
  );

  if (!existing) {
    throw makeError('Product is not in your wishlist', 404);
  }

  const requestedQty = Math.max(1, Number(quantity));

  const stockCheck = product.stockBySize && product.stockBySize.length > 0
    ? product.stockBySize.find((s) => s.size === size)
    : null;

  const availableStock = stockCheck ? stockCheck.quantity : (product.stock || 0);

  if (availableStock < requestedQty) {
    throw makeError(`Only ${availableStock} item(s) in stock`, 400);
  }

  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  }

  const existingCartItem = cart.items.find(
    (item) =>
      item.product.toString() === productId &&
      (item.size || '') === (size || '') &&
      (item.color || '') === (color || '')
  );

  if (existingCartItem) {
    existingCartItem.quantity += requestedQty;
  } else {
    cart.items.push({
      product: productId,
      quantity: requestedQty,
      price: product.price,
      salePrice: product.salePrice,
      size: size || null,
      color: color || null,
    });
  }

  await cart.save();

  wishlist.items = wishlist.items.filter(
    (item) => item.product.toString() !== productId
  );
  await wishlist.save();

  const populatedCart = await Cart.findById(cart._id).populate('items.product');
  const populatedWishlist = await Wishlist.findById(wishlist._id).populate('items.product');

  const totals = calculateTotals(populatedCart);

  res.status(200).json({
    success: true,
    message: 'Moved to cart',
    cart: {
      ...populatedCart.toObject(),
      ...totals,
    },
    wishlist: {
      _id: populatedWishlist._id,
      user: populatedWishlist.user,
      items: populatedWishlist.items,
      createdAt: populatedWishlist.createdAt,
      updatedAt: populatedWishlist.updatedAt,
    },
  });
});

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart,
};
