const http = require('http');

const api = (path, method, body, token) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({
    hostname: 'localhost', port: 8000, path, method, timeout: 5000,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, body: d }); } });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

(async () => {
  // Login
  const login = await api('/api/auth/login', 'POST', {
    email: 'admin@loomandluster.com',
    password: 'Admin@123'
  });
  ('Login:', login.status, login.body.success ? 'OK' : login.body.message);
  const token = login.body.token;
  const h = token;

  // Create category
  const cat = await api('/api/categories', 'POST', {
    name: 'Sarees', slug: 'sarees', status: 'active', description: 'Silk & cotton sarees'
  }, h);
  ('Category:', cat.status, cat.body.success ? 'OK' : cat.body.message);
  const catId = cat.body.category?._id;

  // Create product
  const prod = await api('/api/products', 'POST', {
    name: 'Premium Silk Saree',
    slug: 'premium-silk-saree',
    sku: 'PSS-001',
    description: 'A beautiful premium silk saree with intricate work.',
    shortDescription: 'Premium silk saree',
    category: catId,
    price: 5000,
    salePrice: 4000,
    images: ['https://via.placeholder.com/600x800?text=Silk+Saree'],
    thumbnail: 'https://via.placeholder.com/600x800?text=Silk+Saree',
    sizes: ['S', 'M', 'L'],
    colors: ['Red', 'Blue', 'Green'],
    stock: 10,
    featured: true,
    status: 'active'
  }, h);
  ('Product:', prod.status, prod.body.success ? 'OK' : prod.body.message);
  const prodId = prod.body.product?._id;

  // Add to cart
  const cart = await api('/api/cart', 'POST', {
    productId: prodId, quantity: 2, size: 'M'
  }, h);
  ('Cart:', cart.status, 'items:', cart.body.cart?.itemCount);

  // Create order
  const order = await api('/api/orders', 'POST', {
    shippingAddress: {
      name: 'Admin User', phone: '9999999999',
      addressLine1: '123 Test Street', city: 'Mumbai',
      state: 'Maharashtra', postalCode: '400001', country: 'India'
    },
    deliveryMethod: 'standard',
    paymentMethod: 'cod'
  }, h);
  ('Order:', order.status, order.body.success ? order.body.order?.orderNumber : order.body.message);
  ('  Subtotal:', order.body.order?.subtotal);
  ('  Discount:', order.body.order?.discount);
  ('  Shipping:', order.body.order?.shipping);
  ('  Tax:', order.body.order?.tax);
  ('  Total:', order.body.order?.total);
  ('  Status:', order.body.order?.orderStatus);

  // Get orders list
  const orders = await api('/api/orders', 'GET', null, h);
  ('Orders list:', orders.status, orders.body.count, 'orders');

  // Get single order
  const oid = order.body.order._id;
  const single = await api('/api/orders/' + oid, 'GET', null, h);
  ('Get order:', single.status, single.body.success ? single.body.order?.orderNumber : single.body.message);

  // Update status
  const upd = await api('/api/orders/' + oid + '/status', 'PUT', { orderStatus: 'confirmed' }, h);
  ('Update status:', upd.status, upd.body.success, 'status:', upd.body.order?.orderStatus);

  // Check cart cleared
  const cartAfter = await api('/api/cart', 'GET', null, h);
  ('Cart after order:', cartAfter.body.cart?.items?.length, 'items');

  ('\n=== E2E FLOW COMPLETE ===');
  process.exit(0);
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
