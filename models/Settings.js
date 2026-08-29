const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    general: {
      boutiqueName: { type: String, default: 'Loom & Luster' },
      email: { type: String, default: 'hello@loomandluster.com' },
      phone: { type: String, default: '+91 98765 43210' },
      address: { type: String, default: 'Mumbai, India' },
      currency: { type: String, default: 'INR' },
      timezone: { type: String, default: 'Asia/Kolkata' },
    },
    orders: {
      orderPrefix: { type: String, default: 'LL' },
      defaultStatus: { type: String, default: 'pending' },
      autoConfirmOrder: { type: Boolean, default: false },
    },
    inventory: {
      lowStockThreshold: { type: Number, default: 5 },
      notifyLowStock: { type: Boolean, default: true },
      allowBackorder: { type: Boolean, default: false },
    },
    notifications: {
      newOrder: { type: Boolean, default: true },
      payment: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      orderStatus: { type: Boolean, default: true },
    },
    security: {
      jwtExpiresIn: { type: String, default: '30d' },
      sessionTimeout: { type: Number, default: 480 },
      twoFactorAuth: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
