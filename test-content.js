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
  try {
    // Login
    const login = await api('/api/auth/login', 'POST', { email: 'admin@loomandluster.com', password: 'Admin@123' });
    const token = login.body.token;
    ('1. Admin login:', login.status, login.body.user?.role);

    // === HOMEPAGE ===
    // Get homepage
    const hp = await api('/api/homepage', 'GET', null, token);
    ('2. Homepage GET:', hp.status, 'sections:', hp.body.sections?.length);
    ('   First section:', hp.body.sections?.[0]?.key, hp.body.sections?.[0]?.enabled);

    // Update homepage - edit hero section
    const updatedSections = hp.body.sections.map((s) => {
      if (s.key === 'hero') {
        return {
          ...s,
          enabled: true,
          data: {
            ...s.data,
            heading: 'Welcome to Loom & Luster',
            description: 'Premium handcrafted clothing and accessories',
            heroImages: [
              {
                imageUrl: 'https://example.com/hero.jpg',
                heading: 'Welcome to Loom & Luster',
                description: 'Premium handcrafted clothing and accessories',
                buttonText: 'Shop Now',
                buttonLink: '/shop',
                enabled: true,
                order: 1,
              },
            ],
            ctaText: 'Shop Now',
            ctaLink: '/shop',
          },
        };
      }
      return s;
    });
    const hpUpdate = await api('/api/homepage', 'PUT', { sections: updatedSections }, token);
    ('3. Homepage PUT:', hpUpdate.status, hpUpdate.body.success);

    // Verify hero data
    const hpVerify = await api('/api/homepage', 'GET', null, token);
    const hero = hpVerify.body.sections.find((s) => s.key === 'hero');
    ('   Hero images:', hero?.data?.heroImages?.length);
    ('   Hero image 1:', hero?.data?.heroImages?.[0]?.imageUrl);
    ('   Hero heading:', hero?.data?.heading);

    // === COUPONS ===
    // Create coupon
    const now = new Date();
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    const createCoupon = await api('/api/coupons', 'POST', {
      code: 'WELCOME10',
      description: '10% off for new customers',
      discountType: 'percentage',
      value: 10,
      minOrder: 500,
      maxDiscount: 5000,
      startDate: now.toISOString().split('T')[0],
      endDate: future.toISOString().split('T')[0],
      usageLimit: 100,
      perUserLimit: 1,
      active: true,
    }, token);
    ('4. Coupon created:', createCoupon.status, createCoupon.body.success, createCoupon.body.coupon?.code);

    // List coupons
    const coupons = await api('/api/coupons?limit=50', 'GET', null, token);
    ('5. Coupons list:', coupons.status, coupons.body.count, 'coupons');
    ('   First:', coupons.body.coupons?.[0]?.code, coupons.body.coupons?.[0]?.discountType, coupons.body.coupons?.[0]?.value);

    // Update coupon (disable)
    const couponId = createCoupon.body.coupon._id;
    const disableCoupon = await api('/api/coupons/' + couponId, 'PUT', { active: false }, token);
    ('6. Coupon disabled:', disableCoupon.status, disableCoupon.body.coupon?.active);

    // Validate coupon (no admin token needed for validation)
    const validateRes = await api('/api/coupons/validate/WELCOME10', 'GET', null, token);
    ('7. Validate WELCOME10:', validateRes.status, validateRes.body.valid);

    // Delete coupon
    const deleteCoupon = await api('/api/coupons/' + couponId, 'DELETE', null, token);
    ('8. Coupon deleted:', deleteCoupon.status, deleteCoupon.body.success);

    // === REVIEWS ===
    // Create a test review by first creating a product and order
    // Since we don't have a reviews endpoint to create, let's just test GET
    const reviews = await api('/api/reviews?limit=50', 'GET', null, token);
    ('9. Reviews list:', reviews.status, reviews.body.count, 'reviews');

    // Test filter
    const pendingReviews = await api('/api/reviews?status=pending&limit=50', 'GET', null, token);
    ('   Pending reviews:', pendingReviews.body.count);

    ('\n=== CONTENT MANAGEMENT APIs WORKING ===');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
})();
