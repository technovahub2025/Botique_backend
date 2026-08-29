const express = require('express');
const { getCustomers, getCustomerById } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');

const router = express.Router();

router.use(protect, admin);

router.get('/', getCustomers);
router.get('/:id', getCustomerById);

module.exports = router;
