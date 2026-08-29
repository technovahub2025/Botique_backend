const Cart = require('../models/Cart');
const Product = require('../models/Product');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateShipping, calculateTax } = require('../utils/helpers');

const SHIPPING_THRESHOLD = 10000;
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

const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');

  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  }

  const orphanedItemIds = cart.items
    .filter((item) => !item.product)
    .map((item) => item._id);

  if (orphanedItemIds.length > 0) {
    orphanedItemIds.forEach((itemId) => cart.items.pull(itemId));
    await cart.save();
  }

  const totals = calculateTotals(cart);

  res.status(200).json({
    success: true,
    cart: {
      ...cart.toObject(),
      ...totals,
    },
  });
});

const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1, size, color } = req.body;

  if (!productId) {
    throw makeError('Product ID is required', 400);
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw makeError('Product not found', 404);
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

  const existingItem = cart.items.find(
    (item) =>
      item.product.toString() === productId &&
      (item.size || '') === (size || '') &&
      (item.color || '') === (color || '')
  );

  if (existingItem) {
    const newQty = existingItem.quantity + requestedQty;
    const newAvailableStock = stockCheck
      ? stockCheck.quantity - (newQty - requestedQty)
      : (product.stock || 0) - (newQty - requestedQty);
    if (newAvailableStock < 0) {
      throw makeError(`Only ${newAvailableStock + requestedQty} more item(s) in stock`, 400);
    }
    existingItem.quantity = newQty;
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
  const populated = await Cart.findById(cart._id).populate('items.product');
  const totals = calculateTotals(populated);

  res.status(200).json({
    success: true,
    message: 'Added to cart',
    cart: {
      ...populated.toObject(),
      ...totals,
    },
  });
});

const updateCartItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  if (!quantity || Number(quantity) < 1) {
    throw makeError('Quantity must be at least 1', 400);
  }

  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  if (!cart) {
    throw makeError('Cart not found', 404);
  }

  const item = cart.items.id(itemId);
  if (!item) {
    throw makeError('Cart item not found', 404);
  }

  if (!item.product) {
    cart.items.pull(itemId);
    await cart.save();
    const refreshed = await Cart.findById(cart._id).populate('items.product');
    const totals = calculateTotals(refreshed);
    return res.status(200).json({
      success: true,
      message: 'Item removed (product no longer available)',
      cart: { ...refreshed.toObject(), ...totals },
    });
  }

  const product = item.product;
  const requestedQty = Number(quantity);

  const stockCheck = product.stockBySize && product.stockBySize.length > 0
    ? product.stockBySize.find((s) => s.size === item.size)
    : null;

  const availableStock = stockCheck ? stockCheck.quantity : (product.stock || 0);

  if (availableStock < requestedQty) {
    throw makeError(`Only ${availableStock} item(s) in stock`, 400);
  }

  item.quantity = requestedQty;
  await cart.save();

  const totals = calculateTotals(cart);

  res.status(200).json({
    success: true,
    message: 'Cart updated',
    cart: {
      ...cart.toObject(),
      ...totals,
    },
  });
});

const removeCartItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    throw makeError('Cart not found', 404);
  }

  const item = cart.items.id(itemId);
  if (!item) {
    throw makeError('Cart item not found', 404);
  }

  cart.items.pull(itemId);
  await cart.save();

  const populated = await Cart.findById(cart._id).populate('items.product');
  const totals = calculateTotals(populated);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart',
    cart: {
      ...populated.toObject(),
      ...totals,
    },
  });
});

const clearCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({ user: req.user._id, items: [] });
  } else {
    cart.items = [];
    await cart.save();
  }

  const totals = calculateTotals(cart);

  res.status(200).json({
    success: true,
    message: 'Cart cleared',
    cart: {
      ...cart.toObject(),
      ...totals,
    },
  });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};
