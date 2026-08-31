require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { apiLimiter } = require('./middleware/rateLimiter');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const orderRoutes = require('./routes/orderRoutes');
const statsRoutes = require('./routes/statsRoutes');
const userRoutes = require('./routes/userRoutes');
const homepageRoutes = require('./routes/homepageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const app = express();

// Render (and other proxied hosts) terminate TLS upstream; trust the
// forwarded proto/host so /uploads links are absolute HTTPS, not http://.
app.set('trust proxy', 1);

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
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/', apiLimiter);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', statsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/homepage', homepageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
