const express = require('express');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.use(protect, admin);

router.post(
  '/',
  upload.single('image'),
  asyncHandler((req, res) => {
    if (!req.file) {
      const error = new Error('No image uploaded');
      error.statusCode = 400;
      throw error;
    }
    const base = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${base}/uploads/${req.file.filename}`;
    res.status(201).json({ success: true, url, filename: req.file.filename });
  })
);

module.exports = router;
