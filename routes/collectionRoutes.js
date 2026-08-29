const express = require('express');
const {
  getCollections,
  getCollectionById,
  getCollectionBySlug,
  createCollection,
  updateCollection,
  deleteCollection,
} = require('../controllers/collectionController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/', getCollections);
router.get('/slug/:slug', getCollectionBySlug);
router.get('/:id', getCollectionById);

router.use(protect, admin);

router.post('/', createCollection);
router.put('/:id', updateCollection);
router.delete('/:id', deleteCollection);

module.exports = router;
