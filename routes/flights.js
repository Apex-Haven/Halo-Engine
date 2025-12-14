const express = require('express');
const router = express.Router();

// Import controllers
const {
  getFlightStatus,
  updateTransferFlightStatus,
  syncFlightStatus,
  batchSyncFlights,
  getFlightsRequiringAttention
} = require('../controllers/flightController');

// Import validation middleware
const {
  validateFlightNumber,
  validateApexId,
  validateFlightStatusUpdate,
  validateQueryParams
} = require('../middleware/validation');

/**
 * @route   GET /api/flights/:flight_no
 * @desc    Get real-time flight status by flight number
 * @access  Public (should be protected in production)
 */
router.get('/:flight_no', validateFlightNumber, getFlightStatus);

/**
 * @route   GET /api/flights/attention/required
 * @desc    Get flights requiring attention
 * @access  Public (should be protected in production)
 */
router.get('/attention/required', validateQueryParams, getFlightsRequiringAttention);

/**
 * @route   PUT /api/flights/transfers/:id/status
 * @desc    Update flight status for a specific transfer
 * @access  Public (should be protected in production)
 */
router.put('/transfers/:id/status', validateApexId, validateFlightStatusUpdate, updateTransferFlightStatus);

/**
 * @route   POST /api/flights/transfers/:id/sync
 * @desc    Sync flight status from external API for a specific transfer
 * @access  Public (should be protected in production)
 */
router.post('/transfers/:id/sync', validateApexId, syncFlightStatus);

/**
 * @route   POST /api/flights/batch/sync
 * @desc    Batch sync multiple flights
 * @access  Public (should be protected in production)
 */
router.post('/batch/sync', batchSyncFlights);

module.exports = router;
