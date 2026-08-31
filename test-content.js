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

    ('\n=== CONTENT MANAGEMENT APIs WORKING ===');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
})();
