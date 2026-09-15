const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const newsletterSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const NewsletterSubscriber =
  mongoose.models.NewsletterSubscriber ||
  mongoose.model('NewsletterSubscriber', newsletterSchema);

// Subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your email address.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }

    const existingSubscriber =
      await NewsletterSubscriber.findOne({ email });

    if (existingSubscriber) {
      return res.status(409).json({
        success: false,
        message: 'This email is already subscribed.',
      });
    }

    await NewsletterSubscriber.create({ email });

    return res.status(201).json({
      success: true,
      message: 'Subscribed successfully!',
    });
  } catch (error) {
    console.error('[Newsletter] Subscribe error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email is already subscribed.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Unable to subscribe. Please try again later.',
    });
  }
});

// Get subscribers
router.get('/subscribers', async (req, res) => {
  try {
    const subscribers = await NewsletterSubscriber.find()
      .sort({ createdAt: -1 })
      .select('email createdAt');

    return res.status(200).json({
      success: true,
      count: subscribers.length,
      subscribers,
    });
  } catch (error) {
    console.error('[Newsletter] Get subscribers error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load subscribers.',
    });
  }
});

module.exports = router;