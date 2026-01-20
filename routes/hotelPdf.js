const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { extractHotelImages, proxyImage, healthCheck } = require('../controllers/hotelPdfController');
const { createRateLimiterWithWhitelist } = require('../middleware/rateLimiter');

// Rate limiter for image extraction (more lenient for internal tool)
const imageExtractionLimiter = createRateLimiterWithWhitelist({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: 'Too many image extraction requests. Please try again later.'
});

// Health check (public)
router.get('/health', healthCheck);

// Proxy image to avoid CORS (protected - SUPER_ADMIN and ADMIN only)
// Note: We need to handle OPTIONS for CORS preflight
router.options('/proxy-image', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

router.get(
  '/proxy-image',
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  proxyImage
);

// Extract images from booking links (protected - SUPER_ADMIN and ADMIN only)
router.post(
  '/extract-images',
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  imageExtractionLimiter,
  extractHotelImages
);

module.exports = router;

