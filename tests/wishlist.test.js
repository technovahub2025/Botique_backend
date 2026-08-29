const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { generateToken } = require('../utils/generateToken');

describe('Wishlist API', () => {
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

  describe('POST /api/wishlist — Add to Wishlist', () => {
    it('should add a product to wishlist', async () => {
      const res = await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Added to wishlist');
      expect(res.body.wishlist.items).toHaveLength(1);
      expect(res.body.wishlist.items[0].product._id).toBe(productId.toString());
    });

    it('should reject when product ID is missing', async () => {
      const res = await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject when product does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: fakeId });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject when product is already in wishlist', async () => {
      await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      const res = await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already in your wishlist/i);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/wishlist')
        .send({ productId: productId.toString() });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/wishlist — Get Wishlist', () => {
    it('should return an empty wishlist if none exists', async () => {
      const res = await request(app)
        .get('/api/wishlist')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.wishlist.items).toHaveLength(0);
    });

    it('should return wishlist with populated products', async () => {
      await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      const res = await request(app)
        .get('/api/wishlist')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.wishlist.items).toHaveLength(1);
      expect(res.body.wishlist.items[0].product.name).toBe('Test Saree');
      expect(res.body.wishlist.items[0].product.price).toBe(5000);
    });
  });

  describe('DELETE /api/wishlist/:productId — Remove from Wishlist', () => {
    it('should remove a product from wishlist', async () => {
      await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      const res = await request(app)
        .delete(`/api/wishlist/${productId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.wishlist.items).toHaveLength(0);
    });

    it('should reject when product is not in wishlist', async () => {
      const res = await request(app)
        .delete(`/api/wishlist/${productId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/wishlist/move-to-cart — Move to Cart', () => {
    it('should move product from wishlist to cart', async () => {
      // Add to wishlist
      await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      // Move to cart
      const res = await request(app)
        .post('/api/wishlist/move-to-cart')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: productId.toString(),
          quantity: 2,
          size: 'M',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Moved to cart');

      // Cart should have the product
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0].quantity).toBe(2);
      expect(res.body.cart.items[0].product._id).toBe(productId.toString());

      // Wishlist should be empty
      expect(res.body.wishlist.items).toHaveLength(0);

      // Verify cart totals are calculated by backend
      expect(res.body.cart).toHaveProperty('subtotal');
      expect(res.body.cart).toHaveProperty('shipping');
      expect(res.body.cart).toHaveProperty('tax');
      expect(res.body.cart).toHaveProperty('total');
      // Subtotal = 4000 (salePrice) * 2 = 8000
      expect(res.body.cart.subtotal).toBe(8000);
    });

    it('should reject move when product is not in wishlist', async () => {
      const res = await request(app)
        .post('/api/wishlist/move-to-cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 1 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject move when insufficient stock', async () => {
      await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      const res = await request(app)
        .post('/api/wishlist/move-to-cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 100 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/stock/i);
    });

    it('should increment cart quantity if product already in cart', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 2 });

      await request(app)
        .post('/api/wishlist')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString() });

      const res = await request(app)
        .post('/api/wishlist/move-to-cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productId.toString(), quantity: 3 });

      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0].quantity).toBe(5);
    });
  });
});
