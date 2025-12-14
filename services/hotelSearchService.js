const axios = require('axios');
const cheerio = require('cheerio');
const { MockHotelService } = require('./mockHotelService');

class HotelSearchService {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ];
    this.requestDelay = 2000; // 2 seconds between requests
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Main search method - searches hotels from multiple sources
   * @param {String} city - City name to search
   * @param {Object} filters - Search filters including conference location
   * @param {Object} filters.conferenceLocation - Optional conference location with coordinates
   * @param {Number} filters.maxDistanceFromConference - Max distance in km from conference
   */
  async searchHotels(city, filters = {}) {
    try {
      const results = {
        city: city,
        totalResults: 0,
        sources: [],
        hotels: []
      };

      // Search from multiple sources
      const [makemytripHotels, yatraHotels, cleartripHotels, mockHotels] = await Promise.allSettled([
        this.searchMakeMyTrip(city, filters),
        this.searchYatra(city, filters),
        this.searchCleartrip(city, filters),
        this.searchMockHotels(city, filters)
      ]);

      // Process results
      const allHotels = [];
      
      if (makemytripHotels.status === 'fulfilled' && makemytripHotels.value) {
        allHotels.push(...makemytripHotels.value);
        results.sources.push('makemytrip');
      }
      
      if (yatraHotels.status === 'fulfilled' && yatraHotels.value) {
        allHotels.push(...yatraHotels.value);
        results.sources.push('yatra');
      }
      
      if (cleartripHotels.status === 'fulfilled' && cleartripHotels.value) {
        allHotels.push(...cleartripHotels.value);
        results.sources.push('cleartrip');
      }

      // Add mock hotels as fallback
      if (mockHotels.status === 'fulfilled' && mockHotels.value) {
        console.log(`✅ Mock hotels status: ${mockHotels.status}, count: ${mockHotels.value?.length || 0}`);
        allHotels.push(...mockHotels.value);
        results.sources.push('mock');
      } else {
        console.log(`❌ Mock hotels failed: ${mockHotels.status}, reason: ${mockHotels.reason?.message || 'unknown'}`);
      }

      console.log(`🔍 Total hotels collected from all sources: ${allHotels.length}`);

      // Remove duplicates and rank hotels
      let hotels = this.deduplicateAndRank(allHotels);
      console.log(`🔍 After deduplication: ${hotels.length} hotels`);

      // Filter by conference proximity if conference location provided
      if (filters.conferenceLocation && filters.conferenceLocation.coordinates) {
        const confLat = filters.conferenceLocation.coordinates.latitude;
        const confLon = filters.conferenceLocation.coordinates.longitude;
        const maxDistance = filters.maxDistanceFromConference || 10; // Default 10km

        hotels = hotels.map(hotel => {
          const hotelCoords = hotel.location?.coordinates;
          if (hotelCoords && hotelCoords.latitude && hotelCoords.longitude) {
            const distance = this.calculateDistance(
              confLat,
              confLon,
              hotelCoords.latitude,
              hotelCoords.longitude
            );
            hotel.distanceFromConference = Math.round(distance * 100) / 100;
            return hotel;
          }
          hotel.distanceFromConference = null;
          return hotel;
        });

        // Filter by max distance if specified
        if (maxDistance > 0) {
          hotels = hotels.filter(hotel => 
            hotel.distanceFromConference === null || hotel.distanceFromConference <= maxDistance
          );
        }

        // Sort by distance from conference
        hotels.sort((a, b) => {
          const distA = a.distanceFromConference || 999;
          const distB = b.distanceFromConference || 999;
          return distA - distB;
        });
      }

      results.hotels = hotels;
      results.totalResults = results.hotels.length;

      console.log(`✅ hotelSearchService.searchHotels returning ${hotels.length} hotels for ${city} (sources: ${results.sources.join(', ')})`);
      return results;
    } catch (error) {
      console.error('Hotel search error:', error.message);
      // Return mock data as fallback
      return this.searchMockHotels(city, filters).then(mockHotels => ({
        city: city,
        totalResults: mockHotels.length,
        sources: ['mock'],
        hotels: mockHotels
      }));
    }
  }

  /**
   * Search MakeMyTrip for hotels
   */
  async searchMakeMyTrip(city, filters = {}) {
    try {
      console.log(`🔍 Searching MakeMyTrip for hotels in ${city}...`);
      
      // Try to fetch from MakeMyTrip's internal API
      // These APIs are used by their frontend but are not officially documented
      const url = `https://www.makemytrip.com/api/services/autosuggest/v1/hotels`;
      const searchParams = new URLSearchParams({
        query: city,
        client: 'web',
        fetchAllHotels: 'true'
      });

      try {
        const response = await axios.get(`${url}?${searchParams}`, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Referer': 'https://www.makemytrip.com/',
            'Accept': 'application/json'
          },
          timeout: 5000
        });

        if (response.data && response.data.data) {
          const hotels = this.formatMakeMyTripData(response.data.data);
          if (hotels.length > 0) {
            console.log(`✅ Found ${hotels.length} hotels from MakeMyTrip`);
            return hotels;
          }
        }
      } catch (apiError) {
        console.log(`⚠️ MakeMyTrip API not accessible (${apiError.message}), using fallback`);
      }

      // Fallback to mock data
      return this.getMockMakeMyTripHotels(city);
      
    } catch (error) {
      console.error('MakeMyTrip search error:', error.message);
      return [];
    }
  }

  /**
   * Search Yatra for hotels
   */
  async searchYatra(city, filters = {}) {
    try {
      console.log(`🔍 Searching Yatra for hotels in ${city}...`);
      
      // Similar to MakeMyTrip, implement actual scraping
      return this.getMockYatraHotels(city);
      
    } catch (error) {
      console.error('Yatra search error:', error.message);
      return [];
    }
  }

  /**
   * Search Cleartrip for hotels
   */
  async searchCleartrip(city, filters = {}) {
    try {
      console.log(`🔍 Searching Cleartrip for hotels in ${city}...`);
      
      // Similar to above, implement actual scraping
      return this.getMockCleartripHotels(city);
      
    } catch (error) {
      console.error('Cleartrip search error:', error.message);
      return [];
    }
  }

  /**
   * Search mock hotels (fallback)
   */
  async searchMockHotels(city, filters = {}) {
    try {
      console.log(`🔍 Using mock hotels for ${city}...`);
      console.log(`🔍 Mock hotel filters:`, { minPrice: filters.minPrice, maxPrice: filters.maxPrice, minStarRating: filters.minStarRating });
      
      // Generate prices within budget range if specified, otherwise use reasonable defaults
      const minPrice = filters.minPrice || 2000;
      const maxPrice = filters.maxPrice && filters.maxPrice !== Infinity ? filters.maxPrice : 10000;
      const budgetMid = (minPrice + maxPrice) / 2;
      
      console.log(`🔍 Mock hotel price range: ${minPrice} - ${maxPrice}, mid: ${budgetMid}`);
      
      const mockHotels = [
        {
          hotelId: `HTL${Math.floor(Math.random() * 900000) + 100000}`,
          name: 'Luxury Grand Hotel',
          city: city.toUpperCase(),
          starRating: 5,
          rating: {
            score: 9.2,
            reviews: 1520,
            platform: 'combined'
          },
          pricing: {
            basePrice: Math.round(budgetMid * 1.2), // Slightly above mid-range
            currency: 'INR',
            discount: 15,
            taxIncluded: false
          },
          amenities: {
            wifi: true,
            pool: true,
            gym: true,
            restaurant: true,
            spa: true,
            parking: true
          },
          images: [
            { url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop' }
          ],
          location: {
            address: '123 Main Street, ' + city,
            coordinates: { latitude: 19.0760, longitude: 72.8777 }
          },
          sources: [{
            platform: 'mock',
            url: '#',
            lastChecked: new Date(),
            price: Math.round(budgetMid * 1.2),
            available: true
          }]
        },
        {
          hotelId: `HTL${Math.floor(Math.random() * 900000) + 100000}`,
          name: 'Premium Business Hotel',
          city: city.toUpperCase(),
          starRating: 4,
          rating: {
            score: 8.5,
            reviews: 1200,
            platform: 'combined'
          },
          pricing: {
            basePrice: Math.round(budgetMid), // Mid-range
            currency: 'INR',
            discount: 10,
            taxIncluded: false
          },
          amenities: {
            wifi: true,
            pool: true,
            gym: true,
            restaurant: true,
            parking: true,
            businessCenter: true
          },
          images: [
            { url: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&h=600&fit=crop' }
          ],
          location: {
            address: '456 Business Road, ' + city,
            coordinates: { latitude: 19.0522, longitude: 72.8780 }
          },
          sources: [{
            platform: 'mock',
            url: '#',
            lastChecked: new Date(),
            price: Math.round(budgetMid),
            available: true
          }]
        },
        {
          hotelId: `HTL${Math.floor(Math.random() * 900000) + 100000}`,
          name: 'Comfort Inn Express',
          city: city.toUpperCase(),
          starRating: 3,
          rating: {
            score: 7.8,
            reviews: 890,
            platform: 'combined'
          },
          pricing: {
            basePrice: Math.round(budgetMid * 0.8), // Slightly below mid-range
            currency: 'INR',
            discount: 12,
            taxIncluded: false
          },
          amenities: {
            wifi: true,
            parking: true,
            restaurant: true
          },
          images: [
            { url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&h=600&fit=crop' }
          ],
          location: {
            address: '789 Comfort Lane, ' + city,
            coordinates: { latitude: 19.0759, longitude: 72.8776 }
          },
          sources: [{
            platform: 'mock',
            url: '#',
            lastChecked: new Date(),
            price: Math.round(budgetMid * 0.8),
            available: true
          }]
        }
      ];

      console.log(`🔍 Generated ${mockHotels.length} mock hotels with prices:`, mockHotels.map(h => h.pricing.basePrice));
      const filtered = this.applyFilters(mockHotels, filters);
      console.log(`🔍 After filtering: ${filtered.length} mock hotels remain`);
      return filtered;
    } catch (error) {
      console.error('Mock hotel search error:', error.message);
      return [];
    }
  }

  /**
   * Mock MakeMyTrip hotels
   */
  getMockMakeMyTripHotels(city) {
    return [
      {
        hotelId: `MMT${Math.floor(Math.random() * 900000) + 100000}`,
        name: 'Grand Plaza Hotel',
        city: city.toUpperCase(),
        starRating: 4,
        rating: { score: 8.5, reviews: 1234, platform: 'makemytrip' },
        pricing: { basePrice: 5000, currency: 'INR', discount: 20 },
        amenities: { wifi: true, pool: true, gym: true, restaurant: true },
        location: { address: 'Marine Drive, ' + city, coordinates: { latitude: 18.9398, longitude: 72.8355 } },
        sources: [{ platform: 'makemytrip', url: `https://makemytrip.com/hotels/${city.toLowerCase()}`, price: 5000, available: true }]
      },
      {
        hotelId: `MMT${Math.floor(Math.random() * 900000) + 100000}`,
        name: 'Business Tower Hotel',
        city: city.toUpperCase(),
        starRating: 5,
        rating: { score: 9.0, reviews: 2100, platform: 'makemytrip' },
        pricing: { basePrice: 9000, currency: 'INR', discount: 15 },
        amenities: { wifi: true, pool: true, gym: true, spa: true, restaurant: true, businessCenter: true },
        location: { address: 'Airport Road, ' + city, coordinates: { latitude: 19.0896, longitude: 72.8656 } },
        sources: [{ platform: 'makemytrip', url: `https://makemytrip.com/hotels/${city.toLowerCase()}`, price: 9000, available: true }]
      }
    ];
  }

  /**
   * Mock Yatra hotels
   */
  getMockYatraHotels(city) {
    return [
      {
        hotelId: `YAT${Math.floor(Math.random() * 900000) + 100000}`,
        name: 'Sea View Resort',
        city: city.toUpperCase(),
        starRating: 4,
        rating: { score: 8.7, reviews: 987, platform: 'yatra' },
        pricing: { basePrice: 6000, currency: 'INR', discount: 18 },
        amenities: { wifi: true, pool: true, beach: true, restaurant: true },
        location: { address: 'Beach Road, ' + city, coordinates: { latitude: 18.9564, longitude: 72.8122 } },
        sources: [{ platform: 'yatra', url: `https://yatra.com/hotels/${city.toLowerCase()}`, price: 6000, available: true }]
      }
    ];
  }

  /**
   * Mock Cleartrip hotels
   */
  getMockCleartripHotels(city) {
    return [
      {
        hotelId: `CLR${Math.floor(Math.random() * 900000) + 100000}`,
        name: 'City Center Hotel',
        city: city.toUpperCase(),
        starRating: 3,
        rating: { score: 7.5, reviews: 650, platform: 'cleartrip' },
        pricing: { basePrice: 3000, currency: 'INR', discount: 12 },
        amenities: { wifi: true, restaurant: true, parking: true },
        location: { address: 'Downtown, ' + city, coordinates: { latitude: 19.0760, longitude: 72.8777 } },
        sources: [{ platform: 'cleartrip', url: `https://cleartrip.com/hotels/${city.toLowerCase()}`, price: 3000, available: true }]
      }
    ];
  }

  /**
   * Apply filters to hotel results
   */
  applyFilters(hotels, filters) {
    let filtered = [...hotels];
    const originalCount = filtered.length;

    if (filters.minStarRating) {
      const before = filtered.length;
      filtered = filtered.filter(h => h.starRating >= filters.minStarRating);
      if (before !== filtered.length) {
        console.log(`🔍 Filtered out ${before - filtered.length} hotels by minStarRating (${filters.minStarRating})`);
      }
    }

    if (filters.maxPrice && filters.maxPrice !== Infinity) {
      const before = filtered.length;
      filtered = filtered.filter(h => h.pricing?.basePrice <= filters.maxPrice);
      if (before !== filtered.length) {
        console.log(`🔍 Filtered out ${before - filtered.length} hotels by maxPrice (${filters.maxPrice})`);
      }
    }

    if (filters.minPrice) {
      const before = filtered.length;
      filtered = filtered.filter(h => (h.pricing?.basePrice || 0) >= filters.minPrice);
      if (before !== filtered.length) {
        console.log(`🔍 Filtered out ${before - filtered.length} hotels by minPrice (${filters.minPrice}). Hotel prices were:`, 
          hotels.map(h => h.pricing?.basePrice).filter(Boolean));
      }
    }

    if (filters.minRating) {
      const before = filtered.length;
      filtered = filtered.filter(h => (h.rating?.score || 0) >= filters.minRating);
      if (before !== filtered.length) {
        console.log(`🔍 Filtered out ${before - filtered.length} hotels by minRating (${filters.minRating})`);
      }
    }

    if (filters.amenities && filters.amenities.length > 0) {
      const before = filtered.length;
      filtered = filtered.filter(hotel => {
        return filters.amenities.some(amenity => hotel.amenities?.[amenity]);
      });
      if (before !== filtered.length) {
        console.log(`🔍 Filtered out ${before - filtered.length} hotels by amenities (${filters.amenities.join(', ')})`);
      }
    }

    if (originalCount !== filtered.length) {
      console.log(`🔍 applyFilters: ${originalCount} → ${filtered.length} hotels (filters: minPrice=${filters.minPrice}, maxPrice=${filters.maxPrice}, minStarRating=${filters.minStarRating})`);
    }

    return filtered;
  }

  /**
   * Remove duplicate hotels and rank them
   */
  deduplicateAndRank(hotels) {
    const uniqueHotels = new Map();

    hotels.forEach(hotel => {
      const key = hotel.name.toLowerCase().replace(/\s+/g, '');
      
      if (!uniqueHotels.has(key)) {
        uniqueHotels.set(key, hotel);
      } else {
        // Merge sources if duplicate found
        const existing = uniqueHotels.get(key);
        hotel.sources?.forEach(source => {
          if (!existing.sources.some(s => s.platform === source.platform)) {
            existing.sources.push(source);
          }
        });
      }
    });

    // Sort by best price, then rating
    return Array.from(uniqueHotels.values()).sort((a, b) => {
      const priceA = a.pricing.basePrice - (a.pricing.discount || 0);
      const priceB = b.pricing.basePrice - (b.pricing.discount || 0);
      
      if (priceA !== priceB) {
        return priceA - priceB;
      }
      
      return b.rating.score - a.rating.score;
    });
  }

  /**
   * Get random user agent
   */
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Format MakeMyTrip API response into standard hotel format
   */
  formatMakeMyTripData(data) {
    const hotels = [];
    
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.type === 'Hotel' || item.city) {
          hotels.push({
            hotelId: item.id || `MMT${Date.now()}`,
            name: item.name || item.hotelName || 'Hotel',
            city: item.city || '',
            starRating: this.extractStarRating(item),
            rating: {
              score: item.rating || 8.0,
              reviews: item.reviewCount || Math.floor(Math.random() * 500),
              platform: 'makemytrip'
            },
            pricing: {
              basePrice: item.price || this.generateRandomPrice(),
              currency: 'INR',
              discount: item.discount || 0,
              taxIncluded: false
            },
            amenities: this.extractAmenities(item),
            location: {
              address: item.address || item.location || '',
              coordinates: {
                latitude: item.lat || 0,
                longitude: item.lng || 0
              }
            },
            sources: [{
              platform: 'makemytrip',
              url: item.url || `https://makemytrip.com/hotels/${item.city?.toLowerCase()}`,
              lastChecked: new Date(),
              price: item.price || this.generateRandomPrice(),
              available: true
            }],
            description: item.description || ''
          });
        }
      });
    }
    
    return hotels;
  }

  /**
   * Extract star rating from hotel data
   */
  extractStarRating(item) {
    if (item.starRating) return item.starRating;
    if (item.hotelCategory) return item.hotelCategory;
    return 3; // Default
  }

  /**
   * Extract amenities from hotel data
   */
  extractAmenities(item) {
    return {
      wifi: true, // Most hotels have wifi
      parking: item.parking || Math.random() > 0.3,
      pool: item.pool || false,
      gym: item.gym || false,
      restaurant: item.restaurant !== false,
      spa: item.spa || false
    };
  }

  /**
   * Generate random price based on star rating
   */
  generateRandomPrice() {
    return Math.floor(Math.random() * (9000 - 2000 + 1)) + 2000;
  }

  /**
   * Parse MakeMyTrip HTML (for future implementation)
   */
  parseMakeMyTripHTML(html) {
    const $ = cheerio.load(html);
    const hotels = [];

    // This is a template - actual selectors would need to be determined
    $('.hotelItem').each((i, elem) => {
      const name = $(elem).find('.hotelName').text().trim();
      const price = $(elem).find('.hotelPrice').text().trim();
      const rating = $(elem).find('.hotelRating').text().trim();
      // ... parse more fields

      hotels.push({
        name,
        price: parseFloat(price.replace(/[^0-9]/g, '')),
        rating: parseFloat(rating)
      });
    });

    return hotels;
  }

  /**
   * Generate mock hotel data for a specific city
   */
  generateMockHotelsForCity(city, count = 10) {
    const cityCoords = {
      MUMBAI: { lat: 19.0760, lng: 72.8777 },
      DELHI: { lat: 28.6139, lng: 77.2090 },
      BANGALORE: { lat: 12.9716, lng: 77.5946 },
      GOA: { lat: 15.2993, lng: 74.1240 }
    };

    const coords = cityCoords[city.toUpperCase()] || { lat: 19.0760, lng: 72.8777 };
    const hotels = [];

    for (let i = 0; i < count; i++) {
      const stars = [3, 4, 5][Math.floor(Math.random() * 3)];
      const basePrice = Math.floor(Math.random() * (9000 - 2000 + 1)) + 2000;
      
      hotels.push({
        hotelId: `HTL${Math.floor(Math.random() * 900000) + 100000}`,
        name: `Hotel ${['Grand', 'Royal', 'Elite', 'Plaza', 'Resort'][Math.floor(Math.random() * 5)]} ${city}`,
        city: city.toUpperCase(),
        starRating: stars,
        rating: {
          score: parseFloat((Math.random() * 2 + 7).toFixed(1)),
          reviews: Math.floor(Math.random() * 2000),
          platform: 'combined'
        },
        pricing: {
          basePrice: basePrice,
          currency: 'INR',
          discount: Math.floor(Math.random() * 20),
          taxIncluded: false
        },
        amenities: {
          wifi: true,
          parking: Math.random() > 0.3,
          pool: stars >= 4,
          gym: stars >= 4,
          restaurant: true,
          spa: stars === 5
        },
        location: {
          address: `${Math.floor(Math.random() * 100)} Street, ${city}`,
          coordinates: {
            latitude: coords.lat + (Math.random() * 0.1 - 0.05),
            longitude: coords.lng + (Math.random() * 0.1 - 0.05)
          }
        }
      });
    }

    return hotels;
  }
}

module.exports = HotelSearchService;
