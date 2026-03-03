const axios = require('axios');
const SystemSettings = require('../models/SystemSettings');
const FlightCache = require('../models/FlightCache');

const STATUS_MAP = {
  scheduled: 'on_time',
  active: 'enroute',
  landed: 'landed',
  cancelled: 'cancelled',
  incident: 'delayed',
  diverted: 'delayed',
  unknown: 'on_time'
};

/**
 * Aviationstack flight fetch service with caching.
 * API key is read from SystemSettings (DB) or env fallback.
 * Never expose API key to frontend.
 */
class AviationstackService {
  constructor() {
    this.baseUrl = 'http://api.aviationstack.com/v1';
    this._apiKey = null;
    this._settingsLoaded = false;
  }

  async getApiKey() {
    if (this._settingsLoaded && this._apiKey !== undefined) {
      return this._apiKey || process.env.AVIATIONSTACK_API_KEY || '';
    }
    try {
      const settings = await SystemSettings.getSettings();
      this._apiKey = settings?.aviationstack_api_key || process.env.AVIATIONSTACK_API_KEY || '';
      this._settingsLoaded = true;
      return this._apiKey;
    } catch (err) {
      console.error('Aviationstack: failed to load settings', err.message);
      this._apiKey = process.env.AVIATIONSTACK_API_KEY || '';
      this._settingsLoaded = true;
      return this._apiKey;
    }
  }

  invalidateSettingsCache() {
    this._settingsLoaded = false;
    this._apiKey = null;
  }

  /**
   * Get cache key: flight_number + date (YYYY-MM-DD)
   */
  _cacheKey(flightNumber, flightDate) {
    const d = flightDate ? new Date(flightDate) : new Date();
    const dateStr = d.toISOString().slice(0, 10);
    return `${String(flightNumber || '').toUpperCase().trim()}_${dateStr}`;
  }

  /**
   * Check cache first, then call API. Save to cache on success.
   * @param {string} flightNumber - e.g. EK506, QR557
   * @param {Date|string} flightDate - date of flight
   * @returns {Object|null} Enriched flight data or null
   */
  async fetchFlightWithCache(flightNumber, flightDate) {
    if (!flightNumber || String(flightNumber).trim() === '') return null;

    const fn = String(flightNumber).toUpperCase().trim();
    const fd = flightDate ? new Date(flightDate) : new Date();
    const dateStart = new Date(fd);
    dateStart.setHours(0, 0, 0, 0);

    // 1. Check cache (normalize by day)
    const cached = await FlightCache.findOne({
      flight_number: fn,
      flight_date: dateStart
    }).lean();

    if (cached) {
      return this._formatForTransfer(cached);
    }

    // 2. Call API
    const apiKey = await this.getApiKey();
    if (!apiKey || apiKey === 'your-aviationstack-api-key-here' || apiKey === 'your_api_key_here') {
      return null;
    }

    try {
      const flightDateStr = fd.toISOString().slice(0, 10);
      const response = await axios.get(`${this.baseUrl}/flights`, {
        params: {
          access_key: apiKey,
          flight_iata: fn,
          flight_date: flightDateStr,
          limit: 1
        },
        timeout: 10000
      });

      if (!response.data?.data?.length) return null;

      const raw = response.data.data[0];
      const dep = raw.departure || {};
      const arr = raw.arrival || {};
      const airline = raw.airline || {};
      const flightInfo = raw.flight || {};

      const data = {
        flight_number: (flightInfo.iata || flightInfo.number || fn).toUpperCase(),
        flight_date: fd,
        departure_airport: dep.iata || dep.airport || 'TBD',
        arrival_airport: arr.iata || arr.airport || 'TBD',
        scheduled_departure: dep.scheduled ? new Date(dep.scheduled) : null,
        scheduled_arrival: arr.scheduled ? new Date(arr.scheduled) : null,
        terminal: arr.terminal || dep.terminal || null,
        gate: arr.gate || dep.gate || null,
        airline: airline.name || 'TBD',
        status: STATUS_MAP[raw.flight_status] || 'on_time',
        cached_at: new Date()
      };

      // 3. Save to cache (use dateStart for consistent key)
      data.flight_date = dateStart;
      await FlightCache.findOneAndUpdate(
        { flight_number: fn, flight_date: dateStart },
        { $set: data },
        { upsert: true, new: true }
      ).catch(() => {});

      return this._formatForTransfer(data);
    } catch (err) {
      console.error(`Aviationstack fetch error for ${fn}:`, err.message);
      return null;
    }
  }

  _formatForTransfer(data) {
    return {
      flight_no: (data.flight_number || data.flight_no || '').toUpperCase(),
      airline: data.airline || 'TBD',
      departure_airport: (data.departure_airport || 'TBD').toUpperCase().slice(0, 3),
      arrival_airport: (data.arrival_airport || 'TBD').toUpperCase().slice(0, 3),
      departure_time: data.scheduled_departure || data.departure_time,
      arrival_time: data.scheduled_arrival || data.arrival_time,
      terminal: data.terminal || null,
      gate: data.gate || null,
      status: data.status || 'on_time',
      api_verified: true,
      last_checked: new Date()
    };
  }

  /**
   * Test API connection (for Admin Settings "Test" button)
   */
  async testConnection() {
    const apiKey = await this.getApiKey();
    if (!apiKey || apiKey === 'your-aviationstack-api-key-here' || apiKey === 'your_api_key_here') {
      return { success: false, message: 'API key not configured' };
    }
    try {
      const res = await axios.get(`${this.baseUrl}/flights`, {
        params: { access_key: apiKey, limit: 1 },
        timeout: 8000
      });
      if (res.data && (res.data.data !== undefined || res.data.error === undefined)) {
        return { success: true, message: 'Connection successful' };
      }
      return { success: false, message: res.data?.error?.message || 'Invalid response' };
    } catch (err) {
      return { success: false, message: err.response?.data?.error?.message || err.message };
    }
  }
}

module.exports = new AviationstackService();
