const express = require('express');
const router = express.Router();
const flightTrackingController = require('../controllers/flightTrackingController');
const { optionalAuth } = require('../middleware/auth');

// Get flight information by flight number
router.get('/flight/:flightNumber', optionalAuth, flightTrackingController.getFlightInfo);

// Get flight status (simplified version)
router.get('/status/:flightNumber', optionalAuth, flightTrackingController.getFlightStatus);

// Get airport information by IATA code
router.get('/airport/:iataCode', optionalAuth, flightTrackingController.getAirportInfo);

// Search flights
router.get('/search', optionalAuth, flightTrackingController.searchFlights);

module.exports = router;
