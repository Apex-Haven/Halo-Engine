const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Transfer = require('../models/Transfer');
const flightStatsService = require('../services/flightStatsService');
const { enrichFlightDetails } = require('../services/flightEnrichmentHelper');

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
 * @desc    Manually verify flight for a transfer (enrich from FlightStats)
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

    const placeholder = { flight_no: fn, airline: 'TBD', departure_airport: 'TBD', arrival_airport: 'TBD', departure_time: fd, arrival_time: fd };
    const enriched = await enrichFlightDetails(placeholder, fd || new Date());
    if (!enriched) {
      return res.status(404).json({ success: false, message: 'Flight data not found (FlightStats may not have data for this date or airline)' });
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
    console.error('[FlightVerify] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   GET /api/flights/global-search
 * @desc    Global flight search via FlightStats (flight number + date)
 * @access  Private
 */
router.get('/global-search', authenticate, async (req, res) => {
  try {
    const { flight, date } = req.query;
    console.log('[GlobalFlightSearch] Request:', { flight, date });

    if (!flight || !flight.trim()) {
      return res.status(400).json({ success: false, message: 'flight number is required' });
    }

    const searchDate = date || new Date().toISOString().slice(0, 10);
    console.log('[GlobalFlightSearch] Calling getFlightData:', { flight: flight.trim(), searchDate });

    const data = await flightStatsService.getFlightData(flight.trim(), searchDate);

    if (!data) {
      console.log('[GlobalFlightSearch] No data returned for', flight.trim(), searchDate);
      return res.status(404).json({
        success: false,
        message: 'Flight not found for this date. Try a date closer to today.'
      });
    }

    console.log('[GlobalFlightSearch] Success:', data.flight, data.departureAirport, '->', data.arrivalAirport);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[GlobalFlightSearch] Error:', err.message, err.stack);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch flight data'
    });
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
