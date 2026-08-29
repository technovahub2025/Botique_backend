require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');

const { apiLimiter } = require('./middleware/rateLimiter');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const orderRoutes = require('./routes/orderRoutes');
const statsRoutes = require('./routes/statsRoutes');
const couponRoutes = require('./routes/couponRoutes');
const userRoutes = require('./routes/userRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const homepageRoutes = require('./routes/homepageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const { notFound, errorHandler } = require('./middleware/errorHandler');

// --------------------------------------------------
// PROCESS ERROR HANDLING
// --------------------------------------------------

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// --------------------------------------------------
// EXPRESS APP
// --------------------------------------------------

const app = express();

// --------------------------------------------------
// CORS
// --------------------------------------------------
// Allow requests from ANY origin.
//
// IMPORTANT:
// Do not use origin: '*' together with credentials: true.
// origin: true dynamically reflects the requesting origin,
// which works with credentials.
//
// This allows:
// - localhost frontend
// - Vercel frontend
// - Render frontend/testing
// - other allowed browser origins
// --------------------------------------------------

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
  })
);

// Handle CORS preflight requests
app.options('*', cors());

// --------------------------------------------------
// SECURITY
// --------------------------------------------------

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// --------------------------------------------------
// BODY PARSERS
// --------------------------------------------------

app.use(
  express.json({
    limit: '10mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
  })
);

// --------------------------------------------------
// MONGO SANITIZATION
// --------------------------------------------------

app.use(mongoSanitize());

// --------------------------------------------------
// LOGGER
// --------------------------------------------------

app.use(morgan('dev'));

// --------------------------------------------------
// STATIC UPLOADS
// --------------------------------------------------
// Images/files stored in backend/uploads can be accessed
// through:
//
// /uploads/filename.jpg
// --------------------------------------------------

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

// --------------------------------------------------
// API RATE LIMITER
// --------------------------------------------------

app.use('/api/', apiLimiter);

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

// Health
app.use('/api/health', healthRoutes);

// Authentication
app.use('/api/auth', authRoutes);

// Products
app.use('/api/products', productRoutes);

// Categories
app.use('/api/categories', categoryRoutes);

// Collections
app.use('/api/collections', collectionRoutes);

// Cart
app.use('/api/cart', cartRoutes);

// Wishlist
app.use('/api/wishlist', wishlistRoutes);

// Orders
app.use('/api/orders', orderRoutes);

// Statistics / Dashboard
app.use('/api', statsRoutes);

// Coupons
app.use('/api/coupons', couponRoutes);

// Users
app.use('/api/users', userRoutes);

// Reviews
app.use('/api/reviews', reviewRoutes);

// Homepage / Hero Banner
app.use('/api/homepage', homepageRoutes);

// Image Upload
app.use('/api/upload', uploadRoutes);

// Settings
app.use('/api/settings', settingsRoutes);

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.use(notFound);

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use(errorHandler);

// --------------------------------------------------
// EXPORT APP
// --------------------------------------------------

module.exports = app;