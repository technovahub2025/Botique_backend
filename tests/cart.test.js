const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { generateToken } = require('../utils/generateToken');

describe('Cart API', () => {
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
      sku: 'TEST-SAREE-001',
      description: 'A beautiful handwoven silk saree.',
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

  describe('POST /api/cart — Add to Cart', () => {
    it('should add a product to cart', async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: productId.toString(),
          quantity: 1,
          size: 'M',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Added to cart');
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0].quantity).toBe(1);
      expect(res.body.cart.items[0].size).toBe('M');
      expect(res.body.cart.itemCount).toBe(1);
    });

    it('should reject when product ID is missing', async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject when product does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: fakeId, quantity: 1 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject when quantity exceeds stock', async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: productId.toString(),
          quantity: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/stock/i);
    });

    it('should increment quantity if item already in cart', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 1 });

      const res = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 2 });

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0].quantity).toBe(3);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/cart')
        .send({ productId: productId.toString(), quantity: 1 });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/cart — Get Cart', () => {
    it('should return an empty cart if none exists', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(0);
      expect(res.body.cart.itemCount).toBe(0);
      expect(res.body.cart.subtotal).toBe(0);
      expect(res.body.cart.total).toBe(0);
    });

    it('should return cart with items and calculated totals', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 2, size: 'M' });

      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.itemCount).toBe(2);

      // Totals calculated by backend
      expect(res.body.cart).toHaveProperty('subtotal');
      expect(res.body.cart).toHaveProperty('shipping');
      expect(res.body.cart).toHaveProperty('tax');
      expect(res.body.cart).toHaveProperty('total');

      // Subtotal = salePrice (4000) * quantity (2) = 8000
      expect(res.body.cart.subtotal).toBe(8000);
      // Shipping = free for orders ≥ 10000, standard ₹200 for < 10000
      expect(res.body.cart.shipping).toBe(200);
      // Tax = 12% of subtotal
      expect(res.body.cart.tax).toBe(960);
      // Total = 8000 + 200 + 960 = 9160
      expect(res.body.cart.total).toBe(9160);
    });

    it('should offer free shipping when subtotal >= threshold', async () => {
      // Create a product that costs >= 10000
      const expensiveProduct = await Product.create({
        name: 'Luxury Lehenga',
        slug: 'luxury-lehenga',
        sku: 'TEST-LEHENGA-002',
        description: 'Premium hand-embroidered lehenga.',
        category: categoryId,
        price: 12000,
        images: ['https://via.placeholder.com/600x800'],
        thumbnail: 'https://via.placeholder.com/600x800',
        stock: 5,
        status: 'active',
      });

      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: expensiveProduct._id.toString(), quantity: 1 });

      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.cart.subtotal).toBe(12000);
      expect(res.body.cart.shipping).toBe(0);
    });
  });

  describe('PUT /api/cart/item/:itemId — Update Quantity', () => {
    it('should update item quantity', async () => {
      const addRes = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 1 });

      const itemId = addRes.body.cart.items[0]._id;

      const res = await request(app)
        .put(`/api/cart/item/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.cart.items[0].quantity).toBe(5);
    });

    it('should reject quantity of zero or negative', async () => {
      const addRes = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 1 });

      const itemId = addRes.body.cart.items[0]._id;

      const res = await request(app)
        .put(`/api/cart/item/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 0 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject quantity exceeding stock', async () => {
      const addRes = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 1 });

      const itemId = addRes.body.cart.items[0]._id;

      const res = await request(app)
        .put(`/api/cart/item/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 100 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/stock/i);
    });
  });

  describe('DELETE /api/cart/item/:itemId — Remove Item', () => {
    it('should remove an item from cart', async () => {
      const addRes = await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 1 });

      const itemId = addRes.body.cart.items[0]._id;

      const res = await request(app)
        .delete(`/api/cart/item/${itemId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toHaveLength(0);
    });
  });

  describe('DELETE /api/cart — Clear Cart', () => {
    it('should clear all items from cart', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 2 });

      const res = await request(app)
        .delete('/api/cart')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cart cleared');
      expect(res.body.cart.items).toHaveLength(0);
      expect(res.body.cart.itemCount).toBe(0);
    });
  });
});
