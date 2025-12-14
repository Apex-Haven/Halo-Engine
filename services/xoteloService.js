const axios = require('axios');

/**
 * Xotelo Hotel API Service
 * Integrates with Xotelo API via RapidAPI to get hotel prices and availability
 * Xotelo aggregates hotel prices from multiple booking platforms
 */
class XoteloService {
  constructor() {
    this.baseUrl = 'https://xotelo-hotel-prices.p.rapidapi.com';
    this.apiKey = process.env.XOTELO_API_KEY || 'fdf79338acmshb8b3f243c0063c1p1dee3fjsn307375807fc1';
    this.enabled = process.env.XOTELO_ENABLED !== 'false';
    this.rateLimitMonthly = parseInt(process.env.XOTELO_RATE_LIMIT_MONTHLY || 1000);
    
    // Log configuration on initialization
    console.log('🔧 Xotelo Service Initialized:');
    console.log(`   - Enabled: ${this.enabled}`);
    console.log(`   - API Key present: ${!!this.apiKey}`);
    console.log(`   - Rate limit: ${this.rateLimitMonthly}/month`);
    console.log(`   - XOTELO_ENABLED env: ${process.env.XOTELO_ENABLED}`);
    console.log(`   - XOTELO_API_KEY env: ${process.env.XOTELO_API_KEY ? 'SET' : 'NOT SET'}`);
    
    // Rate limiting tracking
    this.requestCount = 0;
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    
    // Location key mapping for common cities
    // Note: These are TripAdvisor location keys (g-prefix)
    // Format: g{location_id} where location_id is TripAdvisor's internal ID
    // Common Indian cities location keys:
    this.locationKeyMap = {
      'mumbai': 'g304554', // Mumbai, Maharashtra (verified)
      'delhi': 'g304551',  // New Delhi
      'bangalore': 'g297628', // Bengaluru
      'hyderabad': 'g297586', // Hyderabad
      'chennai': 'g297478', // Chennai
      'kolkata': 'g297535', // Kolkata
      'pune': 'g297673',   // Pune
      'goa': 'g297604',    // Goa
      'jaipur': 'g297623',  // Jaipur
      'ahmedabad': 'g297608', // Ahmedabad (verified)
      'thane': 'g304554',   // Thane (same as Mumbai region)
      // International examples (for reference):
      'phuket': 'g297930'   // Phuket, Thailand (verified working)
    };
  }

  /**
   * Check if rate limit is exceeded
   * @returns {boolean} True if limit exceeded
   */
  checkRateLimit() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    // Reset counter if month changed
    if (month !== this.currentMonth || year !== this.currentYear) {
      this.requestCount = 0;
      this.currentMonth = month;
      this.currentYear = year;
    }
    
    // Check if limit exceeded
    if (this.requestCount >= this.rateLimitMonthly) {
      console.warn(`⚠️ Xotelo rate limit exceeded: ${this.requestCount}/${this.rateLimitMonthly} requests this month`);
      return true;
    }
    
    // Warn if approaching limit
    if (this.requestCount >= this.rateLimitMonthly * 0.8) {
      console.warn(`⚠️ Xotelo rate limit warning: ${this.requestCount}/${this.rateLimitMonthly} requests used (80%+)`);
    }
    
    return false;
  }

  /**
   * Increment request counter
   */
  incrementRequestCount() {
    this.requestCount++;
  }

  /**
   * Get headers for API request
   * @returns {Object} Request headers
   */
  getHeaders() {
    return {
      'x-rapidapi-host': 'xotelo-hotel-prices.p.rapidapi.com',
      'x-rapidapi-key': this.apiKey
    };
  }

  /**
   * Find location key for a city
   * @param {string} location - City name
   * @returns {string|null} Location key or null
   */
  findLocationKey(location) {
    if (!location) return null;
    
    const locationLower = location.toLowerCase().trim();
    
    // Check direct mapping
    if (this.locationKeyMap[locationLower]) {
      console.log(`✅ Xotelo: Found location key for "${location}": ${this.locationKeyMap[locationLower]}`);
      return this.locationKeyMap[locationLower];
    }
    
    // Check partial matches
    for (const [key, value] of Object.entries(this.locationKeyMap)) {
      if (locationLower.includes(key) || key.includes(locationLower)) {
        console.log(`✅ Xotelo: Found location key via partial match "${key}" for "${location}": ${value}`);
        return value;
      }
    }
    
    console.log(`⚠️ Xotelo: No location key found for "${location}". Available keys: ${Object.keys(this.locationKeyMap).join(', ')}`);
    return null;
  }

  /**
   * Search hotels using location name
   * @param {string} location - City or location name
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchHotels(location, options = {}) {
    if (!this.enabled) {
      console.log('ℹ️ Xotelo is disabled');
      return { success: false, hotels: [] };
    }

    if (this.checkRateLimit()) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        hotels: []
      };
    }

    try {
      // The search endpoint requires a 'query' parameter
      const params = {
        location_type: 'accommodation',
        query: location || '', // Required parameter
        ...(options.limit && { limit: options.limit }),
        ...(options.offset && { offset: options.offset }),
        ...(options.sort && { sort: options.sort })
      };

      this.incrementRequestCount();
      
      const response = await axios.get(`${this.baseUrl}/api/search`, {
        params,
        headers: this.getHeaders(),
        timeout: 10000
      });

      console.log('✅ Xotelo search API response received, status:', response.status);
      console.log('📋 Xotelo search response structure:', Object.keys(response.data || {}));
      
      const hotels = this.parseHotels(response.data, location);
      console.log(`✅ Parsed ${hotels.length} hotels from Xotelo search response`);
      
      if (hotels.length === 0 && response.data) {
        console.warn('⚠️ Xotelo search returned 0 hotels. Response data:', JSON.stringify(response.data).substring(0, 500));
      }

      return {
        success: true,
        hotels: hotels,
        rawData: response.data
      };
    } catch (error) {
      console.error('❌ Xotelo search API error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
      }
      
      return {
        success: false,
        error: error.message,
        hotels: []
      };
    }
  }

  /**
   * List hotels by location key
   * @param {string} locationKey - Location key (e.g., 'g297930')
   * @param {Object} options - List options
   * @returns {Promise<Object>} List results
   */
  async listHotels(locationKey, options = {}) {
    if (!this.enabled) {
      return { success: false, hotels: [] };
    }

    if (this.checkRateLimit()) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        hotels: []
      };
    }

    try {
      const params = {
        location_key: locationKey,
        limit: options.limit || 30,
        offset: options.offset || 0,
        sort: options.sort || 'best_value'
      };

      this.incrementRequestCount();
      
      const response = await axios.get(`${this.baseUrl}/api/list`, {
        params,
        headers: this.getHeaders(),
        timeout: 10000
      });

      console.log('✅ Xotelo list API response received, status:', response.status);
      console.log('📋 Xotelo list response structure:', Object.keys(response.data || {}));
      
      const hotels = this.parseHotels(response.data, null);
      console.log(`✅ Parsed ${hotels.length} hotels from Xotelo list response`);
      
      if (hotels.length === 0 && response.data) {
        console.warn('⚠️ Xotelo list returned 0 hotels. Response data:', JSON.stringify(response.data).substring(0, 500));
      }

      return {
        success: true,
        hotels: hotels,
        rawData: response.data
      };
    } catch (error) {
      console.error('❌ Xotelo list API error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
      }
      
      return {
        success: false,
        error: error.message,
        hotels: []
      };
    }
  }

  /**
   * Search hotels by location (tries both search and list endpoints)
   * @param {string} location - City name or location
   * @param {Date|string} checkIn - Check-in date
   * @param {Date|string} checkOut - Check-out date
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of hotels
   */
  async searchByLocation(location, checkIn, checkOut, options = {}) {
    if (!this.enabled) {
      return [];
    }

    let hotels = [];

    // Try list endpoint first if we have location key
    const locationKey = this.findLocationKey(location);
    if (locationKey) {
      console.log(`🔍 Xotelo: Using list endpoint with location_key: ${locationKey}`);
      const listResult = await this.listHotels(locationKey, {
        limit: options.limit || 30,
        offset: options.offset || 0,
        sort: options.sort || 'best_value'
      });
      
      if (listResult.success && listResult.hotels.length > 0) {
        hotels = listResult.hotels;
        console.log(`✅ Xotelo list endpoint returned ${hotels.length} hotels`);
      } else {
        console.warn(`⚠️ Xotelo list endpoint failed or returned no results:`, listResult.error || 'No hotels found');
        if (listResult.error) {
          console.warn(`   Error details:`, listResult.error);
        }
      }
    } else {
      console.log(`⚠️ Xotelo: No location key found for "${location}", skipping list endpoint`);
    }

    // If no results from list, try search endpoint
    if (hotels.length === 0) {
      console.log(`🔍 Xotelo: Using search endpoint for location: ${location}`);
      const searchResult = await this.searchHotels(location, {
        limit: options.limit || 30,
        offset: options.offset || 0,
        sort: options.sort
      });
      
      if (searchResult.success && searchResult.hotels.length > 0) {
        hotels = searchResult.hotels;
        console.log(`✅ Xotelo search endpoint returned ${hotels.length} hotels`);
      } else {
        console.warn(`⚠️ Xotelo search endpoint failed or returned no results:`, searchResult.error || 'No hotels found');
        if (searchResult.error) {
          console.warn(`   Error details:`, searchResult.error);
        }
      }
    }
    
    if (hotels.length === 0) {
      console.error(`❌ Xotelo: No hotels found for location "${location}" from either endpoint`);
    }

    return hotels;
  }

  /**
   * Parse Xotelo API response into normalized hotel data
   * @param {Object} responseData - Raw API response
   * @param {string} location - Location name for fallback
   * @returns {Array} Array of normalized hotel objects
   */
  parseHotels(responseData, location = null) {
    if (!responseData) {
      console.warn('⚠️ Xotelo response data is empty');
      return [];
    }

    // Check for API errors
    if (responseData.error) {
      console.warn('⚠️ Xotelo API error:', responseData.error.message || responseData.error);
      return [];
    }

    // Try different response structures
    let hotels = null;
    
    // Xotelo list endpoint structure: { error: null, result: { total_count: X, list: [...] } }
    // Xotelo search endpoint structure: { error: null, result: { query: "...", list: [...] } }
    if (responseData.result && responseData.result.list && Array.isArray(responseData.result.list)) {
      hotels = responseData.result.list;
      console.log(`📋 Found ${hotels.length} hotels in result.list`);
    } 
    // Fallback: direct array in result
    else if (responseData.result && Array.isArray(responseData.result)) {
      hotels = responseData.result;
      console.log(`📋 Found ${hotels.length} hotels in result (direct array)`);
    }
    // Direct array or other structures
    else if (responseData.hotels && Array.isArray(responseData.hotels)) {
      hotels = responseData.hotels;
    } else if (responseData.data && Array.isArray(responseData.data)) {
      hotels = responseData.data;
    } else if (responseData.results && Array.isArray(responseData.results)) {
      hotels = responseData.results;
    } else if (Array.isArray(responseData)) {
      hotels = responseData;
    } else if (responseData.items && Array.isArray(responseData.items)) {
      hotels = responseData.items;
    }

    if (!hotels || hotels.length === 0) {
      console.warn('⚠️ No hotels found in Xotelo response. Response structure:', Object.keys(responseData || {}));
      if (responseData.result) {
        console.warn('Result keys:', Object.keys(responseData.result || {}));
      }
      return [];
    }

    console.log(`📊 Parsing ${hotels.length} hotels from Xotelo`);

    const parsedHotels = [];
    for (const hotel of hotels) {
      try {
        const parsed = this.parseHotel(hotel, location);
        if (parsed) {
          parsedHotels.push(parsed);
        }
      } catch (error) {
        console.error('Error parsing Xotelo hotel:', error);
      }
    }

    return parsedHotels;
  }

  /**
   * Parse individual hotel from Xotelo response
   * @param {Object} hotel - Raw hotel data from API
   * @param {string} location - Location name for fallback
   * @returns {Object} Normalized hotel object
   */
  parseHotel(hotel, location = null) {
    if (!hotel) return null;

    // Extract hotel ID - Xotelo uses 'key' or 'hotel_key' field (e.g., 'g297930-d13140255')
    const hotelId = hotel.key || hotel.hotel_key || hotel.id || hotel.hotelId || hotel.hotel_id || 
                   hotel.propertyId || hotel.property_id || 
                   `XOTELO_${hotel.name?.replace(/\s+/g, '_').toUpperCase() || 'UNKNOWN'}`;

    // Extract pricing information - Xotelo uses price_ranges object (list endpoint)
    // Search endpoint may not have pricing, so we'll use defaults
    let basePrice = 0;
    let currency = 'USD';
    if (hotel.price_ranges) {
      basePrice = hotel.price_ranges.minimum || hotel.price_ranges.min || 0;
      currency = hotel.price_ranges.currency || 'USD';
    } else {
      basePrice = hotel.price || hotel.pricePerNight || hotel.rate || 
                 hotel.minPrice || hotel.minimumPrice || 0;
      currency = hotel.currency || hotel.priceCurrency || 'USD';
    }
    
    // If no price found (search endpoint), use a default estimate
    // This will be filtered/scored by the recommendation system
    if (basePrice === 0) {
      basePrice = 5000; // Default estimate in INR (will be converted if needed)
      currency = 'INR';
    }
    
    const discount = hotel.discount || hotel.discountPercent || 0;

    // Extract location information - Xotelo uses 'geo' object or location fields
    const address = hotel.street_address || hotel.address || hotel.location?.address || 
                   hotel.fullAddress || hotel.streetAddress || '';
    const city = hotel.short_place_name?.split(',')[0] || hotel.place_name?.split(',')[0] || 
                hotel.city || hotel.location?.city || 
                hotel.locationName || location || 'Unknown';
    const country = hotel.place_name?.split(',').pop()?.trim() || 
                   hotel.country || hotel.location?.country || '';
    const latitude = hotel.geo?.latitude || hotel.latitude || hotel.lat || 
                    hotel.location?.latitude || hotel.coordinates?.latitude || null;
    const longitude = hotel.geo?.longitude || hotel.longitude || hotel.lng || 
                     hotel.location?.longitude || hotel.coordinates?.longitude || null;

    // Extract rating information - Xotelo uses review_summary object (list endpoint)
    // Search endpoint may not have ratings, so we'll use defaults
    let ratingScore = 0;
    let reviewCount = 0;
    if (hotel.review_summary) {
      ratingScore = hotel.review_summary.rating || 0;
      reviewCount = hotel.review_summary.count || 0;
    } else {
      ratingScore = hotel.ratingScore || hotel.reviewScore || 
                   hotel.score || hotel.rating || 0;
      reviewCount = hotel.reviewCount || hotel.reviews || 
                   hotel.numReviews || 0;
    }
    
    // If no rating found, use default (search endpoint may not include ratings)
    if (ratingScore === 0 && reviewCount === 0) {
      ratingScore = 4.0; // Default rating
      reviewCount = 0;
    }
    
    // Star rating - estimate from accommodation_type or use default
    const starRating = hotel.starRating || hotel.stars || 
                      (hotel.accommodation_type === 'Resort' ? 4 : 
                       hotel.accommodation_type === 'Hotel' ? 3 : 3);

    // Extract amenities - Xotelo uses 'mentions' array
    const amenities = [];
    if (hotel.mentions && Array.isArray(hotel.mentions)) {
      amenities.push(...hotel.mentions.map(m => m.toLowerCase()));
    }
    if (hotel.amenities && Array.isArray(hotel.amenities)) {
      amenities.push(...hotel.amenities);
    }
    if (hotel.facilities && Array.isArray(hotel.facilities)) {
      amenities.push(...hotel.facilities);
    }

    // Extract booking links - Xotelo provides 'url' field (TripAdvisor link)
    const bookingLinks = {};
    if (hotel.url) {
      bookingLinks.tripadvisor = hotel.url;
      bookingLinks.xotelo = hotel.url; // Use same URL as primary booking link
    }
    if (hotel.bookingUrl) {
      bookingLinks.xotelo = hotel.bookingUrl;
    }
    if (hotel.links) {
      Object.assign(bookingLinks, hotel.links);
    }

    // Extract images - Xotelo uses 'image' field (single image URL)
    // Images come from TripAdvisor CDN (dynamic-media-cdn.tripadvisor.com)
    const images = [];
    
    // Helper to validate and normalize image URLs
    const normalizeImageUrl = (imgUrl) => {
      if (!imgUrl) return null;
      
      // If it's already an object with url property, return it
      if (typeof imgUrl === 'object' && imgUrl.url) {
        return { url: imgUrl.url, source: 'tripadvisor' };
      }
      
      // If it's a string, validate it
      if (typeof imgUrl === 'string' && imgUrl.trim()) {
        // Ensure it's a valid URL
        try {
          const url = new URL(imgUrl);
          // TripAdvisor CDN images are expected
          return { url: imgUrl, source: 'tripadvisor' };
        } catch (e) {
          // Invalid URL, skip it
          console.warn(`⚠️ Invalid image URL from Xotelo: ${imgUrl}`);
          return null;
        }
      }
      
      return null;
    };
    
    // Extract from various possible fields
    if (hotel.image) {
      const normalized = normalizeImageUrl(hotel.image);
      if (normalized) images.push(normalized);
    }
    if (hotel.images && Array.isArray(hotel.images)) {
      hotel.images.forEach(img => {
        const normalized = normalizeImageUrl(img);
        if (normalized) images.push(normalized);
      });
    }
    if (hotel.photos && Array.isArray(hotel.photos)) {
      hotel.photos.forEach(photo => {
        const normalized = normalizeImageUrl(photo);
        if (normalized) images.push(normalized);
      });
    }
    
    // Log image sources for debugging
    if (images.length > 0) {
      const imageSources = images.map(img => {
        const url = img.url || img;
        if (typeof url === 'string') {
          if (url.includes('tripadvisor.com')) return 'TripAdvisor CDN';
          if (url.includes('unsplash.com')) return 'Unsplash';
          return 'Other';
        }
        return 'Unknown';
      });
      console.log(`   📸 Found ${images.length} image(s) from: ${[...new Set(imageSources)].join(', ')}`);
    }

    // Build normalized hotel object
    const normalizedHotel = {
      hotelId: hotelId,
      name: hotel.name || hotel.title || hotel.propertyName || 'Unknown Hotel',
      city: city.toUpperCase(),
      country: country,
      starRating: Math.min(5, Math.max(1, parseInt(starRating) || 3)),
      rating: {
        score: parseFloat(ratingScore) || 0,
        reviews: parseInt(reviewCount) || 0,
        platform: 'xotelo'
      },
      pricing: {
        basePrice: parseFloat(basePrice) || 0,
        currency: currency,
        discount: parseFloat(discount) || 0,
        taxIncluded: hotel.taxIncluded || false
      },
      location: {
        address: address,
        coordinates: (latitude && longitude) ? {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude)
        } : null
      },
      amenities: this.normalizeAmenities(amenities),
      images: images.length > 0 ? images : [{
        url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop'
      }],
      sources: [{
        platform: 'xotelo',
        url: bookingLinks.xotelo || bookingLinks.direct || '#',
        lastChecked: new Date().toISOString(),
        price: parseFloat(basePrice) || 0,
        available: hotel.available !== false
      }],
      bookingLinks: bookingLinks,
      prices: {
        xotelo: {
          amount: parseFloat(basePrice) || 0,
          currency: currency
        }
      },
      description: hotel.description || hotel.summary || '',
      xoteloId: hotel.id || hotel.hotelId || hotel.key || hotel.hotel_key || null,
      rawData: hotel, // Keep raw data for reference
      // Explicitly mark as real API data
      isRealApiData: true,
      source: 'xotelo'
    };

    console.log(`   ✓ Parsed hotel: ${normalizedHotel.name} (ID: ${normalizedHotel.hotelId}, has sources: ${!!normalizedHotel.sources}, source: ${normalizedHotel.source})`);
    
    return normalizedHotel;
  }

  /**
   * Normalize amenities array
   * @param {Array|Object} amenities - Amenities from API
   * @returns {Array} Normalized amenities array
   */
  normalizeAmenities(amenities) {
    if (!amenities) return [];
    
    if (Array.isArray(amenities)) {
      return amenities.map(amenity => {
        if (typeof amenity === 'string') {
          return amenity.toLowerCase();
        }
        return amenity.name || amenity.title || String(amenity).toLowerCase();
      });
    }
    
    if (typeof amenities === 'object') {
      return Object.keys(amenities).filter(key => amenities[key] === true);
    }
    
    return [];
  }
}

module.exports = new XoteloService();

