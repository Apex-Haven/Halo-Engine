const aviationstackService = require('./aviationstackService');

const PLACEHOLDER_FLIGHTS = ['XX000', 'TBD', 'N/A', ''];

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
 * Enrich flight_details using Aviationstack (cache + API).
 * Merges enriched data into existing flight_details. Does not overwrite required fields with null.
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
  const enriched = await aviationstackService.fetchFlightWithCache(flightDetails.flight_no, fd);
  if (!enriched) return null;

  return {
    ...flightDetails,
    airline: enriched.airline || flightDetails.airline || 'TBD',
    departure_airport: (enriched.departure_airport || flightDetails.departure_airport || 'TBD').toString().toUpperCase().slice(0, 3),
    arrival_airport: (enriched.arrival_airport || flightDetails.arrival_airport || 'TBD').toString().toUpperCase().slice(0, 3),
    departure_time: enriched.departure_time || flightDetails.departure_time,
    arrival_time: enriched.arrival_time || flightDetails.arrival_time,
    terminal: enriched.terminal || flightDetails.terminal,
    gate: enriched.gate || flightDetails.gate,
    status: enriched.status || flightDetails.status || 'on_time',
    api_verified: true,
    last_checked: new Date()
  };
}

module.exports = { enrichFlightDetails };
