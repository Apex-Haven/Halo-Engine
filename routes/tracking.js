const express = require('express');
const router = express.Router();

// Import controllers
const {
  getTransferForTracking,
  updateDriverLocation,
  getTrackingHistory
} = require('../controllers/trackingController');

// Import validation middleware
const { validateApexId } = require('../middleware/validation');

// Import authentication middleware
const { optionalAuth } = require('../middleware/auth');

/**
 * @route   GET /api/tracking/:id
 * @desc    Get transfer details for tracking (public access)
 * @access  Public (no authentication required for tracking)
 */
router.get('/:id', validateApexId, getTransferForTracking);

/**
 * @route   PUT /api/tracking/:id/location
 * @desc    Update driver location (for drivers)
 * @access  Private (Driver, Admin, Operations Manager)
 */
router.put('/:id/location', optionalAuth, validateApexId, updateDriverLocation);

/**
 * @route   GET /api/tracking/:id/history
 * @desc    Get tracking history for a transfer
 * @access  Public (no authentication required for tracking)
 */
router.get('/:id/history', validateApexId, getTrackingHistory);

module.exports = router;
