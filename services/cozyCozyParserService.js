/**
 * CozyCozy Response Parser Service
 * Parses and normalizes CozyCozy API responses
 */
class CozyCozyParserService {
  constructor() {
    this.platformMapping = {
      'booking.com': 'booking.com',
      'agoda': 'agoda',
      'makemytrip': 'makemytrip',
      'yatra': 'yatra',
      'cleartrip': 'cleartrip',
      'expedia': 'expedia',
      'hotels.com': 'hotels.com'
    };
  }

  /**
   * Parse CozyCozy API response
   * @param {Object} responseData - Raw API response
   * @returns {Object} Parsed response with normalized hotels
   */
  parseResponse(responseData) {
    if (!responseData) {
      return {
        hotels: [],
        totalResults: 0,
        searchId: null
      };
    }

    const hotels = [];
    const results = this.extractResults(responseData);

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

    return {
      hotels,
      totalResults: hotels.length,
      searchId: responseData.searchId || null,
      rawData: responseData
    };
  }

  /**
   * Extract results array from response
   * @param {Object} responseData - API response
   * @returns {Array} Results array
   */
  extractResults(responseData) {
    // CozyCozy may return results in different formats
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    if (responseData.results && Array.isArray(responseData.results)) {
      return responseData.results;
    }
    
    if (responseData.data && Array.isArray(responseData.data)) {
      return responseData.data;
    }
    
    if (responseData.hotels && Array.isArray(responseData.hotels)) {
      return responseData.hotels;
    }
    
    // If results is an object, convert to array
    if (responseData.results && typeof responseData.results === 'object') {
      return Object.values(responseData.results);
    }
    
    return [];
  }

  /**
   * Parse individual hotel result
   * @param {Object} result - Raw hotel result
   * @returns {Object} Normalized hotel object
   */
  parseHotel(result) {
    if (!result) return null;

    // Extract booking links and prices from providers/offers
    const bookingLinks = {};
    const prices = {};
    
    // Handle different response structures
    const providers = result.providers || result.offers || result.bookingOptions || [];
    
    if (Array.isArray(providers)) {
      providers.forEach(provider => {
        const platform = this.normalizePlatformName(
          provider.provider || provider.platform || provider.source || 'unknown'
        );
        
        if (provider.url || provider.bookingUrl || provider.link) {
          bookingLinks[platform] = provider.url || provider.bookingUrl || provider.link;
        }
        
        if (provider.price || provider.amount) {
          prices[platform] = {
            amount: parseFloat(provider.price || provider.amount || 0),
            currency: provider.currency || provider.currencyCode || 'USD'
          };
        }
      });
    }

    // Extract location coordinates
    let coordinates = null;
    if (result.coordinates) {
      coordinates = {
        latitude: result.coordinates.lat || result.coordinates.latitude,
        longitude: result.coordinates.lng || result.coordinates.longitude
      };
    } else if (result.lat && result.lng) {
      coordinates = {
        latitude: result.lat,
        longitude: result.lng
      };
    } else if (result.location) {
      coordinates = {
        latitude: result.location.lat || result.location.latitude,
        longitude: result.location.lng || result.location.longitude
      };
    }

    // Extract images
    const images = [];
    if (result.images && Array.isArray(result.images)) {
      images.push(...result.images);
    } else if (result.photos && Array.isArray(result.photos)) {
      images.push(...result.photos);
    } else if (result.image) {
      images.push(result.image);
    } else if (result.photo) {
      images.push(result.photo);
    }

    // Extract amenities
    const amenities = [];
    if (result.amenities && Array.isArray(result.amenities)) {
      amenities.push(...result.amenities);
    } else if (result.facilities && Array.isArray(result.facilities)) {
      amenities.push(...result.facilities);
    } else if (result.features && Array.isArray(result.features)) {
      amenities.push(...result.features);
    }

    return {
      cozyCozyId: result.id || result.cozyCozyId || result.hotelId,
      name: result.name || result.title || result.hotelName,
      address: result.address || result.location?.address || result.fullAddress,
      city: result.city || result.location?.city,
      country: result.country || result.location?.country,
      coordinates,
      rating: parseFloat(result.rating || result.starRating || result.score || 0),
      reviewCount: parseInt(result.reviewCount || result.reviews || result.numReviews || 0),
      price: parseFloat(result.price || result.basePrice || prices[Object.keys(prices)[0]]?.amount || 0),
      currency: result.currency || prices[Object.keys(prices)[0]]?.currency || 'USD',
      prices, // Prices from all platforms
      bookingLinks, // Booking links from all platforms
      images,
      amenities,
      description: result.description || result.summary || result.overview,
      instantBooking: result.instantBooking || result.instantBook || false,
      cancellation: result.cancellation || result.cancellationPolicy || result.cancellationInfo,
      provider: result.provider || Object.keys(bookingLinks)[0] || 'cozycozy',
      rawData: result // Keep raw data for reference
    };
  }

  /**
   * Normalize platform name
   * @param {string} platform - Platform identifier
   * @returns {string} Normalized platform name
   */
  normalizePlatformName(platform) {
    if (!platform) return 'unknown';
    
    const lower = platform.toLowerCase();
    
    // Check mapping
    if (this.platformMapping[lower]) {
      return this.platformMapping[lower];
    }
    
    // Try to match common patterns
    if (lower.includes('booking')) return 'booking.com';
    if (lower.includes('agoda')) return 'agoda';
    if (lower.includes('makemytrip') || lower.includes('mmt')) return 'makemytrip';
    if (lower.includes('yatra')) return 'yatra';
    if (lower.includes('cleartrip')) return 'cleartrip';
    if (lower.includes('expedia')) return 'expedia';
    if (lower.includes('hotels.com')) return 'hotels.com';
    
    return lower;
  }

  /**
   * Extract search metadata from response
   * @param {Object} responseData - API response
   * @returns {Object} Metadata
   */
  extractMetadata(responseData) {
    return {
      totalResults: responseData.totalResults || responseData.total || 0,
      searchId: responseData.searchId || null,
      offset: responseData.offset || 0,
      count: responseData.count || responseData.results?.length || 0,
      hasMore: responseData.hasMore || false
    };
  }
}

module.exports = new CozyCozyParserService();

