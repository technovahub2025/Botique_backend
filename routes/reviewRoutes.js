const express = require('express');
const { getReviews, updateReview, deleteReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');

const router = express.Router();

router.use(protect, admin);

router.get('/', getReviews);
router.put('/:id', updateReview);
router.delete('/:id', deleteReview);

module.exports = router;
