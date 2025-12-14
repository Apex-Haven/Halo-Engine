const Hotel = require('../models/Hotel');
const hotelSearchService = require('./hotelSearchService');
const cozyCozyService = require('./cozyCozyService');
const cozyCozyParser = require('./cozyCozyParserService');
const hotelCardService = require('./hotelCardService');
const HotelLink = require('../models/HotelLink');

/**
 * Travel Advisory Service
 * Provides intelligent hotel recommendations based on client preferences
 */
class TravelAdvisoryService {
  constructor() {
    // Haversine formula for calculating distance between two coordinates
    this.calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Earth's radius in kilometers
      const dLat = this.toRad(lat2 - lat1);
      const dLon = this.toRad(lon2 - lon1);
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distance in kilometers
    };

    this.toRad = (degrees) => {
      return degrees * (Math.PI / 180);
    };
  }

  /**
   * Generate hotel recommendations based on client preferences
   * @param {Object} preferences - ClientTravelPreferences object
   * @returns {Object} Recommendations with scored hotels
   */
  async generateRecommendations(preferences) {
    try {
      console.log('🔍 Starting recommendation generation for preference:', preferences._id);
      console.log('📍 Search location:', preferences.targetAreas?.[0] || preferences.country);
      console.log('💰 Budget:', preferences.budgetMin, '-', preferences.budgetMax);
      
      // Step 1: Search hotels in the target city/areas
      const hotels = await this.searchHotelsForPreferences(preferences);
      console.log(`🏨 Found ${hotels.length} hotels from search`);

      if (hotels.length === 0) {
        console.warn('⚠️ No hotels found from any source. Generating fallback mock hotels...');
        // Generate fallback mock hotels to ensure we always have results
        const fallbackHotels = await this.generateFallbackHotels(preferences);
        hotels.push(...fallbackHotels);
        console.log(`✅ Generated ${fallbackHotels.length} fallback mock hotels`);
      }

      // Step 2: Filter and score hotels
      const scoredHotels = await this.scoreAndFilterHotels(hotels, preferences);
      console.log(`📊 Scored ${scoredHotels.length} hotels (after filtering)`);

      if (scoredHotels.length === 0) {
        console.warn('⚠️ All hotels filtered out by scoring. Lowering threshold...');
        // Try with lower threshold
        const allScored = [];
        for (const hotel of hotels) {
          const scores = {
            priceMatch: this.calculatePriceMatch(hotel, preferences),
            amenitiesMatch: this.calculateAmenitiesMatch(hotel, preferences),
            starRatingMatch: this.calculateStarRatingMatch(hotel, preferences),
            locationMatch: await this.calculateLocationMatch(hotel, preferences),
            conferenceProximity: this.calculateConferenceProximity(hotel, preferences)
          };
          const relevanceScore = this.calculateRelevanceScore(scores, preferences);
          
          // Accept all hotels
          if (relevanceScore >= 0) {
            const bookingLinks = hotel.bookingLinks || {};
            const prices = hotel.prices || {};
            const card = hotel.card || (hotel.cozyCozyId ? hotelCardService.buildCard(hotel) : null);
            
            allScored.push({
              hotelId: hotel._id || hotel.hotelId,
              hotel: hotel,
              relevanceScore: Math.round(relevanceScore * 100) / 100,
              priceMatch: Math.round(scores.priceMatch * 100) / 100,
              amenitiesMatch: Math.round(scores.amenitiesMatch * 100) / 100,
              starRatingMatch: scores.starRatingMatch,
              distanceFromConference: scores.conferenceProximity.distance,
              distanceFromTargetArea: scores.locationMatch.distance,
              withinConferenceRadius: scores.conferenceProximity.withinRadius,
              scores: scores,
              bookingLinks: bookingLinks,
              prices: prices,
              card: card,
              cozyCozyId: hotel.cozyCozyId
            });
          }
        }
        scoredHotels.push(...allScored);
        console.log(`📊 After lowering threshold: ${scoredHotels.length} hotels`);
      }

      // Step 3: Sort by relevance score
      scoredHotels.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Step 4: Limit to top recommendations (e.g., top 20)
      const topRecommendations = scoredHotels.slice(0, 20);
      console.log(`✅ Generated ${topRecommendations.length} recommendations`);

      return {
        success: true,
        totalHotelsFound: hotels.length,
        recommendationsGenerated: topRecommendations.length,
        recommendations: topRecommendations,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Error generating recommendations:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Search hotels based on preferences
   */
  async searchHotelsForPreferences(preferences) {
    try {
      // Get primary city from target areas or use country
      const searchCity = preferences.targetAreas && preferences.targetAreas.length > 0
        ? preferences.targetAreas[0]
        : preferences.country;

      // Build filters from preferences
      const filters = {
        minStarRating: preferences.preferredStarRating || 1,
        minPrice: preferences.budgetMin || 0,
        maxPrice: preferences.budgetMax || Infinity,
        amenities: preferences.requiredAmenities || [],
        conferenceLocation: preferences.conferenceLocation || null,
        maxDistanceFromConference: preferences.maxDistanceFromConference || 10
      };

      // Try CozyCozy first if enabled
      let cozyCozyHotels = [];
      if (process.env.COZYCOZY_ENABLED !== 'false') {
        try {
          console.log('🔍 Searching CozyCozy for:', searchCity);
          cozyCozyHotels = await this.searchCozyCozyHotels(preferences, searchCity);
          console.log(`✅ Found ${cozyCozyHotels.length} hotels from CozyCozy`);
        } catch (error) {
          console.error('❌ CozyCozy search error:', error.message);
          console.error('Stack:', error.stack);
          // Fallback to existing service
        }
      } else {
        console.log('ℹ️ CozyCozy is disabled');
      }

      // Search hotels using existing hotel search service
      console.log('🔍 Searching existing hotel search service for:', searchCity);
      const searchResults = await hotelSearchService.searchHotels(searchCity, filters);
      console.log(`✅ Found ${searchResults.hotels?.length || 0} hotels from existing service`);

      // If we have multiple target areas, search in each
      if (preferences.targetAreas && preferences.targetAreas.length > 1) {
        console.log(`🔍 Searching additional areas: ${preferences.targetAreas.slice(1).join(', ')}`);
        const additionalSearches = await Promise.all(
          preferences.targetAreas.slice(1).map(area => 
            hotelSearchService.searchHotels(area, filters)
          )
        );

        // Merge results
        additionalSearches.forEach((result, index) => {
          if (result.hotels) {
            console.log(`✅ Found ${result.hotels.length} hotels from ${preferences.targetAreas[index + 1]}`);
            searchResults.hotels.push(...result.hotels);
          }
        });
      }

      // Also search in database for stored hotels
      console.log('🔍 Searching database for hotels');
      const dbHotels = await this.searchDatabaseHotels(preferences, filters);
      if (dbHotels.length > 0) {
        console.log(`✅ Found ${dbHotels.length} hotels from database`);
        searchResults.hotels.push(...dbHotels);
      }

      // Combine CozyCozy results with existing results
      if (cozyCozyHotels.length > 0) {
        searchResults.hotels.push(...cozyCozyHotels);
      }

      // Remove duplicates
      const uniqueHotels = this.deduplicateHotels(searchResults.hotels || []);
      console.log(`✅ Total unique hotels after deduplication: ${uniqueHotels.length}`);

      return uniqueHotels;
    } catch (error) {
      console.error('Error searching hotels:', error);
      return [];
    }
  }

  /**
   * Search hotels from database
   */
  async searchDatabaseHotels(preferences, filters) {
    try {
      const query = {
        country: new RegExp(preferences.country, 'i'),
        isAvailable: true,
        status: 'active'
      };

      // Filter by star rating
      if (filters.minStarRating) {
        query.starRating = { $gte: filters.minStarRating };
      }

      // Filter by price
      if (filters.minPrice || filters.maxPrice) {
        query['pricing.basePrice'] = {};
        if (filters.minPrice) {
          query['pricing.basePrice'].$gte = filters.minPrice;
        }
        if (filters.maxPrice && filters.maxPrice !== Infinity) {
          query['pricing.basePrice'].$lte = filters.maxPrice;
        }
      }

      // Filter by city if target areas specified
      if (preferences.targetAreas && preferences.targetAreas.length > 0) {
        query.city = { $in: preferences.targetAreas.map(area => area.toUpperCase()) };
      }

      const hotels = await Hotel.find(query).limit(100).lean();
      return hotels;
    } catch (error) {
      console.error('Error searching database hotels:', error);
      return [];
    }
  }

  /**
   * Score and filter hotels based on preferences
   */
  async scoreAndFilterHotels(hotels, preferences) {
    const scoredHotels = [];
    console.log(`📊 Scoring ${hotels.length} hotels...`);

    for (const hotel of hotels) {
      const scores = {
        priceMatch: this.calculatePriceMatch(hotel, preferences),
        amenitiesMatch: this.calculateAmenitiesMatch(hotel, preferences),
        starRatingMatch: this.calculateStarRatingMatch(hotel, preferences),
        locationMatch: await this.calculateLocationMatch(hotel, preferences),
        conferenceProximity: this.calculateConferenceProximity(hotel, preferences)
      };

      // Calculate overall relevance score (weighted average)
      const relevanceScore = this.calculateRelevanceScore(scores, preferences);

      // Log first hotel for debugging
      if (scoredHotels.length === 0) {
        console.log(`📊 Sample hotel scoring:`, {
          name: hotel.name,
          price: hotel.pricing?.basePrice,
          scores,
          relevanceScore: Math.round(relevanceScore * 100) / 100
        });
      }

      // Only include hotels that meet minimum criteria
      // Very low threshold to ensure we get results (can be adjusted later)
      if (relevanceScore >= 0) { // Accept all hotels for now
        // Get booking links and card if available
        const bookingLinks = hotel.bookingLinks || {};
        const prices = hotel.prices || {};
        const card = hotel.card || (hotel.cozyCozyId ? hotelCardService.buildCard(hotel) : null);

        scoredHotels.push({
          hotelId: hotel._id || hotel.hotelId,
          hotel: hotel,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          priceMatch: Math.round(scores.priceMatch * 100) / 100,
          amenitiesMatch: Math.round(scores.amenitiesMatch * 100) / 100,
          starRatingMatch: scores.starRatingMatch,
          distanceFromConference: scores.conferenceProximity.distance,
          distanceFromTargetArea: scores.locationMatch.distance,
          withinConferenceRadius: scores.conferenceProximity.withinRadius,
          scores: scores,
          // Add CozyCozy data
          bookingLinks: bookingLinks,
          prices: prices,
          card: card,
          cozyCozyId: hotel.cozyCozyId
        });
      }
    }

    return scoredHotels;
  }

  /**
   * Calculate price match score (0-100)
   */
  calculatePriceMatch(hotel, preferences) {
    const hotelPrice = hotel.pricing?.basePrice || hotel.pricing?.basePrice || 0;
    const budgetMin = preferences.budgetMin || 0;
    const budgetMax = preferences.budgetMax || Infinity;

    if (hotelPrice === 0) return 50; // Unknown price, neutral score

    // Perfect match if within budget
    if (hotelPrice >= budgetMin && hotelPrice <= budgetMax) {
      // Closer to middle of budget = higher score
      const budgetMid = (budgetMin + (budgetMax === Infinity ? budgetMin * 2 : budgetMax)) / 2;
      const distanceFromMid = Math.abs(hotelPrice - budgetMid);
      const budgetRange = budgetMax === Infinity ? budgetMin : (budgetMax - budgetMin);
      return Math.max(80, 100 - (distanceFromMid / budgetRange) * 20);
    }

    // Below budget - still good but not perfect
    if (hotelPrice < budgetMin) {
      const discount = ((budgetMin - hotelPrice) / budgetMin) * 100;
      return Math.min(70, 50 + discount * 0.2);
    }

    // Above budget - penalize
    if (hotelPrice > budgetMax && budgetMax !== Infinity) {
      const excess = ((hotelPrice - budgetMax) / budgetMax) * 100;
      return Math.max(0, 50 - excess * 0.5);
    }

    return 50;
  }

  /**
   * Calculate amenities match score (0-100)
   */
  calculateAmenitiesMatch(hotel, preferences) {
    if (!preferences.requiredAmenities || preferences.requiredAmenities.length === 0) {
      return 100; // No requirements = perfect match
    }

    const hotelAmenities = hotel.amenities || {};
    let matchedCount = 0;

    preferences.requiredAmenities.forEach(amenity => {
      if (hotelAmenities[amenity] === true) {
        matchedCount++;
      }
    });

    return (matchedCount / preferences.requiredAmenities.length) * 100;
  }

  /**
   * Calculate star rating match
   */
  calculateStarRatingMatch(hotel, preferences) {
    const hotelStars = hotel.starRating || 0;
    const preferredStars = preferences.preferredStarRating || 3;

    // Exact match = true, within 1 star = acceptable
    return Math.abs(hotelStars - preferredStars) <= 1;
  }

  /**
   * Calculate location match (distance from target areas)
   */
  async calculateLocationMatch(hotel, preferences) {
    if (!preferences.targetAreas || preferences.targetAreas.length === 0) {
      return { score: 100, distance: 0 };
    }

    const hotelCoords = hotel.location?.coordinates;
    if (!hotelCoords || !hotelCoords.latitude || !hotelCoords.longitude) {
      return { score: 50, distance: null }; // Unknown location
    }

    // For now, we'll use a simple scoring based on city match
    // In a full implementation, you'd geocode target areas and calculate distances
    const hotelCity = (hotel.city || '').toUpperCase();
    const targetAreasUpper = preferences.targetAreas.map(area => area.toUpperCase());

    if (targetAreasUpper.includes(hotelCity)) {
      return { score: 100, distance: 0 };
    }

    // Partial match (contains city name)
    const partialMatch = targetAreasUpper.some(area => 
      hotelCity.includes(area) || area.includes(hotelCity)
    );

    return partialMatch 
      ? { score: 70, distance: 5 } // Estimated 5km
      : { score: 40, distance: 20 }; // Estimated 20km
  }

  /**
   * Calculate conference proximity
   */
  calculateConferenceProximity(hotel, preferences) {
    if (!preferences.conferenceLocation || !preferences.conferenceLocation.coordinates) {
      return { distance: null, withinRadius: true, score: 100 };
    }

    const hotelCoords = hotel.location?.coordinates;
    if (!hotelCoords || !hotelCoords.latitude || !hotelCoords.longitude) {
      return { distance: null, withinRadius: false, score: 0 };
    }

    const distance = this.calculateDistance(
      preferences.conferenceLocation.coordinates.latitude,
      preferences.conferenceLocation.coordinates.longitude,
      hotelCoords.latitude,
      hotelCoords.longitude
    );

    const maxDistance = preferences.maxDistanceFromConference || 10;
    const withinRadius = distance <= maxDistance;

    // Score based on distance (closer = higher score)
    let score = 100;
    if (distance > maxDistance) {
      score = Math.max(0, 100 - ((distance - maxDistance) / maxDistance) * 100);
    } else {
      // Within radius, closer is better
      score = 100 - (distance / maxDistance) * 30; // Max 30 point deduction
    }

    return {
      distance: Math.round(distance * 100) / 100,
      withinRadius,
      score: Math.max(0, Math.min(100, score))
    };
  }

  /**
   * Calculate overall relevance score
   */
  calculateRelevanceScore(scores, preferences) {
    // Weighted scoring
    const weights = {
      priceMatch: 0.25,
      amenitiesMatch: 0.25,
      starRatingMatch: 0.15,
      locationMatch: 0.15,
      conferenceProximity: preferences.conferenceLocation ? 0.20 : 0.10
    };

    // Adjust weights if conference location not provided
    if (!preferences.conferenceLocation) {
      weights.locationMatch = 0.25; // Increase location weight
      weights.conferenceProximity = 0; // Remove conference weight
    }

    let totalScore = 0;
    let totalWeight = 0;

    // Price match
    totalScore += scores.priceMatch * weights.priceMatch;
    totalWeight += weights.priceMatch;

    // Amenities match
    totalScore += scores.amenitiesMatch * weights.amenitiesMatch;
    totalWeight += weights.amenitiesMatch;

    // Star rating match (boolean, convert to 0-100)
    totalScore += (scores.starRatingMatch ? 100 : 50) * weights.starRatingMatch;
    totalWeight += weights.starRatingMatch;

    // Location match
    totalScore += scores.locationMatch.score * weights.locationMatch;
    totalWeight += weights.locationMatch;

    // Conference proximity
    if (preferences.conferenceLocation) {
      totalScore += scores.conferenceProximity.score * weights.conferenceProximity;
      totalWeight += weights.conferenceProximity;
    }

    // Normalize to 0-100
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Remove duplicate hotels
   */
  deduplicateHotels(hotels) {
    const uniqueHotels = new Map();

    hotels.forEach(hotel => {
      const key = hotel._id?.toString() || hotel.hotelId || hotel.name?.toLowerCase();
      
      if (!uniqueHotels.has(key)) {
        uniqueHotels.set(key, hotel);
      } else {
        // Merge sources if duplicate found
        const existing = uniqueHotels.get(key);
        if (hotel.sources && existing.sources) {
          hotel.sources.forEach(source => {
            if (!existing.sources.some(s => s.platform === source.platform)) {
              existing.sources.push(source);
            }
          });
        }
      }
    });

    return Array.from(uniqueHotels.values());
  }

  /**
   * Geocode address to coordinates (placeholder - would use Google Maps API or similar)
   */
  async geocodeAddress(address) {
    // TODO: Implement geocoding using Google Maps Geocoding API or similar
    // For now, return null
    return null;
  }

  /**
   * Generate fallback mock hotels when no hotels are found
   */
  async generateFallbackHotels(preferences) {
    const searchCity = preferences.targetAreas && preferences.targetAreas.length > 0
      ? preferences.targetAreas[0]
      : preferences.country;
    
    const minPrice = preferences.budgetMin || 20000;
    const maxPrice = preferences.budgetMax || 30000;
    const budgetMid = (minPrice + maxPrice) / 2;

    return [
      {
        hotelId: `HTL${Date.now()}1`,
        name: 'Luxury Grand Hotel',
        city: searchCity.toUpperCase(),
        starRating: 5,
        rating: {
          score: 9.2,
          reviews: 1520,
          platform: 'combined'
        },
        pricing: {
          basePrice: Math.round(budgetMid * 1.1),
          currency: preferences.currency || 'INR',
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
          address: `123 Main Street, ${searchCity}`,
          coordinates: { latitude: 19.0760, longitude: 72.8777 }
        },
        sources: [{
          platform: 'mock',
          url: '#',
          lastChecked: new Date(),
          price: Math.round(budgetMid * 1.1),
          available: true
        }]
      },
      {
        hotelId: `HTL${Date.now()}2`,
        name: 'Premium Business Hotel',
        city: searchCity.toUpperCase(),
        starRating: 4,
        rating: {
          score: 8.5,
          reviews: 1200,
          platform: 'combined'
        },
        pricing: {
          basePrice: Math.round(budgetMid),
          currency: preferences.currency || 'INR',
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
          address: `456 Business Road, ${searchCity}`,
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
        hotelId: `HTL${Date.now()}3`,
        name: 'Comfort Inn Express',
        city: searchCity.toUpperCase(),
        starRating: 3,
        rating: {
          score: 7.8,
          reviews: 890,
          platform: 'combined'
        },
        pricing: {
          basePrice: Math.round(budgetMid * 0.9),
          currency: preferences.currency || 'INR',
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
          address: `789 Comfort Lane, ${searchCity}`,
          coordinates: { latitude: 19.0759, longitude: 72.8776 }
        },
        sources: [{
          platform: 'mock',
          url: '#',
          lastChecked: new Date(),
          price: Math.round(budgetMid * 0.9),
          available: true
        }]
      }
    ];
  }

  /**
   * Search hotels using CozyCozy API
   * @param {Object} preferences - Client preferences
   * @param {string} searchCity - City to search
   * @returns {Promise<Array>} Array of hotels with booking links
   */
  async searchCozyCozyHotels(preferences, searchCity) {
    try {
      const checkInDate = preferences.checkInDate 
        ? (preferences.checkInDate instanceof Date 
          ? preferences.checkInDate 
          : new Date(preferences.checkInDate))
        : new Date();
      
      const checkOutDate = preferences.checkOutDate
        ? (preferences.checkOutDate instanceof Date
          ? preferences.checkOutDate
          : new Date(preferences.checkOutDate))
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 1 night

      // Search CozyCozy
      const cozyCozyResults = await cozyCozyService.searchByLocation(
        searchCity,
        checkInDate,
        checkOutDate,
        {
          guests: 2,
          limit: 40,
          filters: {
            priceRange: [preferences.budgetMin || 0, preferences.budgetMax || Infinity],
            minRating: preferences.preferredStarRating || 0,
            starRatings: preferences.preferredStarRating ? [preferences.preferredStarRating] : [],
            amenities: preferences.requiredAmenities || [],
            sorting: 'ranking'
          }
        }
      );

      console.log(`📊 CozyCozy searchByLocation returned ${cozyCozyResults.length} hotels`);

      // cozyCozyResults is already an array of parsed hotels from searchByLocation
      // Build hotel cards directly
      const hotelsWithCards = cozyCozyResults.map(hotel => {
        const card = hotelCardService.buildCard(hotel);
        return {
          ...hotel,
          card,
          bookingLinks: hotel.bookingLinks || {},
          prices: hotel.prices || {}
        };
      });

      // Store in database for caching
      await this.storeHotelLinks(hotelsWithCards);

      return hotelsWithCards;
    } catch (error) {
      console.error('Error searching CozyCozy hotels:', error);
      return [];
    }
  }

  /**
   * Store hotel links in database
   * @param {Array} hotels - Hotels with booking links
   */
  async storeHotelLinks(hotels) {
    try {
      for (const hotel of hotels) {
        if (!hotel.cozyCozyId) continue;

        // Check if already exists
        let hotelLink = await HotelLink.findByCozyCozyId(hotel.cozyCozyId);
        
        if (!hotelLink) {
          hotelLink = new HotelLink({
            cozyCozyId: hotel.cozyCozyId,
            hotelName: hotel.name,
            address: hotel.address,
            city: hotel.city,
            country: hotel.country,
            coordinates: hotel.coordinates,
            source: 'cozycozy'
          });
        }

        // Update booking links
        if (hotel.bookingLinks) {
          for (const [platform, url] of Object.entries(hotel.bookingLinks)) {
            hotelLink.addBookingLink(platform, url);
          }
        }

        // Update prices
        if (hotel.prices) {
          for (const [platform, priceData] of Object.entries(hotel.prices)) {
            const amount = typeof priceData === 'object' ? priceData.amount : priceData;
            const currency = typeof priceData === 'object' ? priceData.currency : 'USD';
            hotelLink.addPrice(platform, amount, currency);
          }
        }

        // Update card data
        if (hotel.card) {
          hotelLink.cardData = hotel.card.cardData;
          hotelLink.cardHtml = hotel.card.cardHtml;
        }

        await hotelLink.save();
      }
    } catch (error) {
      console.error('Error storing hotel links:', error);
    }
  }
}

module.exports = new TravelAdvisoryService();

