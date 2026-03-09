const flightStatsService = require('./flightStatsService');

const PLACEHOLDER_FLIGHTS = ['XX000', 'TBD', 'N/A', ''];

const FLIGHTSTATS_STATUS_MAP = {
  L: 'landed',
  D: 'departed',
  A: 'enroute',
  S: 'on_time',
  C: 'cancelled',
  N: 'cancelled',
  R: 'delayed',
  U: 'on_time'
};

/**
 * Check if flight number looks like a real one (not placeholder)
 */
function isRealFlightNumber(fn) {
  if (!fn || typeof fn !== 'string') return false;
  const s = fn.trim().toUpperCase();
  if (PLACEHOLDER_FLIGHTS.includes(s)) return false;
  if (s.length < 4) return false; // e.g. EK506, QR557
  return true;
}

/**
 * Map FlightStats response to transfer flight_details format
 * @param {Object} fs - normalized FlightStats data
 * @param {Object} [opts] - options
 * @param {boolean} [opts.keepTimesFromInput] - when true (e.g. route from fallback date), use times from input instead of API
 */
function mapFlightStatsToTransfer(fs, opts = {}) {
  if (!fs) return null;
  const { keepTimesFromInput } = opts;
  const depTime = !keepTimesFromInput && fs.departureTime ? new Date(fs.departureTime) : null;
  const arrTime = !keepTimesFromInput && fs.arrivalTime ? new Date(fs.arrivalTime) : null;
  const status = FLIGHTSTATS_STATUS_MAP[fs.statusCode] || (fs.isCanceled ? 'cancelled' : fs.isLanded ? 'landed' : 'on_time');
  return {
    flight_no: (fs.flight || '').toUpperCase(),
    airline: fs.airlineName || 'TBD',
    departure_airport: (fs.departureAirport || 'TBD').toString().toUpperCase().slice(0, 3),
    arrival_airport: (fs.arrivalAirport || 'TBD').toString().toUpperCase().slice(0, 3),
    departure_time: depTime,
    arrival_time: arrTime,
    departure_airport_name: fs.departureAirportName || null,
    arrival_airport_name: fs.arrivalAirportName || null,
    terminal: fs.terminal || null,
    gate: fs.gate || null,
    status,
    api_verified: true,
    last_checked: new Date(),
    route_from_fallback_date: fs.routeFromFallbackDate || false
  };
}

/**
 * Enrich flight_details using FlightStats (https://www.flightstats.com/v2/flight-tracker).
 * Merges enriched data into existing flight_details. Stores airline, airports, times, terminal, gate for later use.
 *
 * @param {Object} flightDetails - Existing flight_details (must have flight_no)
 * @param {Date|string} [flightDate] - Optional date for API (default: arrival_time or departure_time)
 * @returns {Promise<Object|null>} Merged flight_details or null if no enrichment
 */
async function enrichFlightDetails(flightDetails, flightDate) {
  if (!flightDetails?.flight_no || !isRealFlightNumber(flightDetails.flight_no)) {
    return null;
  }

  const fd = flightDate || flightDetails.arrival_time || flightDetails.departure_time;
  let enriched = null;

  const dateForLog = fd ? (typeof fd === 'string' ? fd.slice(0, 10) : new Date(fd).toISOString().slice(0, 10)) : 'N/A';

  try {
    const fsData = await flightStatsService.getFlightData(flightDetails.flight_no, fd, { fallbackToToday: true });
    if (fsData) {
      enriched = mapFlightStatsToTransfer(fsData, {
        keepTimesFromInput: fsData.routeFromFallbackDate
      });
      if (enriched) {
        const suffix = enriched.route_from_fallback_date ? ' (route from fallback date)' : '';
        console.log(`[FlightEnrichment] ✓ ${flightDetails.flight_no} (${dateForLog}): ${enriched.departure_airport}→${enriched.arrival_airport} ${enriched.airline}${suffix}`);
      }
    }
  } catch (e) {
    console.warn(`[FlightEnrichment] ✗ ${flightDetails.flight_no} (${dateForLog}): ${e.message} – using TBD`);
  }

  if (!enriched) return null;

  const depAirport = (enriched.departure_airport || flightDetails.departure_airport || 'TBD').toString().toUpperCase().slice(0, 3);
  const arrAirport = (enriched.arrival_airport || flightDetails.arrival_airport || 'TBD').toString().toUpperCase().slice(0, 3);
  return {
    ...flightDetails,
    airline: enriched.airline || flightDetails.airline || 'TBD',
    departure_airport: depAirport,
    arrival_airport: arrAirport,
    departure_airport_name: enriched.departure_airport_name || null,
    arrival_airport_name: enriched.arrival_airport_name || null,
    departure_time: enriched.departure_time || flightDetails.departure_time,
    arrival_time: enriched.arrival_time || flightDetails.arrival_time,
    terminal: enriched.terminal || flightDetails.terminal,
    gate: enriched.gate || flightDetails.gate,
    status: enriched.status || flightDetails.status || 'on_time',
    api_verified: true,
    last_checked: new Date()
  };
}

/**
 * Format airport for pickup/drop location display
 * @param {string} iata - e.g. BOM, DEL
 * @param {string} [airportName] - optional full name
 */
function formatAirportLocation(iata, airportName) {
  if (!iata || iata === 'TBD') return null;
  if (airportName && airportName.trim()) {
    return `${airportName.trim()} (${iata})`;
  }
  return `${iata} Airport`;
}

module.exports = { enrichFlightDetails, formatAirportLocation };
