const User = require('../models/User');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@loomandluster.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';

const ensureAdminExists = async () => {
  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase(), role: 'admin' }).select('+password');
  if (existing) {
    if (existing.password && !existing.password.startsWith('$2')) {
      console.log('Admin password is not a bcrypt hash. Resetting...');
      existing.password = ADMIN_PASSWORD;
      await existing.save();
    }
    console.log('Admin account exists:', ADMIN_EMAIL);
    return existing;
  }

  const admin = await User.create({
    name: 'Admin',
    email: ADMIN_EMAIL,
    phone: process.env.ADMIN_PHONE || '9999999999',
    password: ADMIN_PASSWORD,
    role: 'admin',
    isEmailVerified: true,
    isActive: true,
  });

  console.log('Seeded admin account:', ADMIN_EMAIL);
  return admin;
};

module.exports = ensureAdminExists;
