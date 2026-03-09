/**
 * FlightStats Web API Service
 * Fetches flight route and schedule from FlightStats flight tracker (no API key required)
 * API: https://www.flightstats.com/v2/api-next/flight-tracker/:carrierCode/:number/:year/:month/:day
 */

const axios = require('axios');
const FlightStatsCache = require('../models/FlightStatsCache');

const BASE_URL = 'https://www.flightstats.com/v2/api-next/flight-tracker';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Parse flightCallSign into airlineCode and flightNumber
 * IATA airline codes are 2 characters (e.g. AI, EK, 6E)
 * Examples: AI602 -> { airlineCode: 'AI', flightNumber: '602' }
 *           EK512 -> { airlineCode: 'EK', flightNumber: '512' }
 *           6E528 -> { airlineCode: '6E', flightNumber: '528' }
 */
function parseFlightCallSign(flightCallSign) {
  if (!flightCallSign || typeof flightCallSign !== 'string') {
    return null;
  }
  const normalized = flightCallSign.replace(/\s/g, '').trim().toUpperCase();
  // IATA airline code = exactly 2 chars; rest = flight number
  const match = normalized.match(/^([A-Z0-9]{2})(\d{1,5})$/);
  if (!match) {
    return null;
  }
  return {
    airlineCode: match[1],
    flightNumber: match[2]
  };
}

/**
 * Extract year, month, date - handles sheet formats (7/5/2026, 15/05/2026, ISO)
 */
function extractDateParts(date) {
  if (typeof date === 'string') {
    const s = date.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [year, month, day] = s.split('T')[0].split('-').map(Number);
      if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, date: day };
      }
    }
    const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [, a, b, c] = slashMatch.map(Number);
      let year = c, month, day;
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        month = b;
        day = a;
      }
      if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, date: day };
      }
    }
  }
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    date: d.getDate()
  };
}

/**
 * Normalize FlightStats API response to standard format
 */
function normalizeResponse(rawData, flightCallSign, airlineCode, flightNumber) {
  if (!rawData?.data) return null;

  const d = rawData.data;
  const schedule = d.schedule || {};
  const status = d.status || {};
  const resultHeader = d.resultHeader || {};
  const depAirport = d.departureAirport || {};
  const arrAirport = d.arrivalAirport || {};
  const carrier = resultHeader.carrier || d.ticketHeader?.carrier || {};

  const departureTime = schedule.scheduledDeparture || schedule.estimatedActualDeparture || depAirport.date;
  const arrivalTime = schedule.scheduledArrival || schedule.estimatedActualArrival || arrAirport.date;

  return {
    flight: flightCallSign,
    airlineCode: airlineCode || carrier.fs,
    flightNumber: flightNumber || resultHeader.flightNumber,
    airlineName: carrier.name,
    departureAirport: resultHeader.departureAirportFS || depAirport.fs || depAirport.iata,
    departureAirportName: depAirport.name,
    departureCity: depAirport.city,
    arrivalAirport: resultHeader.arrivalAirportFS || arrAirport.fs || arrAirport.iata,
    arrivalAirportName: arrAirport.name,
    arrivalCity: arrAirport.city,
    departureTime: departureTime || null,
    arrivalTime: arrivalTime || null,
    status: status.status || resultHeader.status || 'Unknown',
    statusCode: status.statusCode,
    statusDescription: status.statusDescription || status.delayStatus?.wording,
    delayMinutes: status.delay?.arrival?.minutes ?? status.delay?.departure?.minutes ?? 0,
    terminal: arrAirport.terminal,
    gate: arrAirport.gate || depAirport.gate,
    baggage: arrAirport.baggage,
    equipment: d.additionalFlightInfo?.equipment?.name,
    flightDuration: d.additionalFlightInfo?.flightDuration,
    operatedBy: d.operatedBy,
    isLanded: d.isLanded,
    isCanceled: d.flightNote?.canceled
  };
}

/**
 * Fetch flight data from FlightStats API with retry
 */
async function fetchFromApi(airlineCode, flightNumber, year, month, day) {
  const url = `${BASE_URL}/${airlineCode}/${flightNumber}/${year}/${month}/${day}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.flightstats.com/v2/flight-tracker/'
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers,
        validateStatus: () => true
      });

      const data = response.data?.data;
      const hasMeaningfulData = data && typeof data === 'object' && Object.keys(data).length > 0;

      if (response.status === 200 && hasMeaningfulData) {
        return response.data;
      }
      if (response.status === 403 || response.status === 429) {
        console.warn(`[FlightStats] Blocked/rate-limited (${response.status}) for ${url}`);
        return null;
      }
      if (response.status === 404 || (response.data && !hasMeaningfulData)) {
        if (data && Object.keys(data).length === 0) {
          console.log(`[FlightStats] API returned empty data object for ${url} (e.g. IndiGo/6E may have limited coverage)`);
        }
        return null;
      }
      if (attempt === MAX_RETRIES) {
        console.warn(`[FlightStats] API returned ${response.status} for ${url}`);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.warn('[FlightStats] Request failed:', err.message);
        throw err;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  return null;
}

/**
 * Check if a date is within FlightStats tracking window (~3 days before/after today)
 */
function isDateInTrackingWindow(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (24 * 60 * 60 * 1000));
  return diffDays >= -3 && diffDays <= 3;
}

/**
 * Get flight data - uses cache if available and fresh
 * @param {string} flightCallSign - e.g. AI602, EK512, 6E528
 * @param {Date|string} date - flight date
 * @param {Object} [opts] - options
 * @param {boolean} [opts.fallbackToToday] - if true, when date is out of range, retry with today to get route (airports, airline). Regular flights have fixed routes.
 * @returns {Promise<object|null>} Normalized flight info or null. When from fallback, includes routeFromFallbackDate: true
 */
async function getFlightData(flightCallSign, date, opts = {}) {
  const { fallbackToToday = false } = opts;
  const parsed = parseFlightCallSign(flightCallSign);
  if (!parsed) {
    console.log('[FlightStats] Parse failed for:', flightCallSign);
    throw new Error(`Invalid flight call sign: ${flightCallSign}`);
  }

  const dateParts = extractDateParts(date);
  if (!dateParts) {
    console.log('[FlightStats] Date parse failed for:', date, typeof date);
    throw new Error(`Invalid date: ${date}`);
  }

  const { airlineCode, flightNumber } = parsed;
  const { year, month, date: day } = dateParts;
  console.log('[FlightStats] Parsed:', { airlineCode, flightNumber, year, month, day });

  // Check cache
  const cacheDate = new Date(year, month - 1, day);
  const cached = await FlightStatsCache.findOne({
    flight_number: `${airlineCode}${flightNumber}`,
    flight_date: cacheDate
  });

  if (cached && (Date.now() - cached.cached_at.getTime()) < CACHE_TTL_MS) {
    console.log('[FlightStats] Cache HIT:', `${airlineCode}${flightNumber}`, `${year}-${month}-${day}`);
    return cached.normalized_data;
  }
  console.log('[FlightStats] Cache MISS, fetching from API');

  // Fetch from API
  let rawData = await fetchFromApi(airlineCode, flightNumber, year, month, day);

  // Fallback: if date out of range and fallbackToToday, try today to get route (airports, airline)
  let routeFromFallbackDate = false;
  let todayParts = null;
  if (!rawData && fallbackToToday && !isDateInTrackingWindow(date)) {
    const today = new Date();
    todayParts = extractDateParts(today);
    if (todayParts) {
      const todayCacheDate = new Date(todayParts.year, todayParts.month - 1, todayParts.date);
      const cachedToday = await FlightStatsCache.findOne({
        flight_number: `${airlineCode}${flightNumber}`,
        flight_date: todayCacheDate
      });
      if (cachedToday && (Date.now() - cachedToday.cached_at.getTime()) < CACHE_TTL_MS) {
        console.log(`[FlightStats] Fallback cache HIT for ${flightCallSign} (route from today)`);
        const data = { ...cachedToday.normalized_data, routeFromFallbackDate: true };
        return data;
      }
      console.log(`[FlightStats] Date out of range, retrying with today (${todayParts.year}-${todayParts.month}-${todayParts.date}) for route info`);
      rawData = await fetchFromApi(airlineCode, flightNumber, todayParts.year, todayParts.month, todayParts.date);
      routeFromFallbackDate = !!rawData;
      if (routeFromFallbackDate) {
        console.log(`[FlightStats] Got route from fallback date for ${flightCallSign}`);
      }
    }
  }

  if (!rawData) {
    console.log('[FlightStats] API returned no data for', `${airlineCode}/${flightNumber}/${year}/${month}/${day}`);
    return null;
  }

  const normalized = normalizeResponse(
    rawData,
    `${airlineCode}${flightNumber}`,
    airlineCode,
    flightNumber
  );

  if (!normalized) {
    console.log('[FlightStats] normalizeResponse returned null - rawData.data may be malformed');
    return null;
  }

  if (routeFromFallbackDate) {
    normalized.routeFromFallbackDate = true;
  }

  // Save to cache (use requested date for cache key when not fallback; use today date-only when fallback)
  const cacheKeyDate = routeFromFallbackDate && todayParts
    ? new Date(todayParts.year, todayParts.month - 1, todayParts.date)
    : new Date(year, month - 1, day);
  await FlightStatsCache.findOneAndUpdate(
    {
      flight_number: `${airlineCode}${flightNumber}`,
      flight_date: cacheKeyDate
    },
    {
      $set: {
        normalized_data: normalized,
        cached_at: new Date()
      }
    },
    { upsert: true, new: true }
  );

  return normalized;
}

module.exports = {
  getFlightData,
  isDateInTrackingWindow,
  parseFlightCallSign,
  extractDateParts,
  normalizeResponse
};
