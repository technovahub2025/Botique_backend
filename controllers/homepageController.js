const Homepage = require('../models/Homepage');
const asyncHandler = require('../middleware/asyncHandler');

const DEFAULT_SECTIONS = [
  {
    key: 'hero',
    enabled: true,
    data: {
      heroImages: [],
      heading: 'Elegance Woven Into Every Thread',
      description:
        'Discover award-winning handloom collections where traditional Indian craftsmanship meets contemporary design.',
      ctaText: 'Discover Collection',
      ctaLink: '/shop',
    },
  },
  { key: 'new_arrivals', enabled: true, data: { title: 'New Arrivals', subtitle: 'Freshly woven, just in', limit: 8 } },
  { key: 'product_carousel', enabled: true, data: { title: 'New Arrivals', type: 'newArrival', subtitle: 'Freshly woven, just in', limit: 8 } },
  { key: 'shop_by_category', enabled: true, data: { title: 'Shop by Category', subtitle: 'Curated by silhouette' } },
  { key: 'featured_collection', enabled: true, data: { title: 'Featured Collection', subtitle: "Editor's selection", collectionId: '', image: '' } },
  { key: 'shop_the_look', enabled: true, data: { title: 'Shop The Look', images: [], description: 'Style inspiration' } },
  { key: 'editorial', enabled: true, data: { title: 'The Art of Handweaving', content: '', imageUrl: '', linkUrl: '/story' } },
  { key: 'craftsmanship', enabled: true, data: { title: 'Our Craftsmanship', description: 'Handcrafted with care', imageUrl: '' } },
  { key: 'trending', enabled: true, data: { title: 'Trending Now', subtitle: 'Most popular pieces', limit: 8 } },
  { key: 'price_sections', enabled: true, data: { title: 'Find Your Investment', subtitle: 'Curated by price' } },
  { key: 'newsletter', enabled: true, data: { title: 'Join Our Newsletter', description: 'Subscribe for exclusive previews and styling tips.', buttonText: 'Subscribe' } },
];

const normalizeHeroImages = (raw) => {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          imageUrl: item,
          smallLabel: '',
          heading: '',
          description: '',
          buttonText: '',
          buttonLink: '',
          order: index + 1,
          isActive: true,
          enabled: true,
        };
      }
      if (item && typeof item === 'object') {
        const isActive = item.isActive !== undefined ? item.isActive : item.enabled !== undefined ? item.enabled : true;
        return {
          id: item.id || item._id || undefined,
          imageUrl: item.imageUrl || item.image || '',
          smallLabel: item.smallLabel || '',
          heading: item.heading || '',
          description: item.description || '',
          buttonText: item.buttonText || '',
          buttonLink: item.buttonLink || '',
          order: item.order !== undefined ? item.order : index + 1,
          isActive,
          enabled: isActive,
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

const normalizeSections = (sections) => {
  if (!Array.isArray(sections)) return sections;
  return sections.map((section) => {
    if (!section) return section;
    const sec = {
      key: section.key,
      enabled: section.enabled,
      data: { ...(section.data || {}) },
    };
    if (sec.key === 'hero') {
      sec.data.heroImages = normalizeHeroImages(sec.data.heroImages);
    }
    return sec;
  });
};

const getHomepage = asyncHandler(async (req, res) => {
  let homepage = await Homepage.findOne();
  if (!homepage) {
    homepage = await Homepage.create({ sections: DEFAULT_SECTIONS });
  }
  const sections = normalizeSections(homepage.sections);
  const heroSection = sections.find((s) => s.key === 'hero');
  console.log('[Homepage GET] heroImages:', heroSection?.data?.heroImages?.map((s) => s.imageUrl));
  res.status(200).json({ success: true, sections });
});

const updateHomepage = asyncHandler(async (req, res) => {
  const { sections } = req.body;

  if (!sections || !Array.isArray(sections)) {
    const err = new Error('sections array is required');
    err.statusCode = 400;
    throw err;
  }

  const incomingHero =
    sections.find((s) => s.key === 'hero')?.data?.heroImages?.map((s) => s.imageUrl) ?? [];
  console.log('[Homepage PUT] incoming heroImages:', incomingHero);

  const normalizedSections = normalizeSections(sections);

  let homepage = await Homepage.findOne();
  if (!homepage) {
    homepage = await Homepage.create({ sections: DEFAULT_SECTIONS });
  }

  homepage.sections = normalizedSections;
  await homepage.save();

  const heroSection = normalizedSections.find((s) => s.key === 'hero');
  console.log(
    '[Homepage PUT] saved heroImages:',
    heroSection?.data?.heroImages?.map((s) => s.imageUrl)
  );

  res.status(200).json({
    success: true,
    message: 'Homepage updated',
    sections: normalizedSections,
  });
});

module.exports = { getHomepage, updateHomepage, DEFAULT_SECTIONS, normalizeSections, normalizeHeroImages };
