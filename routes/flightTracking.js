const express = require('express');
const router = express.Router();
const flightTrackingController = require('../controllers/flightTrackingController');
const { optionalAuth, authenticate } = require('../middleware/auth');

// Get flight information by flight number
router.get('/flight/:flightNumber', optionalAuth, flightTrackingController.getFlightInfo);

// Get flight status (simplified version)
router.get('/status/:flightNumber', optionalAuth, flightTrackingController.getFlightStatus);

// Get airport information by IATA code
router.get('/airport/:iataCode', optionalAuth, flightTrackingController.getAirportInfo);

// Search flights
router.get('/search', optionalAuth, flightTrackingController.searchFlights);

// Get API usage statistics (admin only) - TODO: Fix route loading issue
// router.get('/stats', authenticate, flightTrackingController.getUsageStats);

// Clear cache (admin only) - TODO: Fix route loading issue
// router.post('/cache/clear', authenticate, flightTrackingController.clearCache);

module.exports = router;
