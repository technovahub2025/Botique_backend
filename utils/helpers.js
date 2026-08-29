const slugify = (str) => {
  return str
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const formatPrice = (price) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
};

const generateOrderNumber = () => {
  const prefix = process.env.ORDER_PREFIX || 'LL';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

const calculateTax = (amount, rate = 0.05) => {
  const tax = amount * rate;
  return Math.round(tax * 100) / 100;
};

const calculateShipping = (subtotal, method = 'standard') => {
  if (subtotal >= 10000) return 0;
  return method === 'express' ? 500 : 200;
};

const paginate = (query, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  return {
    ...query,
    skip,
    limit: Number(limit),
  };
};

module.exports = {
  slugify,
  formatPrice,
  generateOrderNumber,
  calculateTax,
  calculateShipping,
  paginate,
};
