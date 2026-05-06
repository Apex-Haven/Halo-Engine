const flightStatsService = require('./flightStatsService');

const PLACEHOLDER_FLIGHTS = ['XX000', 'TBD', 'N/A', ''];

/** IATA airline code → airline name (fallback when FlightStats/API returns TBD) */
const AIRLINE_BY_CODE = {
  EY: 'Etihad Airways',
  SQ: 'Singapore Airlines',
  MH: 'Malaysia Airlines',
  EK: 'Emirates',
  TK: 'Turkish Airlines',
  BR: 'EVA Air',
  BA: 'British Airways',
  CX: 'Cathay Pacific',
  NH: 'All Nippon Airways',
  UA: 'United Airlines',
  QR: 'Qatar Airways',
  AI: 'Air India',
  LH: 'Lufthansa',
  AF: 'Air France',
  KL: 'KLM',
  QF: 'Qantas',
  TG: 'Thai Airways',
  CZ: 'China Southern',
  CA: 'Air China',
  MU: 'China Eastern',
};

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
 * Get airline name from flight number using hardcoded IATA code mapping
 * @param {string} flightNo - e.g. EK344, MH 195, UA 7905
 * @returns {string|null} Airline name or null if unknown
 */
function getAirlineFromFlightNumber(flightNo) {
  if (!flightNo || typeof flightNo !== 'string') return null;
  const normalized = flightNo.replace(/\s/g, '').trim().toUpperCase();
  const match = normalized.match(/^([A-Z0-9]{2})\d/);
  if (!match) return null;
  return AIRLINE_BY_CODE[match[1]] || null;
}

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
  // Departure at origin: always take from FlightStats when present — distinct per flight.
  // Arrival: when keepTimesFromInput (e.g. route from "today" fallback for a far future date),
  // keep sheet/API input arrival on the merge step, not the tracker sample day.
  const depTime = fs.departureTime ? new Date(fs.departureTime) : null;
  const arrTime = keepTimesFromInput
    ? null
    : (fs.arrivalTime ? new Date(fs.arrivalTime) : null);
  const status = FLIGHTSTATS_STATUS_MAP[fs.statusCode] || (fs.isCanceled ? 'cancelled' : fs.isLanded ? 'landed' : 'on_time');
  const airlineFromMap = getAirlineFromFlightNumber(fs.flight);
  return {
    flight_no: (fs.flight || '').toUpperCase(),
    airline: fs.airlineName || airlineFromMap || 'TBD',
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
 * @param {Object} [opts]
 * @param {boolean} [opts.keepSheetTimes] - When true, FlightStats NEVER overwrites arrival_time or
 *   departure_time that were already set from the sheet. Only metadata (airline, airports, terminal,
 *   gate, status) is taken from the API. Use this for all sheet-sync paths so the operator-entered
 *   times are always authoritative.
 * @returns {Promise<Object|null>} Merged flight_details or null if no enrichment
 */
async function enrichFlightDetails(flightDetails, flightDate, opts = {}) {
  if (!flightDetails?.flight_no || !isRealFlightNumber(flightDetails.flight_no)) {
    return null;
  }

  const { keepSheetTimes = false } = opts;
  const fd = flightDate || flightDetails.arrival_time || flightDetails.departure_time;
  let enriched = null;

  const dateForLog = fd ? (typeof fd === 'string' ? fd.slice(0, 10) : new Date(fd).toISOString().slice(0, 10)) : 'N/A';

  try {
    const fsData = await flightStatsService.getFlightData(flightDetails.flight_no, fd, { fallbackToToday: true });
    if (fsData) {
      enriched = mapFlightStatsToTransfer(fsData, {
        // keepTimesFromInput already suppresses arrival_time when routeFromFallbackDate;
        // keepSheetTimes is a stronger override that also suppresses departure_time.
        keepTimesFromInput: fsData.routeFromFallbackDate || keepSheetTimes
      });
      if (enriched) {
        const suffix = enriched.route_from_fallback_date ? ' (route from fallback date)' : (keepSheetTimes ? ' (sheet times kept)' : '');
        console.log(`[FlightEnrichment] ✓ ${flightDetails.flight_no} (${dateForLog}): ${enriched.departure_airport}→${enriched.arrival_airport} ${enriched.airline}${suffix}`);
      }
    }
  } catch (e) {
    console.warn(`[FlightEnrichment] ✗ ${flightDetails.flight_no} (${dateForLog}): ${e.message} – using fallback airline`);
  }

  const fallbackAirline = getAirlineFromFlightNumber(flightDetails.flight_no);
  if (!enriched) {
    if (fallbackAirline) {
      return {
        ...flightDetails,
        airline: fallbackAirline,
        departure_airport: (flightDetails.departure_airport || 'TBD').toString().toUpperCase().slice(0, 3),
        arrival_airport: (flightDetails.arrival_airport || 'TBD').toString().toUpperCase().slice(0, 3),
      };
    }
    return null;
  }

  const depAirport = (enriched.departure_airport || flightDetails.departure_airport || 'TBD').toString().toUpperCase().slice(0, 3);
  const arrAirport = (enriched.arrival_airport || flightDetails.arrival_airport || 'TBD').toString().toUpperCase().slice(0, 3);
  const resolvedAirline = (enriched.airline && enriched.airline !== 'TBD') ? enriched.airline : (fallbackAirline || flightDetails.airline || 'TBD');

  // When keepSheetTimes is set, sheet-provided times are authoritative — never let FlightStats
  // overwrite them. FlightStats still supplies the origin departure_time for the onward leg
  // (not available in the sheet), but we only take it when the sheet didn't already have one.
  const resolvedArrivalTime = keepSheetTimes
    ? flightDetails.arrival_time   // always keep sheet value
    : (enriched.arrival_time != null ? enriched.arrival_time : flightDetails.arrival_time);
  const resolvedDepartureTime = keepSheetTimes
    ? (flightDetails.departure_time != null
        ? flightDetails.departure_time          // sheet had a dep time → keep it
        : enriched.departure_time)              // sheet had no dep time → take from API (onward origin dep)
    : (enriched.departure_time != null ? enriched.departure_time : flightDetails.departure_time);

  return {
    ...flightDetails,
    airline: resolvedAirline,
    departure_airport: depAirport,
    arrival_airport: arrAirport,
    departure_airport_name: enriched.departure_airport_name || null,
    arrival_airport_name: enriched.arrival_airport_name || null,
    departure_time: resolvedDepartureTime,
    arrival_time: resolvedArrivalTime,
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

/**
 * Keep transfer pickup times aligned with flight schedules (mutates plain objects or Mongoose subdocs).
 * Inbound: meet guest when the flight lands → estimated_pickup_time = flight_details.arrival_time.
 * Return leg: hotel pickup for airport run → estimated_pickup_time = return_flight_details.departure_time.
 */
function syncEstimatedPickupTimesFromFlights(transferDetails, flightDetails, returnTransferDetails, returnFlightDetails) {
  if (transferDetails && flightDetails?.arrival_time) {
    transferDetails.estimated_pickup_time = flightDetails.arrival_time;
  }
  if (returnTransferDetails && returnFlightDetails?.departure_time) {
    returnTransferDetails.estimated_pickup_time = returnFlightDetails.departure_time;
  }
}

module.exports = { enrichFlightDetails, formatAirportLocation, syncEstimatedPickupTimesFromFlights };
