const flightTrackingService = require('../services/flightTrackingService');

const getFlightInfo = async (req, res) => {
  try {
    const { flightNumber } = req.params;
    
    if (!flightNumber) {
      return res.status(400).json({
        success: false,
        message: 'Flight number is required'
      });
    }

    console.log(`🔍 Fetching flight info for: ${flightNumber}`);
    
    const flightInfo = await flightTrackingService.getFlightInfo(flightNumber);
    
    res.json({
      success: true,
      data: flightInfo,
      message: 'Flight information retrieved successfully'
    });
  } catch (error) {
    console.error('Flight tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flight information',
      error: error.message
    });
  }
};

const getAirportInfo = async (req, res) => {
  try {
    const { iataCode } = req.params;
    
    if (!iataCode) {
      return res.status(400).json({
        success: false,
        message: 'IATA code is required'
      });
    }

    console.log(`🏢 Fetching airport info for: ${iataCode}`);
    
    const airportInfo = await flightTrackingService.getAirportInfo(iataCode);
    
    res.json({
      success: true,
      data: airportInfo,
      message: 'Airport information retrieved successfully'
    });
  } catch (error) {
    console.error('Airport info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch airport information',
      error: error.message
    });
  }
};

const getFlightStatus = async (req, res) => {
  try {
    const { flightNumber } = req.params;
    
    if (!flightNumber) {
      return res.status(400).json({
        success: false,
        message: 'Flight number is required'
      });
    }

    console.log(`✈️ Checking flight status for: ${flightNumber}`);
    
    const flightInfo = await flightTrackingService.getFlightInfo(flightNumber);
    
    // Extract status information
    const statusInfo = {
      flightNumber: flightInfo.flightNumber,
      status: flightInfo.status,
      departure: {
        scheduled: flightInfo.departure.scheduled,
        actual: flightInfo.departure.actual,
        delay: flightInfo.departure.delay,
        airport: flightInfo.departure.airport,
        terminal: flightInfo.departure.terminal,
        gate: flightInfo.departure.gate
      },
      arrival: {
        scheduled: flightInfo.arrival.scheduled,
        actual: flightInfo.arrival.actual,
        delay: flightInfo.arrival.delay,
        airport: flightInfo.arrival.airport,
        terminal: flightInfo.arrival.terminal,
        gate: flightInfo.arrival.gate
      },
      live: flightInfo.live,
      source: flightInfo.source
    };
    
    res.json({
      success: true,
      data: statusInfo,
      message: 'Flight status retrieved successfully'
    });
  } catch (error) {
    console.error('Flight status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flight status',
      error: error.message
    });
  }
};

const searchFlights = async (req, res) => {
  try {
    const { query, type = 'flight' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    console.log(`🔍 Searching flights with query: ${query}`);
    
    // For now, we'll search by flight number
    // In a real implementation, you might search by route, airline, etc.
    const flightInfo = await flightTrackingService.getFlightInfo(query);
    
    res.json({
      success: true,
      data: [flightInfo], // Return as array for consistency
      message: 'Flight search completed successfully'
    });
  } catch (error) {
    console.error('Flight search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search flights',
      error: error.message
    });
  }
};

const getFlightsByRegion = async (req, res) => {
  try {
    const { lamin, lomin, lamax, lomax } = req.query;
    
    // Default to India bounding box if not provided
    const minLat = parseFloat(lamin) || 8;
    const minLon = parseFloat(lomin) || 68;
    const maxLat = parseFloat(lamax) || 37;
    const maxLon = parseFloat(lomax) || 97;

    console.log(`🌍 Fetching flights in region: ${minLat}, ${minLon} to ${maxLat}, ${maxLon}`);
    
    const flights = await flightTrackingService.getFlightsByRegion(minLat, minLon, maxLat, maxLon);
    
    res.json({
      success: true,
      data: flights,
      count: flights.length,
      message: `Found ${flights.length} active flights in region`
    });
  } catch (error) {
    console.error('Region flights error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flights by region',
      error: error.message
    });
  }
};

module.exports = {
  getFlightInfo,
  getAirportInfo,
  getFlightStatus,
  searchFlights,
  getFlightsByRegion
};
