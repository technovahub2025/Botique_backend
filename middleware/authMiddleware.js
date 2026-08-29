const { verifyToken } = require('../utils/generateToken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    const error = new Error('Not authorized, no token');
    error.statusCode = 401;
    return next(error);
  }

  try {
    const decoded = verifyToken(token);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      const error = new Error('Not authorized, user not found');
      error.statusCode = 401;
      return next(error);
    }

    if (!req.user.isActive && req.user.role !== 'admin') {
      const error = new Error('Account has been deactivated');
      error.statusCode = 401;
      return next(error);
    }

    next();
  } catch (error) {
    const err = new Error('Not authorized, invalid token');
    err.statusCode = 401;
    return next(err);
  }
};

module.exports = { protect };
