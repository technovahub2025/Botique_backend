const express = require('express');
const { getHomepage, updateHomepage } = require('../controllers/homepageController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/', getHomepage);
router.use(protect, admin);
router.put('/', updateHomepage);

module.exports = router;
