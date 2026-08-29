const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const asyncHandler = require('../middleware/asyncHandler');
const { calculateShipping, calculateTax } = require('../utils/helpers');

const TAX_RATE = 0.12;
const SHIPPING_THRESHOLD = 10000;
const EXPRESS_SHIPPING = 500;
const STANDARD_SHIPPING = 200;

const makeError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const orderController = {
  createOrder: asyncHandler(async (req, res) => {
    const {
      shippingAddress,
      billingAddress,
      couponCode,
      deliveryMethod = 'standard',
      paymentMethod = 'cod',
      notes,
    } = req.body;

    if (!shippingAddress || !shippingAddress.name || !shippingAddress.phone || !shippingAddress.addressLine1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postalCode || !shippingAddress.country) {
      throw makeError('Complete shipping address is required', 400);
    }

    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || !cart.items || cart.items.length === 0) {
      throw makeError('Cart is empty', 400);
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = item.product;
      if (!product) {
        throw makeError('One or more products no longer exist', 404);
      }

      if (product.status !== 'active') {
        throw makeError(`Product "${product.name}" is not available`, 400);
      }

      const currentPrice = product.salePrice || product.price;
      const itemTotal = currentPrice * item.quantity;

      const stockCheck = product.stockBySize && product.stockBySize.length > 0
        ? product.stockBySize.find((s) => s.size === item.size)
        : null;

      const availableStock = stockCheck ? stockCheck.quantity : (product.stock || 0);

      if (availableStock < item.quantity) {
        throw makeError(`Insufficient stock for "${product.name}" (Size: ${item.size || 'N/A'}). Only ${availableStock} available.`, 400);
      }

      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images && product.images.length > 0 ? product.images[0] : '',
        price: product.price,
        salePrice: product.salePrice,
        quantity: item.quantity,
        size: item.size || null,
        color: item.color || null,
        sku: product.sku || '',
      });
    }

    let discount = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (!coupon) {
        throw makeError('Invalid coupon code', 400);
      }

      if (!coupon.active) {
        throw makeError('Coupon is not active', 400);
      }

      const now = new Date();
      if (now < coupon.startDate || now > coupon.endDate) {
        throw makeError('Coupon has expired or is not yet valid', 400);
      }

      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        throw makeError('Coupon usage limit reached', 400);
      }

      if (subtotal < coupon.minOrder) {
        throw makeError(`Minimum order of ₹${coupon.minOrder} required for this coupon`, 400);
      }

      if (coupon.discountType === 'percentage') {
        discount = (subtotal * coupon.value) / 100;
      } else {
        discount = coupon.value;
      }

      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }

      discount = Math.round(discount * 100) / 100;

      cart.coupon = coupon._id;
      cart.couponCode = couponCode.toUpperCase();
      cart.couponDiscount = discount;

      coupon.usedCount += 1;
      await coupon.save();
    }

    const shipping = deliveryMethod === 'express'
      ? EXPRESS_SHIPPING
      : subtotal >= SHIPPING_THRESHOLD
        ? 0
        : STANDARD_SHIPPING;

    const taxableAmount = subtotal - discount + shipping;
    const tax = calculateTax(taxableAmount, TAX_RATE);
    const total = Math.round((subtotal - discount + shipping + tax) * 100) / 100;

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      shippingAddress: shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      subtotal,
      discount,
      shipping,
      tax,
      total,
      coupon: cart.coupon || null,
      couponCode: cart.couponCode || null,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
      deliveryMethod,
      notes: notes || '',
    });

    for (const item of cart.items) {
      const product = item.product;

      if (item.size) {
        const sizeStock = product.stockBySize.find((s) => s.size === item.size);
        if (sizeStock) {
          sizeStock.quantity = Math.max(0, sizeStock.quantity - item.quantity);
          await product.save();
        } else {
          product.stock = Math.max(0, product.stock - item.quantity);
          await product.save();
        }
      } else {
        product.stock = Math.max(0, product.stock - item.quantity);
        await product.save();
      }
    }

    cart.items = [];
    cart.coupon = undefined;
    cart.couponCode = undefined;
    cart.couponDiscount = 0;
    await cart.save();

    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'name email phone')
      .populate('items.product')
      .populate('coupon');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        _id: populatedOrder._id,
        orderNumber: populatedOrder.orderNumber,
        user: populatedOrder.user,
        items: populatedOrder.items,
        shippingAddress: populatedOrder.shippingAddress,
        billingAddress: populatedOrder.billingAddress,
        subtotal: populatedOrder.subtotal,
        discount: populatedOrder.discount,
        shipping: populatedOrder.shipping,
        tax: populatedOrder.tax,
        total: populatedOrder.total,
        couponCode: populatedOrder.couponCode,
        paymentMethod: populatedOrder.paymentMethod,
        paymentStatus: populatedOrder.paymentStatus,
        orderStatus: populatedOrder.orderStatus,
        deliveryMethod: populatedOrder.deliveryMethod,
        estimatedDelivery: populatedOrder.estimatedDelivery,
        notes: populatedOrder.notes,
        createdAt: populatedOrder.createdAt,
        updatedAt: populatedOrder.updatedAt,
      },
    });
  }),

  getOrders: asyncHandler(async (req, res) => {
    if (req.user.role === 'admin') {
      const orders = await Order.find({}).populate('user', 'name email').sort('-createdAt');
      return res.status(200).json({
        success: true,
        count: orders.length,
        orders,
      });
    }

    const orders = await Order.find({ user: req.user._id }).sort('-createdAt');
    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  }),

  getOrder: asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product')
      .populate('coupon');

    if (!order) {
      throw makeError('Order not found', 404);
    }

    if (req.user.role !== 'admin' && order.user._id.toString() !== req.user._id.toString()) {
      throw makeError('Not authorized to view this order', 403);
    }

    res.status(200).json({
      success: true,
      order,
    });
  }),

  updateOrderStatus: asyncHandler(async (req, res) => {
    const { orderStatus, paymentStatus } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      throw makeError('Order not found', 404);
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (orderStatus && validStatuses.includes(orderStatus)) {
      order.orderStatus = orderStatus;

      if (orderStatus === 'shipped' && !order.estimatedDelivery) {
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 5);
        order.estimatedDelivery = deliveryDate;
      }
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order status updated',
      order,
    });
  }),

  deleteOrder: asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      throw makeError('Order not found', 404);
    }

    if (order.orderStatus !== 'cancelled' && order.orderStatus !== 'returned') {
      throw makeError('Only cancelled or returned orders can be deleted', 400);
    }

    await order.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Order deleted',
    });
  }),
};

module.exports = orderController;
