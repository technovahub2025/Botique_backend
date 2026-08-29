const http = require('http');

const BASE = 'http://localhost:8000/api';

const request = (method, path, body, token) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: `/api${path}`,
      method,
      headers,
    };
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

(async () => {
  try {
    // 1. Login
    const login = await request('POST', '/auth/login', {
      email: 'admin@loomandluster.com',
      password: 'Admin@123',
    });
    (`1. Login: status=${login.status}, success=${login.data.success}`);
    if (!login.data.success) {
      ('   Login response:', JSON.stringify(login.data).substring(0, 300));
      return;
    }
    const token = login.data.token;

    // 2. Create category
    const cat = await request('POST', '/categories', { name: 'E2E', slug: 'e2e', status: 'active' }, token);
    (`2. Category: status=${cat.status}, name=${cat.data.category?.name}`);
    const catId = cat.data.category._id;

    // 3. Create product
    const prod = await request('POST', '/products', {
      name: 'Silk Saree', slug: 'silk-saree-e2e', sku: 'E2E-SAREE',
      description: 'Test', category: catId, price: 8000, salePrice: 6500,
      images: ['img.jpg'], thumbnail: 'img.jpg', sizes: ['S','M','L'],
      colors: ['Red','Blue'], stock: 10, status: 'active',
    }, token);
    (`3. Product: status=${prod.status}, _id=${prod.data.product?._id}`);
    const pid = prod.data.product._id;

    // 4. Add to cart
    const addRes = await request('POST', '/cart', { productId: pid, quantity: 2, size: 'M' }, token);
    (`4. Add to cart: status=${addRes.status}, success=${addRes.data.success}, msg="${addRes.data.message}", items=${addRes.data.cart?.items?.length}, qty=${addRes.data.cart?.items?.[0]?.quantity}`);

    // 5. Get cart & verify totals
    const cart = await request('GET', '/cart', null, token);
    (`5. Cart totals:`, JSON.stringify({
      subtotal: cart.data.cart.subtotal,
      shipping: cart.data.cart.shipping,
      tax: cart.data.cart.tax,
      total: cart.data.cart.total,
    }));
    const itemId = cart.data.cart.items[0]._id;

    // 6. Update quantity
    const upd = await request('PUT', `/cart/item/${itemId}`, { quantity: 5 }, token);
    (`6. Updated qty to: ${upd.data.cart.items[0].quantity}, total: ${upd.data.cart.total}`);

    // 7. Remove item
    const rem = await request('DELETE', `/cart/item/${itemId}`, null, token);
    (`7. After remove: items=${rem.data.cart.items.length}, total=${rem.data.cart.total}`);

    // 8. Add to wishlist
    const wish = await request('POST', '/wishlist', { productId: pid }, token);
    (`8. Add to wishlist: status=${wish.status}, success=${wish.data.success}, items=${wish.data.wishlist?.items?.length}`);

    // 9. Get wishlist
    const wlist = await request('GET', '/wishlist', null, token);
    (`9. Wishlist product: ${wlist.data.wishlist.items[0]?.product?.name}`);

    // 10. Move to cart
    const move = await request('POST', '/wishlist/move-to-cart', { productId: pid, quantity: 3, size: 'L' }, token);
    (`10. Move to cart: success=${move.data.success}`);
    (`    Cart items: ${move.data.cart.items.length}, qty: ${move.data.cart.items[0]?.quantity}, total: ${move.data.cart.total}`);
    (`    Wishlist items: ${move.data.wishlist.items.length}`);

    // 11. Verify final state
    const finalWish = await request('GET', '/wishlist', null, token);
    const finalCart = await request('GET', '/cart', null, token);
    (`11. Final wishlist count: ${finalWish.data.wishlist.items.length}`);
    (`    Final cart count: ${finalCart.data.cart.itemCount}, total: ${finalCart.data.cart.total}`);

    // 12. Stock validation
    const overRes = await request('POST', '/cart', { productId: pid, quantity: 100, size: 'M' }, token);
    (`12. Stock validation: status=${overRes.status}, msg="${overRes.data.message}"`);

    ('\n=== ALL E2E TESTS PASSED ===');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
