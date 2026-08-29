const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const { generateToken } = require('../utils/generateToken');

describe('Order API', () => {
  let token, userId, productId, categoryId;

  beforeEach(async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      password: 'password123',
    });
    userId = user._id;
    token = generateToken(userId, user.role);

    const category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      status: 'active',
    });
    categoryId = category._id;

    const product = await Product.create({
      name: 'Test Saree',
      slug: 'test-saree',
      sku: 'TEST-SAREE-ORDER',
      description: 'A beautiful silk saree.',
      category: categoryId,
      price: 5000,
      salePrice: 4000,
      images: ['https://via.placeholder.com/600x800'],
      thumbnail: 'https://via.placeholder.com/600x800',
      sizes: ['S', 'M', 'L'],
      colors: ['Red', 'Blue'],
      stock: 10,
      status: 'active',
    });
    productId = product._id;
  });

  const addToCart = async (token, productId, quantity, size) => {
    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: productId.toString(), quantity, size });
    if (res.status !== 200) {
      console.error('addToCart failed:', res.status, JSON.stringify(res.body).substring(0, 300));
    }
    return res;
  };

  const getCart = async (token) => {
    const res = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
    return res.body.cart;
  };

  describe('POST /api/orders — Full Checkout Flow', () => {
    it('should create order with all price calculations', async () => {
      await addToCart(token, productId, 2, 'M');

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
          deliveryMethod: 'standard',
          paymentMethod: 'cod',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Order created successfully');

      const order = res.body.order;
      expect(order.orderNumber).toBeDefined();
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(2);

      // Verify backend calculates all prices
      // Subtotal = 4000 (salePrice) * 2 = 8000
      expect(order.subtotal).toBe(8000);
      // Shipping = 200 (standard, subtotal < 10000)
      expect(order.shipping).toBe(200);
      // Tax = 12% of (8000 + 200) = 984
      expect(order.tax).toBe(984);
      // Total = 8000 + 200 + 984 = 9184
      expect(order.total).toBe(9184);
      expect(order.paymentMethod).toBe('cod');
      expect(order.orderStatus).toBe('pending');

      // Cart should be cleared
      const cart = await getCart(token);
      expect(cart.items).toHaveLength(0);
      expect(cart.itemCount).toBe(0);
    });

    it('should reduce product stock after order', async () => {
      await addToCart(token, productId, 3, null);

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      expect(res.status).toBe(201);

      const product = await Product.findById(productId);
      expect(product.stock).toBe(7); // 10 - 3 = 7
    });

    it('should reject when cart is empty', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Cart is empty');
    });

    it('should reject when shipping address is incomplete', async () => {
      await addToCart(token, productId, 1);

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate stock before creating order', async () => {
      await addToCart(token, productId, 5);

      await Product.findByIdAndUpdate(productId, { stock: 2 });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/stock/i);
    });

    it('should apply coupon and calculate discount', async () => {
      const coupon = await Coupon.create({
        code: 'TEST10',
        description: '10% off',
        discountType: 'percentage',
        value: 10,
        minOrder: 0,
        maxDiscount: 5000,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        usageLimit: 100,
        active: true,
      });

      await addToCart(token, productId, 2, 'M');

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
          couponCode: 'TEST10',
        });

      expect(res.status).toBe(201);
      const order = res.body.order;
      // Subtotal = 4000 * 2 = 8000
      expect(order.subtotal).toBe(8000);
      // Discount = 10% of 8000 = 800
      expect(order.discount).toBe(800);
      // Shipping = 0 (free, since 8000 - 800 = 7200 < 10000, so standard = 200)
      expect(order.shipping).toBe(200);
      // Tax = 12% of (8000 - 800 + 200) = 12% of 7400 = 888
      expect(order.tax).toBe(888);
      // Total = 8000 - 800 + 200 + 888 = 8288
      expect(order.total).toBe(8288);
    });

    it('should offer free shipping when subtotal >= threshold', async () => {
      const expensiveProduct = await Product.create({
        name: 'Luxury Lehenga',
        slug: 'luxury-lehenga-order',
        sku: 'LUX-LEHENGA-ORDER',
        description: 'Premium lehenga.',
        category: categoryId,
        price: 12000,
        images: ['img.jpg'],
        stock: 5,
        status: 'active',
      });

      await addToCart(token, expensiveProduct._id, 1);

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      expect(res.status).toBe(201);
      const order = res.body.order;
      expect(order.subtotal).toBe(12000);
      expect(order.shipping).toBe(0);
      expect(order.tax).toBe(1440);
      expect(order.total).toBe(13440);
    });

    it('should require authentication', async () => {
      await addToCart(token, productId, 1);

      const res = await request(app)
        .post('/api/orders')
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/orders — Get Orders', () => {
    it('should return empty list when no orders', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orders).toHaveLength(0);
    });

    it('should return user orders after creating one', async () => {
      await addToCart(token, productId, 2);
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(1);
      expect(res.body.orders[0].orderNumber).toBeDefined();
      expect(res.body.orders[0].total).toBe(9184);
    });
  });

  describe('GET /api/orders/:id — Get Single Order', () => {
    it('should return order details', async () => {
      await addToCart(token, productId, 1);

      const createRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      const orderRes = await request(app)
        .get(`/api/orders/${createRes.body.order._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(orderRes.status).toBe(200);
      expect(orderRes.body.success).toBe(true);
      expect(orderRes.body.order.orderNumber).toBeDefined();
      expect(orderRes.body.order.items).toHaveLength(1);
    });

    it('should reject when order not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/orders/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/orders/:id/status — Admin Update Status', () => {
    it('should update order status as admin', async () => {
      await addToCart(token, productId, 1);

      await User.findByIdAndUpdate(userId, { role: 'admin' });
      const adminToken = generateToken(userId, 'admin');

      const createRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      const orderId = createRes.body.order._id;

      const res = await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderStatus: 'confirmed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order.orderStatus).toBe('confirmed');
    });

    it('should reject non-admin users from updating status', async () => {
      await addToCart(token, productId, 1);

      const createRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shippingAddress: {
            name: 'Test User',
            phone: '1234567890',
            addressLine1: '123 Test Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            postalCode: '400001',
            country: 'India',
          },
        });

      const customerToken = generateToken(userId, 'customer');

      const res = await request(app)
        .put(`/api/orders/${createRes.body.order._id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderStatus: 'confirmed' });

      expect(res.status).toBe(403);
    });
  });
});
