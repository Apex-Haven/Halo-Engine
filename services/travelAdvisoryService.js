const Hotel = require('../models/Hotel');
const rapidApiHotelService = require('./rapidApiHotelService');
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
        console.warn('⚠️ No hotels found from RapidAPI or database. Please check your RapidAPI configuration.');
        // Don't generate mock hotels - return empty results instead
      }

      // Step 2: Skip scoring - just return all hotels directly
      console.log(`📊 Returning ${hotels.length} hotels directly (scoring disabled)`);
      
      // Format hotels as recommendations without any scoring
      const recommendations = hotels.map((hotel, index) => {
        // Extract booking links from hotel sources or bookingLinks
        const bookingLinks = hotel.bookingLinks || {};
        if (hotel.sources && hotel.sources.length > 0) {
          hotel.sources.forEach(source => {
            if (source.url && source.url !== '#') {
              bookingLinks[source.platform] = source.url;
            }
          });
        }
        
        // Ensure we have at least the Agoda link
        if (!bookingLinks.agoda && hotel.sources?.[0]?.url) {
          bookingLinks.agoda = hotel.sources[0].url;
        }
        
        return {
          hotelId: hotel._id || hotel.hotelId,
          hotel: hotel,
          relevanceScore: 50,
          priceMatch: 50,
          amenitiesMatch: 100,
          starRatingMatch: true,
          distanceFromConference: null,
          distanceFromTargetArea: null,
          withinConferenceRadius: true,
          scores: {},
          bookingLinks: bookingLinks,
          prices: hotel.pricing ? {
            basePrice: hotel.pricing.basePrice,
            currency: hotel.pricing.currency,
            discount: hotel.pricing.discount || 0
          } : {},
          card: hotel.card || null
        };
      });

      console.log(`✅ Generated ${recommendations.length} recommendations (no scoring)`);

      return {
        success: true,
        totalHotelsFound: hotels.length,
        recommendationsGenerated: recommendations.length,
        recommendations: recommendations,
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

      // Search hotels using RapidAPI
      console.log('🔍 Searching RapidAPI for hotels in:', searchCity);
      const allHotels = [];
      
      // Build RapidAPI filters
      const rapidApiFilters = {
        checkInDate: preferences.checkInDate,
        checkOutDate: preferences.checkOutDate,
        adults: 2,
        rooms: 1,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minStarRating: filters.minStarRating,
        currency: preferences.currency || 'INR'
      };

      // Search primary city
      const rapidApiResults = await rapidApiHotelService.searchHotels(searchCity, rapidApiFilters);
      if (rapidApiResults.hotels && rapidApiResults.hotels.length > 0) {
        console.log(`✅ Found ${rapidApiResults.hotels.length} hotels from RapidAPI for ${searchCity}`);
        allHotels.push(...rapidApiResults.hotels);
      }

      // If we have multiple target areas, search in each
      if (preferences.targetAreas && preferences.targetAreas.length > 1) {
        console.log(`🔍 Searching additional areas: ${preferences.targetAreas.slice(1).join(', ')}`);
        const additionalSearches = await Promise.all(
          preferences.targetAreas.slice(1).map(area => 
            rapidApiHotelService.searchHotels(area, rapidApiFilters)
          )
        );

        // Merge results
        additionalSearches.forEach((result, index) => {
          if (result.hotels && result.hotels.length > 0) {
            console.log(`✅ Found ${result.hotels.length} hotels from RapidAPI for ${preferences.targetAreas[index + 1]}`);
            allHotels.push(...result.hotels);
          }
        });
      }

      // Also search in database for stored hotels (as backup)
      console.log('🔍 Searching database for hotels');
      const dbHotels = await this.searchDatabaseHotels(preferences, filters);
      if (dbHotels.length > 0) {
        console.log(`✅ Found ${dbHotels.length} hotels from database`);
        allHotels.push(...dbHotels);
      }

      // Remove duplicates
      const uniqueHotels = this.deduplicateHotels(allHotels);
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
      // Use regex for flexible matching (case-insensitive, partial match)
      if (preferences.targetAreas && preferences.targetAreas.length > 0) {
        if (preferences.targetAreas.length === 1) {
          // Single area - use regex directly
          query.city = new RegExp(preferences.targetAreas[0].trim(), 'i');
        } else {
          // Multiple areas - use $or with regex
          query.$or = preferences.targetAreas.map(area => ({
            city: new RegExp(area.trim(), 'i')
          }));
        }
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
    
    if (hotels.length === 0) {
      console.warn('⚠️ No hotels to score!');
      return [];
    }

    for (let i = 0; i < hotels.length; i++) {
      const hotel = hotels[i];
      try {
        if (!hotel) {
          console.warn(`⚠️ Hotel at index ${i} is null/undefined, skipping`);
          continue;
        }
        
        console.log(`📊 Processing hotel ${i + 1}/${hotels.length}: ${hotel.name || 'Unknown'}`);
        
      const scores = {
        priceMatch: this.calculatePriceMatch(hotel, preferences),
        amenitiesMatch: this.calculateAmenitiesMatch(hotel, preferences),
        starRatingMatch: this.calculateStarRatingMatch(hotel, preferences),
        locationMatch: await this.calculateLocationMatch(hotel, preferences),
        conferenceProximity: this.calculateConferenceProximity(hotel, preferences)
      };

      // Calculate overall relevance score (weighted average)
      let relevanceScore = this.calculateRelevanceScore(scores, preferences);
      
      // Ensure relevanceScore is a valid number
      if (isNaN(relevanceScore) || relevanceScore === null || relevanceScore === undefined) {
        console.warn(`⚠️ Invalid relevance score for hotel ${hotel.name}, defaulting to 50`);
        relevanceScore = 50; // Default score if calculation fails
      }

      // Log first few hotels for debugging
      if (scoredHotels.length < 3) {
        console.log(`📊 Hotel scoring [${scoredHotels.length}]:`, {
          name: hotel.name,
          city: hotel.city,
          price: hotel.pricing?.basePrice,
          currency: hotel.pricing?.currency,
          scores: {
            priceMatch: Math.round(scores.priceMatch * 100) / 100,
            amenitiesMatch: Math.round(scores.amenitiesMatch * 100) / 100,
            starRatingMatch: scores.starRatingMatch,
            locationMatch: Math.round(scores.locationMatch.score * 100) / 100,
            conferenceProximity: Math.round(scores.conferenceProximity.score * 100) / 100
          },
          relevanceScore: Math.round(relevanceScore * 100) / 100
        });
      }

      // Only include hotels that meet minimum criteria
      // Very low threshold to ensure we get results (can be adjusted later)
      // Accept all hotels with relevanceScore >= 0 (which should be all hotels)
      // Also accept if relevanceScore is a valid number (even if negative, we'll include it)
      if (typeof relevanceScore === 'number' && !isNaN(relevanceScore) && relevanceScore >= 0) {
        // Get booking links and card if available
        const bookingLinks = hotel.bookingLinks || {};
        const prices = hotel.prices || {};
        const card = hotel.card || null;

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
          bookingLinks: bookingLinks,
          prices: prices,
          card: card
        });
      } else {
        // Log why a hotel was filtered out (shouldn't happen with current scoring)
        console.warn(`⚠️ Hotel filtered out: ${hotel.name}, relevanceScore: ${relevanceScore} (type: ${typeof relevanceScore})`);
        // Safety net: include hotel anyway if it has basic data
        if (hotel.name && hotel.pricing?.basePrice !== undefined) {
          console.log(`🔄 Including hotel anyway as safety net: ${hotel.name}`);
          const bookingLinks = hotel.bookingLinks || {};
          const prices = hotel.prices || {};
          const card = hotel.card || null;
          
          scoredHotels.push({
            hotelId: hotel._id || hotel.hotelId,
            hotel: hotel,
            relevanceScore: 50, // Default score
            priceMatch: Math.round(scores.priceMatch * 100) / 100,
            amenitiesMatch: Math.round(scores.amenitiesMatch * 100) / 100,
            starRatingMatch: scores.starRatingMatch,
            distanceFromConference: scores.conferenceProximity.distance,
            distanceFromTargetArea: scores.locationMatch.distance,
            withinConferenceRadius: scores.conferenceProximity.withinRadius,
            scores: scores,
            bookingLinks: bookingLinks,
            prices: prices,
            card: card
          });
        }
      }
      } catch (error) {
        console.error(`❌ Error scoring hotel ${hotel.name || hotel.hotelId}:`, error.message);
        // Include hotel anyway with default score
        scoredHotels.push({
          hotelId: hotel._id || hotel.hotelId,
          hotel: hotel,
          relevanceScore: 50,
          priceMatch: 50,
          amenitiesMatch: 100,
          starRatingMatch: true,
          distanceFromConference: null,
          distanceFromTargetArea: null,
          withinConferenceRadius: true,
          scores: {},
          bookingLinks: hotel.bookingLinks || {},
          prices: hotel.prices || {},
          card: hotel.card || null
        });
      }
    }
    
    console.log(`✅ Finished scoring: ${scoredHotels.length} hotels included out of ${hotels.length} total`);

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
    const hotelCity = (hotel.city || '').toUpperCase();
    const targetAreasUpper = preferences.targetAreas.map(area => area.toUpperCase());

    // If we have coordinates, try to calculate actual distance
    if (hotelCoords && hotelCoords.latitude && hotelCoords.longitude) {
      // For now, if we have coordinates, give a reasonable score
      // In a full implementation, you'd geocode target areas and calculate distances
      const hasCityMatch = targetAreasUpper.some(area => 
        hotelCity.includes(area) || area.includes(hotelCity) || hotelCity === area
      );
      
      if (hasCityMatch) {
        return { score: 100, distance: 0 };
      }
      
      // Even without city match, if we have coordinates, give a decent score
      return { score: 60, distance: null };
    }

    // No coordinates - use city matching
    if (targetAreasUpper.includes(hotelCity)) {
      return { score: 100, distance: 0 };
    }

    // Partial match (contains city name)
    const partialMatch = targetAreasUpper.some(area => 
      hotelCity.includes(area) || area.includes(hotelCity)
    );

    // More lenient scoring - even if city doesn't match exactly, give some score
    if (partialMatch) {
      return { score: 70, distance: 5 }; // Estimated 5km
    }
    
    // If city is "UNKNOWN" or empty, but we have coordinates, still give a score
    if ((!hotelCity || hotelCity === 'UNKNOWN') && hotelCoords) {
      return { score: 60, distance: null };
    }
    
    // Default: give a lower but non-zero score to avoid filtering out all hotels
    return { score: 50, distance: 20 }; // Estimated 20km
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
    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 50; // Default to 50 if no weights
    
    // Ensure we return a valid number between 0-100
    if (isNaN(finalScore) || finalScore === null || finalScore === undefined) {
      console.warn('⚠️ calculateRelevanceScore returned invalid value, defaulting to 50');
      return 50;
    }
    
    return Math.max(0, Math.min(100, finalScore)); // Clamp between 0-100
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
   * Get approximate coordinates for a country/city
   */
  getApproximateCoordinates(country, city) {
    // Common city/country coordinates mapping
    const coordinatesMap = {
      'mexico': { latitude: 19.4326, longitude: -99.1332 }, // Mexico City
      'mexico city': { latitude: 19.4326, longitude: -99.1332 },
      'india': { latitude: 28.6139, longitude: 77.2090 }, // New Delhi
      'mumbai': { latitude: 19.0760, longitude: 72.8777 },
      'delhi': { latitude: 28.6139, longitude: 77.2090 },
      'bangalore': { latitude: 12.9716, longitude: 77.5946 },
      'usa': { latitude: 40.7128, longitude: -74.0060 }, // New York
      'united states': { latitude: 40.7128, longitude: -74.0060 },
      'uk': { latitude: 51.5074, longitude: -0.1278 }, // London
      'united kingdom': { latitude: 51.5074, longitude: -0.1278 },
      'london': { latitude: 51.5074, longitude: -0.1278 },
      'france': { latitude: 48.8566, longitude: 2.3522 }, // Paris
      'paris': { latitude: 48.8566, longitude: 2.3522 },
      'germany': { latitude: 52.5200, longitude: 13.4050 }, // Berlin
      'berlin': { latitude: 52.5200, longitude: 13.4050 },
      'dubai': { latitude: 25.2048, longitude: 55.2708 },
      'uae': { latitude: 25.2048, longitude: 55.2708 },
      'singapore': { latitude: 1.3521, longitude: 103.8198 },
      'thailand': { latitude: 13.7563, longitude: 100.5018 }, // Bangkok
      'bangkok': { latitude: 13.7563, longitude: 100.5018 }
    };

    const searchKey = (city || country || '').toLowerCase().trim();
    return coordinatesMap[searchKey] || coordinatesMap[country?.toLowerCase()?.trim()] || { latitude: 19.4326, longitude: -99.1332 }; // Default to Mexico City
  }

  /**
   * @deprecated - No longer generating mock hotels
   * This method is kept for backward compatibility but returns empty array
   */
  async generateFallbackHotels(preferences) {
    console.warn('⚠️ generateFallbackHotels is deprecated. Use RapidAPI for real hotel data.');
    return [];
  }

  /**
   * @deprecated - CozyCozy is no longer supported
   * Use RapidAPI for hotel search instead
   */
  async searchCozyCozyHotels(preferences, searchCity) {
    console.warn('⚠️ searchCozyCozyHotels is deprecated. Use RapidAPI instead.');
    return [];
  }
}

module.exports = new TravelAdvisoryService();

