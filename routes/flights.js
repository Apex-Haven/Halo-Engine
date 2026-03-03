const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Transfer = require('../models/Transfer');
const aviationstackService = require('../services/aviationstackService');

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
 * @route   POST /api/flights/verify
 * @desc    Manually verify flight for a transfer (enrich from Aviationstack)
 * @access  Private (SUPER_ADMIN, ADMIN, OPERATIONS_MANAGER)
 */
router.post('/verify', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'), async (req, res) => {
  try {
    const { transfer_id, flight_number, flight_date } = req.body;
    const fn = flight_number || (transfer_id && (await Transfer.findById(transfer_id))?.flight_details?.flight_no);
    const fd = flight_date || (transfer_id && (await Transfer.findById(transfer_id))?.flight_details?.arrival_time);

    if (!fn) {
      return res.status(400).json({ success: false, message: 'flight_number or transfer_id with flight required' });
    }

    const enriched = await aviationstackService.fetchFlightWithCache(fn, fd || new Date());
    if (!enriched) {
      return res.status(404).json({ success: false, message: 'Flight data not found' });
    }

    if (transfer_id) {
      const transfer = await Transfer.findById(transfer_id);
      if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
      const fd2 = transfer.flight_details;
      if (!fd2) return res.status(400).json({ success: false, message: 'Transfer has no flight details' });
      Object.assign(fd2, {
        airline: enriched.airline,
        departure_airport: enriched.departure_airport,
        arrival_airport: enriched.arrival_airport,
        departure_time: enriched.departure_time || fd2.departure_time,
        arrival_time: enriched.arrival_time || fd2.arrival_time,
        terminal: enriched.terminal || fd2.terminal,
        gate: enriched.gate || fd2.gate,
        status: enriched.status || fd2.status,
        api_verified: true,
        last_checked: new Date()
      });
      await transfer.save();
    }

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('Flight verify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

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
