const axios = require('axios');

// Flight API configuration
const FLIGHT_API_CONFIG = {
  // Using AviationStack API as example (free tier available)
  baseURL: process.env.FLIGHT_API_BASE_URL || 'http://api.aviationstack.com/v1',
  apiKey: process.env.FLIGHT_API_KEY,
  timeout: 10000,
  
  // Alternative APIs (configure as needed)
  alternatives: {
    // FlightAware API
    flightAware: {
      baseURL: 'https://aeroapi.flightaware.com/aeroapi',
      apiKey: process.env.FLIGHTAWARE_API_KEY
    },
    // OpenSky Network (free, no API key required)
    openSky: {
      baseURL: 'https://opensky-network.org/api'
    }
  }
};

// Create axios instance for flight API
const flightApiClient = axios.create({
  baseURL: FLIGHT_API_CONFIG.baseURL,
  timeout: FLIGHT_API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add API key to requests if available
if (FLIGHT_API_CONFIG.apiKey) {
  flightApiClient.defaults.params = {
    access_key: FLIGHT_API_CONFIG.apiKey
  };
}

// Flight status mapping
const FLIGHT_STATUS_MAP = {
  'scheduled': 'on_time',
  'active': 'enroute',
  'landed': 'landed',
  'cancelled': 'cancelled',
  'incident': 'delayed',
  'diverted': 'delayed',
  'unknown': 'on_time'
};

// Get flight information by flight number
const getFlightByNumber = async (flightNumber, date = null) => {
  try {
    const params = {
      flight_iata: flightNumber.toUpperCase(),
      limit: 1
    };

    if (date) {
      params.flight_date = date;
    }

    const response = await flightApiClient.get('/flights', { params });
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      const flight = response.data.data[0];
      return formatFlightData(flight);
    }

    return null;
  } catch (error) {
    console.error(`❌ Error fetching flight ${flightNumber}:`, error.message);
    
    // Fallback to mock data for development
    if (process.env.NODE_ENV === 'development') {
      return getMockFlightData(flightNumber);
    }
    
    throw error;
  }
};

// Get flights by airport
const getFlightsByAirport = async (airportCode, type = 'arrival', date = null) => {
  try {
    const params = {
      [`${type}_iata`]: airportCode.toUpperCase(),
      limit: 100
    };

    if (date) {
      params.flight_date = date;
    }

    const response = await flightApiClient.get('/flights', { params });
    
    if (response.data && response.data.data) {
      return response.data.data.map(flight => formatFlightData(flight));
    }

    return [];
  } catch (error) {
    console.error(`❌ Error fetching flights for airport ${airportCode}:`, error.message);
    return [];
  }
};

// Format flight data to match our schema
const formatFlightData = (flight) => {
  const departure = flight.departure || {};
  const arrival = flight.arrival || {};
  const airline = flight.airline || {};
  const flightInfo = flight.flight || {};

  return {
    flight_no: flightInfo.iata || flightInfo.number,
    airline: airline.name || 'Unknown',
    departure_airport: departure.iata || departure.airport,
    arrival_airport: arrival.iata || arrival.airport,
    departure_time: departure.scheduled ? new Date(departure.scheduled) : null,
    arrival_time: arrival.scheduled ? new Date(arrival.scheduled) : null,
    actual_departure_time: departure.actual ? new Date(departure.actual) : null,
    actual_arrival_time: arrival.actual ? new Date(arrival.actual) : null,
    status: FLIGHT_STATUS_MAP[flight.flight_status] || 'on_time',
    delay_minutes: calculateDelay(departure.scheduled, departure.actual),
    gate: arrival.gate || null,
    terminal: arrival.terminal || null,
    baggage: arrival.baggage || null,
    last_updated: new Date()
  };
};

// Calculate delay in minutes
const calculateDelay = (scheduled, actual) => {
  if (!scheduled || !actual) return 0;
  
  const scheduledTime = new Date(scheduled);
  const actualTime = new Date(actual);
  
  return Math.max(0, Math.floor((actualTime - scheduledTime) / (1000 * 60)));
};

// Mock flight data for development/testing
const getMockFlightData = (flightNumber) => {
  const mockFlights = {
    'AI202': {
      flight_no: 'AI202',
      airline: 'Air India',
      departure_airport: 'DXB',
      arrival_airport: 'BOM',
      departure_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      arrival_time: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours from now
      status: 'on_time',
      delay_minutes: 0,
      gate: 'A12',
      terminal: 'T2',
      last_updated: new Date()
    },
    'EK501': {
      flight_no: 'EK501',
      airline: 'Emirates',
      departure_airport: 'DXB',
      arrival_airport: 'BOM',
      departure_time: new Date(Date.now() + 1 * 60 * 60 * 1000),
      arrival_time: new Date(Date.now() + 5 * 60 * 60 * 1000),
      status: 'delayed',
      delay_minutes: 45,
      gate: 'B8',
      terminal: 'T2',
      last_updated: new Date()
    }
  };

  return mockFlights[flightNumber.toUpperCase()] || {
    flight_no: flightNumber.toUpperCase(),
    airline: 'Mock Airline',
    departure_airport: 'XXX',
    arrival_airport: 'YYY',
    departure_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
    arrival_time: new Date(Date.now() + 6 * 60 * 60 * 1000),
    status: 'on_time',
    delay_minutes: 0,
    gate: null,
    terminal: null,
    last_updated: new Date()
  };
};

// Check if flight API is available
const isFlightApiAvailable = () => {
  return !!(FLIGHT_API_CONFIG.apiKey || process.env.NODE_ENV === 'development');
};

// Get flight status with retry logic
const getFlightStatusWithRetry = async (flightNumber, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const flightData = await getFlightByNumber(flightNumber);
      if (flightData) {
        return flightData;
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed for flight ${flightNumber}:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  return null;
};

// Batch update multiple flights
const batchUpdateFlights = async (flightNumbers) => {
  const results = [];
  
  for (const flightNumber of flightNumbers) {
    try {
      const flightData = await getFlightByNumber(flightNumber);
      results.push({
        flightNumber,
        success: true,
        data: flightData
      });
    } catch (error) {
      results.push({
        flightNumber,
        success: false,
        error: error.message
      });
    }
    
    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
};

module.exports = {
  flightApiClient,
  FLIGHT_API_CONFIG,
  getFlightByNumber,
  getFlightsByAirport,
  formatFlightData,
  calculateDelay,
  getMockFlightData,
  isFlightApiAvailable,
  getFlightStatusWithRetry,
  batchUpdateFlights,
  FLIGHT_STATUS_MAP
};
