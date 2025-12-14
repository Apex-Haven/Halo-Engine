const axios = require('axios');

/**
 * CozyCozy API Service
 * Integrates with CozyCozy API to get hotel results from multiple booking sites
 * CozyCozy aggregates results from Booking.com, Agoda, and other platforms
 */
class CozyCozyService {
  constructor() {
    this.baseUrl = process.env.COZYCOZY_API_URL || 'https://www.cozycozy.com/api';
    this.authToken = process.env.COZYCOZY_AUTH_TOKEN || null;
    this.rateLimitMs = parseInt(process.env.COZYCOZY_RATE_LIMIT_MS || 1000);
    this.lastRequestTime = 0;
  }

  /**
   * Search hotels using CozyCozy API
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.location - City name or location
   * @param {string} searchParams.checkIn - Check-in date (YYYY-MM-DD)
   * @param {string} searchParams.checkOut - Check-out date (YYYY-MM-DD)
   * @param {number} searchParams.guests - Number of guests
   * @param {Object} searchParams.filters - Additional filters
   * @returns {Promise<Object>} Search results
   */
  async searchHotels(searchParams) {
    try {
      const {
        location,
        checkIn,
        checkOut,
        guests = 2,
        filters = {}
      } = searchParams;

      // Generate search ID
      const searchId = this.generateSearchId();

      // Build request payload based on the curl example
      const payload = {
        processNewResults: true,
        count: filters.count || 40,
        forMap: true,
        offset: filters.offset || 0,
        searchId: searchId,
        sorting: filters.sorting || 'ranking', // ranking, price, rating
        zoomLevel: filters.zoomLevel || 11,
        filters: {
          bounds: filters.bounds || {
            west: -180,
            east: 180,
            north: 90,
            south: -90
          },
          noBounds: !filters.bounds,
          price: filters.priceRange || [-0.5, 9007199254740991],
          instantBooking: filters.instantBooking !== false,
          combinedTypeCodes: filters.typeCodes || [],
          starRatings: filters.starRatings || [],
          minRating: filters.minRating || 0,
          ratingRequired: filters.ratingRequired || false,
          amenityCodes: filters.amenities || [],
          providerCodes: filters.providers || [],
          minBedRoomCount: filters.minBedrooms || 1,
          minBathRoomCount: filters.minBathrooms || 0,
          cityCodes: filters.cityCodes || [],
          areaCodes: filters.areaCodes || [],
          minResponseTime: filters.minResponseTime || null,
          updateBounds: false,
          breakfast: filters.breakfast || false,
          minCancellationCategory: filters.minCancellation || 0
        }
      };

      // Rate limiting
      await this.waitForRateLimit();

      // Make API request
      const response = await axios.post(
        `${this.baseUrl}/getResults`,
        payload,
        {
          headers: this.getHeaders(searchId),
          timeout: 30000
        }
      );

      console.log('✅ CozyCozy API response received, status:', response.status);
      const parsedHotels = this.parseResults(response.data);
      console.log(`✅ Parsed ${parsedHotels.length} hotels from CozyCozy response`);

      return {
        success: true,
        searchId: searchId,
        results: response.data,
        hotels: parsedHotels
      };
    } catch (error) {
      console.error('❌ CozyCozy API error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
      }
      if (error.request) {
        console.error('Request made but no response received');
      }
      // Don't throw, return empty results to allow fallback
      return {
        success: false,
        error: error.message,
        hotels: []
      };
    }
  }

  /**
   * Parse CozyCozy API response into normalized hotel data
   * @param {Object} responseData - Raw API response
   * @returns {Array} Array of normalized hotel objects
   */
  parseResults(responseData) {
    if (!responseData) {
      console.warn('⚠️ CozyCozy response data is empty');
      return [];
    }

    // Try different response structures
    let results = null;
    
    if (responseData.results) {
      results = Array.isArray(responseData.results) 
        ? responseData.results 
        : Object.values(responseData.results);
    } else if (Array.isArray(responseData)) {
      results = responseData;
    } else if (responseData.data) {
      results = Array.isArray(responseData.data) ? responseData.data : Object.values(responseData.data);
    } else if (responseData.hotels) {
      results = Array.isArray(responseData.hotels) ? responseData.hotels : Object.values(responseData.hotels);
    }

    if (!results || results.length === 0) {
      console.warn('⚠️ No results found in CozyCozy response. Response structure:', Object.keys(responseData || {}));
      return [];
    }

    console.log(`📊 Parsing ${results.length} results from CozyCozy`);

    const hotels = [];
    for (const result of results) {
      try {
        const hotel = this.parseHotel(result);
        if (hotel) {
          hotels.push(hotel);
        }
      } catch (error) {
        console.error('Error parsing hotel result:', error);
      }
    }

    return hotels;
  }

  /**
   * Parse individual hotel result
   * @param {Object} result - Raw hotel result from API
   * @returns {Object} Normalized hotel object
   */
  parseHotel(result) {
    if (!result) return null;

    // Extract booking links from different providers
    const bookingLinks = {};
    const prices = {};
    const providers = result.providers || result.offers || [];

    providers.forEach(provider => {
      const platform = provider.provider || provider.platform || 'unknown';
      if (provider.url) {
        bookingLinks[platform] = provider.url;
      }
      if (provider.price) {
        prices[platform] = {
          amount: provider.price,
          currency: provider.currency || 'USD'
        };
      }
    });

    return {
      cozyCozyId: result.id || result.cozyCozyId,
      name: result.name || result.title,
      address: result.address || result.location?.address,
      city: result.city || result.location?.city,
      country: result.country || result.location?.country,
      coordinates: result.coordinates || result.location?.coordinates || {
        latitude: result.lat || result.latitude,
        longitude: result.lng || result.longitude
      },
      rating: result.rating || result.starRating || 0,
      reviewCount: result.reviewCount || result.reviews || 0,
      price: result.price || prices[Object.keys(prices)[0]]?.amount,
      currency: result.currency || prices[Object.keys(prices)[0]]?.currency || 'USD',
      prices: prices, // Prices from all platforms
      bookingLinks: bookingLinks, // Booking links from all platforms
      images: result.images || result.photos || [],
      amenities: result.amenities || result.facilities || [],
      description: result.description || result.summary,
      instantBooking: result.instantBooking || false,
      cancellation: result.cancellation || result.cancellationPolicy,
      provider: result.provider || Object.keys(bookingLinks)[0],
      rawData: result // Keep raw data for reference
    };
  }

  /**
   * Get headers for API request
   * @param {string} searchId - Search ID
   * @returns {Object} Request headers
   */
  getHeaders(searchId) {
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/json',
      'origin': 'https://www.cozycozy.com',
      'referer': 'https://www.cozycozy.com/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'x-search-id': searchId,
      'x-split-id': '0'
    };

    // Add authorization if token is available
    if (this.authToken) {
      headers['authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Generate unique search ID
   * @returns {string} Search ID
   */
  generateSearchId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Wait for rate limit
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Search hotels by location and dates
   * @param {string} location - City name or location
   * @param {Date|string} checkIn - Check-in date
   * @param {Date|string} checkOut - Check-out date
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of hotels
   */
  async searchByLocation(location, checkIn, checkOut, options = {}) {
    const checkInDate = checkIn instanceof Date 
      ? checkIn.toISOString().split('T')[0] 
      : checkIn;
    const checkOutDate = checkOut instanceof Date 
      ? checkOut.toISOString().split('T')[0] 
      : checkOut;

    const searchParams = {
      location,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: options.guests || 2,
      filters: {
        count: options.limit || 40,
        offset: options.offset || 0,
        sorting: options.sortBy || 'ranking',
        priceRange: options.priceRange,
        minRating: options.minRating,
        starRatings: options.starRatings,
        amenities: options.amenities,
        ...options.filters
      }
    };

    const result = await this.searchHotels(searchParams);
    
    // Return hotels array directly, or empty array if error
    if (!result.success) {
      console.warn('⚠️ CozyCozy search failed:', result.error);
      return [];
    }
    
    return result.hotels || [];
  }
}

module.exports = new CozyCozyService();

