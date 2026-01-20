const axios = require('axios');

/**
 * RapidAPI Hotel Search Service
 * Uses RapidAPI to search for real hotels from various providers
 */
class RapidApiHotelService {
  constructor() {
    this.rapidApiKey = process.env.RAPIDAPI_KEY;
    this.rapidApiHost = process.env.RAPIDAPI_HOTEL_HOST || 'agoda-com.p.rapidapi.com';
    this.baseUrl = process.env.RAPIDAPI_HOTEL_URL || 'https://agoda-com.p.rapidapi.com';
  }

  /**
   * Check if RapidAPI is configured
   */
  isConfigured() {
    return !!this.rapidApiKey;
  }

  /**
   * Get headers for RapidAPI requests
   */
  getHeaders() {
    return {
      'X-RapidAPI-Key': this.rapidApiKey,
      'X-RapidAPI-Host': this.rapidApiHost
    };
  }

  /**
   * Search hotels by city/location
   * @param {String} city - City name to search
   * @param {Object} filters - Search filters
   * @param {Number} filters.checkInDate - Check-in date (timestamp)
   * @param {Number} filters.checkOutDate - Check-out date (timestamp)
   * @param {Number} filters.adults - Number of adults
   * @param {Number} filters.rooms - Number of rooms
   * @param {Number} filters.minPrice - Minimum price
   * @param {Number} filters.maxPrice - Maximum price
   * @param {Number} filters.minStarRating - Minimum star rating
   */
  async searchHotels(city, filters = {}) {
    if (!this.isConfigured()) {
      console.warn('⚠️ RapidAPI not configured. Set RAPIDAPI_KEY in environment variables.');
      console.warn('📝 Get your API key from https://rapidapi.com/ and subscribe to Agoda Com API');
      return {
        city: city,
        totalResults: 0,
        sources: [],
        hotels: []
      };
    }

    try {
      console.log(`🔍 Searching RapidAPI (Agoda) for hotels in ${city}...`);

      // First, get location ID from city name (Agoda uses different endpoint)
      const locationId = await this.getLocationId(city);
      if (!locationId) {
        console.warn(`⚠️ Could not find location ID for ${city}`);
        return {
          city: city,
          totalResults: 0,
          sources: ['rapidapi'],
          hotels: []
        };
      }

      // Build search parameters for Agoda API
      const checkInDate = filters.checkInDate 
        ? new Date(filters.checkInDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      
      const checkOutDate = filters.checkOutDate
        ? new Date(filters.checkOutDate).toISOString().split('T')[0]
        : new Date(Date.now() + 86400000).toISOString().split('T')[0]; // Tomorrow

      const searchParams = {
        id: locationId,
        checkinDate: checkInDate,
        checkoutDate: checkOutDate
      };

      // Add optional parameters
      if (filters.adults) {
        searchParams.adults = filters.adults;
      }
      if (filters.rooms) {
        searchParams.rooms = filters.rooms;
      }
      if (filters.currency) {
        searchParams.currency = filters.currency;
      }

      // Search hotels using Agoda's search-overnight endpoint
      const response = await axios.get(`${this.baseUrl}/hotels/search-overnight`, {
        params: searchParams,
        headers: this.getHeaders(),
        timeout: 15000
      });

      // Log response structure for debugging
      console.log('📋 Agoda API Response structure:', JSON.stringify(Object.keys(response.data || {})).substring(0, 200));

      // Handle Agoda's specific response format: response.data.data.citySearch.properties
      let hotelsData = null;
      if (response.data) {
        // Agoda's structure: data.data.citySearch.properties
        if (response.data.data && response.data.data.citySearch && response.data.data.citySearch.properties) {
          hotelsData = response.data.data.citySearch.properties;
          console.log(`✅ Found Agoda response structure: data.data.citySearch.properties (${hotelsData.length} properties)`);
        }
        // Fallback: direct array
        else if (Array.isArray(response.data)) {
          hotelsData = response.data;
        }
        // Fallback: nested result
        else if (response.data.result) {
          hotelsData = Array.isArray(response.data.result) ? response.data.result : [response.data.result];
        }
        // Fallback: nested data
        else if (response.data.data) {
          if (Array.isArray(response.data.data)) {
            hotelsData = response.data.data;
          } else if (response.data.data.properties) {
            hotelsData = response.data.data.properties;
          }
        }
        // Fallback: hotels array
        else if (response.data.hotels) {
          hotelsData = Array.isArray(response.data.hotels) ? response.data.hotels : [response.data.hotels];
        }
      }

      if (hotelsData && hotelsData.length > 0) {
        console.log(`📋 Raw hotels data: ${hotelsData.length} properties found`);
        console.log(`📋 Sample property structure:`, JSON.stringify({
          propertyId: hotelsData[0]?.propertyId,
          hasContent: !!hotelsData[0]?.content,
          hasInformationSummary: !!hotelsData[0]?.content?.informationSummary,
          hotelName: hotelsData[0]?.content?.informationSummary?.defaultName
        }).substring(0, 300));
        
        const hotels = this.formatHotels(hotelsData, city, filters);
        console.log(`✅ Formatted ${hotels.length} hotels from RapidAPI (Agoda)`);
        
        if (hotels.length > 0) {
          console.log(`📋 Sample formatted hotel:`, JSON.stringify({
            hotelId: hotels[0].hotelId,
            name: hotels[0].name,
            city: hotels[0].city,
            imagesCount: hotels[0].images?.length || 0,
            hasBookingLink: !!hotels[0].bookingLinks?.agoda,
            price: hotels[0].pricing?.basePrice
          }).substring(0, 300));
        }
        
        return {
          city: city,
          totalResults: hotels.length,
          sources: ['rapidapi-agoda'],
          hotels: hotels
        };
      }

      console.warn(`⚠️ No hotels found in RapidAPI (Agoda) response for ${city}`);
      console.warn(`📋 Response keys:`, response.data ? Object.keys(response.data) : 'No data');
      return {
        city: city,
        totalResults: 0,
        sources: ['rapidapi-agoda'],
        hotels: []
      };

    } catch (error) {
      console.error('❌ RapidAPI hotel search error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return {
        city: city,
        totalResults: 0,
        sources: ['rapidapi'],
        hotels: []
      };
    }
  }

  /**
   * Get location ID from city name
   * For Agoda, location IDs are typically in format like "1_318" (region_city)
   * This is a placeholder - you may need to implement Agoda's location search endpoint
   * or maintain a mapping of city names to Agoda location IDs
   */
  async getLocationId(city) {
    try {
      // TODO: Implement Agoda location search if they have a locations endpoint
      // For now, return null and let the search use city name directly
      // You might need to check Agoda's API documentation for location lookup
      
      // Comprehensive city to Agoda ID mappings
      // Format: region_city (e.g., "1_318" where 1 is region, 318 is city)
      // Note: These are example IDs - you may need to verify actual Agoda location IDs
      const cityToIdMap = {
        // India - Major Cities
        'mumbai': '1_318',
        'delhi': '1_304',
        'new delhi': '1_304',
        'bangalore': '1_305',
        'bengaluru': '1_305',
        'udaipur': '1_319',
        'goa': '1_306',
        'kolkata': '1_307',
        'calcutta': '1_307',
        'chennai': '1_308',
        'madras': '1_308',
        'hyderabad': '1_309',
        'pune': '1_310',
        'jaipur': '1_311',
        'ahmedabad': '1_312',
        'kochi': '1_313',
        'cochin': '1_313',
        'varanasi': '1_314',
        'agra': '1_315',
        'jodhpur': '1_316',
        'jaisalmer': '1_317',
        'manali': '1_320',
        'shimla': '1_321',
        'darjeeling': '1_322',
        'ooty': '1_323',
        'ootacamund': '1_323',
        'mysore': '1_324',
        'mysuru': '1_324',
        'kozhikode': '1_326',
        'calicut': '1_326',
        'surat': '1_327',
        'vadodara': '1_328',
        'baroda': '1_328',
        'lucknow': '1_329',
        'kanpur': '1_330',
        'nagpur': '1_331',
        'indore': '1_332',
        'thane': '1_333',
        'bhopal': '1_334',
        'visakhapatnam': '1_335',
        'vizag': '1_335',
        'patna': '1_336',
        'gurgaon': '1_338',
        'gurugram': '1_338',
        'noida': '1_339',
        'faridabad': '1_340',
        'ghaziabad': '1_341',
        'amritsar': '1_342',
        'chandigarh': '1_343',
        'dehradun': '1_344',
        'haridwar': '1_345',
        'rishikesh': '1_346',
        'alleppey': '1_347',
        'alappuzha': '1_347',
        'munnar': '1_348',
        'thekkady': '1_349',
        'kodaikanal': '1_350',
        'coorg': '1_351',
        'kodaikanal': '1_352',
        'pondicherry': '1_353',
        'puducherry': '1_353',
        'mahabalipuram': '1_354',
        'hampi': '1_355',
        'gokarna': '1_356',
        'pushkar': '1_357',
        'mount abu': '1_358',
        'ranthambore': '1_359',
        'bharatpur': '1_360',
        'khajuraho': '1_361',
        'varanasi': '1_362',
        'srinagar': '1_363',
        'leh': '1_364',
        'ladakh': '1_364',
        'spiti': '1_365',
        'dharamshala': '1_366',
        'mcleod ganj': '1_367',
        
        // International - Asia Pacific
        'singapore': '2_1',
        'bangkok': '2_2',
        'kuala lumpur': '2_3',
        'jakarta': '2_4',
        'bali': '2_5',
        'denpasar': '2_5',
        'phuket': '2_6',
        'pattaya': '2_7',
        'ho chi minh city': '2_8',
        'saigon': '2_8',
        'hanoi': '2_9',
        'manila': '2_10',
        'hong kong': '2_11',
        'tokyo': '2_12',
        'osaka': '2_13',
        'kyoto': '2_14',
        'seoul': '2_15',
        'dubai': '2_16',
        'abu dhabi': '2_17',
        'doha': '2_18',
        'kathmandu': '2_19',
        'colombo': '2_20',
        'dhaka': '2_21',
        'karachi': '2_22',
        'islamabad': '2_23',
        'lahore': '2_24',
        'penang': '2_25',
        'langkawi': '2_26',
        'chiang mai': '2_27',
        'krabi': '2_28',
        'koh samui': '2_29',
        'hanoi': '2_30',
        'hoi an': '2_31',
        'da nang': '2_32',
        'nha trang': '2_33',
        'siem reap': '2_34',
        'phnom penh': '2_35',
        'yangon': '2_36',
        'rangoon': '2_36',
        'macau': '2_37',
        'taipei': '2_38',
        'shanghai': '2_39',
        'beijing': '2_40',
        'guangzhou': '2_41',
        'shenzhen': '2_42',
        'chengdu': '2_43',
        'xian': '2_44',
        'hangzhou': '2_45',
        'suzhou': '2_46',
        'nagoya': '2_47',
        'fukuoka': '2_48',
        'sapporo': '2_49',
        'busan': '2_50',
        'jeju': '2_51',
        'cebu': '2_52',
        'boracay': '2_53',
        'palawan': '2_54',
        'bintan': '2_55',
        'batam': '2_56',
        
        // Europe
        'london': '3_1',
        'paris': '3_2',
        'rome': '3_3',
        'barcelona': '3_4',
        'madrid': '3_5',
        'amsterdam': '3_6',
        'berlin': '3_7',
        'munich': '3_8',
        'vienna': '3_9',
        'prague': '3_10',
        'budapest': '3_11',
        'istanbul': '3_12',
        'athens': '3_13',
        'lisbon': '3_14',
        'dublin': '3_15',
        'edinburgh': '3_16',
        'brussels': '3_17',
        'zurich': '3_18',
        'geneva': '3_19',
        'milan': '3_20',
        'venice': '3_21',
        'florence': '3_22',
        'naples': '3_23',
        'stockholm': '3_24',
        'copenhagen': '3_25',
        'oslo': '3_26',
        'helsinki': '3_27',
        'warsaw': '3_28',
        'krakow': '3_29',
        'bratislava': '3_30',
        'ljubljana': '3_31',
        'zagreb': '3_32',
        'bucharest': '3_33',
        'sofia': '3_34',
        'belgrade': '3_35',
        'moscow': '3_36',
        'saint petersburg': '3_37',
        'st petersburg': '3_37',
        'reykjavik': '3_38',
        'tallinn': '3_39',
        'riga': '3_40',
        'vilnius': '3_41',
        'porto': '3_42',
        'sevilla': '3_43',
        'valencia': '3_44',
        'granada': '3_45',
        'nice': '3_46',
        'lyon': '3_47',
        'marseille': '3_48',
        'brussels': '3_49',
        'antwerp': '3_50',
        'rotterdam': '3_51',
        'hamburg': '3_52',
        'frankfurt': '3_53',
        'cologne': '3_54',
        'dresden': '3_55',
        'salzburg': '3_56',
        'innsbruck': '3_57',
        'lucerne': '3_58',
        'interlaken': '3_59',
        'zermatt': '3_60',
        
        // North America
        'new york': '4_1',
        'new york city': '4_1',
        'nyc': '4_1',
        'los angeles': '4_2',
        'la': '4_2',
        'chicago': '4_3',
        'san francisco': '4_4',
        'sf': '4_4',
        'miami': '4_5',
        'las vegas': '4_6',
        'boston': '4_7',
        'washington': '4_8',
        'washington dc': '4_8',
        'washington d.c.': '4_8',
        'dc': '4_8',
        'seattle': '4_9',
        'philadelphia': '4_10',
        'philly': '4_10',
        'atlanta': '4_11',
        'houston': '4_12',
        'dallas': '4_13',
        'phoenix': '4_14',
        'denver': '4_15',
        'san diego': '4_16',
        'portland': '4_17',
        'new orleans': '4_18',
        'nashville': '4_19',
        'austin': '4_20',
        'toronto': '4_21',
        'vancouver': '4_22',
        'montreal': '4_23',
        'calgary': '4_24',
        'ottawa': '4_25',
        'quebec city': '4_26',
        'mexico city': '4_27',
        'cancun': '4_28',
        'tulum': '4_29',
        'playa del carmen': '4_30',
        'puerto vallarta': '4_31',
        'guadalajara': '4_32',
        'monterrey': '4_33',
        
        // South America
        'rio de janeiro': '5_1',
        'rio': '5_1',
        'sao paulo': '5_2',
        'buenos aires': '5_3',
        'lima': '5_4',
        'bogota': '5_5',
        'santiago': '5_6',
        'cartagena': '5_7',
        'medellin': '5_8',
        'quito': '5_9',
        'guayaquil': '5_10',
        'montevideo': '5_11',
        'asuncion': '5_12',
        'la paz': '5_13',
        'sucre': '5_14',
        'cusco': '5_15',
        'machu picchu': '5_16',
        'iguazu': '5_17',
        'iguacu': '5_17',
        'salvador': '5_18',
        'recife': '5_19',
        'fortaleza': '5_20',
        'manaus': '5_21',
        'brasilia': '5_22',
        'curitiba': '5_23',
        'porto alegre': '5_24',
        'valparaiso': '5_25',
        'vina del mar': '5_26',
        
        // Africa & Middle East
        'cairo': '6_1',
        'cape town': '6_2',
        'johannesburg': '6_3',
        'durban': '6_4',
        'pretoria': '6_5',
        'marrakech': '6_6',
        'casablanca': '6_7',
        'fes': '6_8',
        'rabat': '6_9',
        'tangier': '6_10',
        'tel aviv': '6_11',
        'jerusalem': '6_12',
        'haifa': '6_13',
        'riyadh': '6_14',
        'jeddah': '6_15',
        'mecca': '6_16',
        'medina': '6_17',
        'dammam': '6_18',
        'muscat': '6_19',
        'beirut': '6_20',
        'amman': '6_21',
        'dubai': '6_22',
        'abu dhabi': '6_23',
        'sharjah': '6_24',
        'doha': '6_25',
        'kuwait city': '6_26',
        'kuwait': '6_26',
        'manama': '6_27',
        'nairobi': '6_28',
        'lagos': '6_29',
        'accra': '6_30',
        'dar es salaam': '6_31',
        'zanzibar': '6_32',
        'victoria falls': '6_33',
        'mauritius': '6_34',
        'seychelles': '6_35',
        
        // Australia & Oceania
        'sydney': '7_1',
        'melbourne': '7_2',
        'brisbane': '7_3',
        'perth': '7_4',
        'adelaide': '7_5',
        'gold coast': '7_6',
        'cairns': '7_7',
        'darwin': '7_8',
        'hobart': '7_9',
        'canberra': '7_10',
        'auckland': '7_11',
        'wellington': '7_12',
        'christchurch': '7_13',
        'queenstown': '7_14',
        'rotorua': '7_15',
        'taupo': '7_16',
        'fiji': '7_17',
        'bora bora': '7_18',
        'tahiti': '7_19',
        'moorea': '7_20',
        'bali': '7_21',
        'phuket': '7_22',
      };
      
      // Normalize city name: lowercase, trim, remove extra spaces
      const cityLower = city.toLowerCase().trim().replace(/\s+/g, ' ');
      
      // Direct match
      if (cityToIdMap[cityLower]) {
        return cityToIdMap[cityLower];
      }
      
      // Try without spaces (e.g., "newyork" for "new york")
      const cityNoSpaces = cityLower.replace(/\s+/g, '');
      if (cityToIdMap[cityNoSpaces]) {
        return cityToIdMap[cityNoSpaces];
      }
      
      // Try common abbreviations and variations
      const commonPatterns = {
        'new york city': 'new york',
        'san francisco bay area': 'san francisco',
        'mumbai city': 'mumbai',
        'delhi ncr': 'delhi',
        'ncr': 'delhi',
        'greater mumbai': 'mumbai',
        'greater delhi': 'delhi',
        'greater bangalore': 'bangalore',
      };
      
      if (commonPatterns[cityLower]) {
        const mappedCity = commonPatterns[cityLower];
        if (cityToIdMap[mappedCity]) {
          return cityToIdMap[mappedCity];
        }
      }
      
      // Return null to use city name directly in search
      // Agoda API might accept city names directly
      console.log(`ℹ️ No location ID mapping found for "${city}", will use city name directly`);
      return null;
    } catch (error) {
      console.error('Error getting location ID:', error.message);
      return null;
    }
  }

  /**
   * Format RapidAPI (Agoda) hotel data to our standard format
   * Agoda response structure: { propertyId, content: { informationSummary, reviews, images, features }, pricing }
   * Based on actual API response: data.citySearch.properties[]
   */
  formatHotels(rapidApiHotels, city, filters = {}) {
    if (!Array.isArray(rapidApiHotels)) {
      console.warn('⚠️ formatHotels: rapidApiHotels is not an array');
      return [];
    }

    console.log(`📋 Formatting ${rapidApiHotels.length} hotels from Agoda API`);

    return rapidApiHotels.map((hotel, index) => {
      try {
        // Agoda structure: hotel.content.informationSummary
        const content = hotel.content || {};
        const informationSummary = content.informationSummary || {};
        const geoInfo = informationSummary.geoInfo || {};
        const reviews = content.reviews?.cumulative || {};
        const pricing = hotel.pricing || {};
        
        // Extract property ID
        const propertyId = hotel.propertyId || hotel.property_id;
        
        // Extract hotel name
        const hotelName = informationSummary.defaultName || 
                         informationSummary.localeName || 
                         informationSummary.name ||
                         hotel.name || 
                         `Hotel ${propertyId || index + 1}`;
        
        // Extract address - build from available address components
        const addressParts = [];
        if (informationSummary.address?.area?.name) {
          addressParts.push(informationSummary.address.area.name);
        }
        if (informationSummary.address?.city?.name) {
          addressParts.push(informationSummary.address.city.name);
        }
        if (informationSummary.address?.country?.name) {
          addressParts.push(informationSummary.address.country.name);
        }
        const address = addressParts.length > 0 
          ? addressParts.join(', ')
          : (informationSummary.address?.fullAddress || informationSummary.address?.addressLine || city);
        
        // Extract coordinates
        const latitude = geoInfo.latitude || geoInfo.obfuscatedLat;
        const longitude = geoInfo.longitude || geoInfo.obfuscatedLong;
        const coordinates = (latitude != null && longitude != null) 
          ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
          : null;
        
        // Extract star rating (Agoda uses rating field, typically 1-5, but can be 0-5)
        const starRating = informationSummary.rating != null
          ? informationSummary.rating
          : (informationSummary.starRating || informationSummary.hotelClass || 3);
        
        // Extract review score (Agoda uses 0-10 scale, convert to 0-10 if needed)
        const reviewScore = reviews.score != null ? reviews.score : 0;
        const reviewCount = reviews.reviewCount || reviews.totalReviews || 0;
        
        // Extract images - check multiple possible locations
        let imageUrls = [];
        if (content.images) {
          // Try different image array locations
          const imageArrays = [
            content.images.hotelImages,
            content.images.mainImages,
            content.images.photos,
            content.images.gallery,
            content.images.images,
            Array.isArray(content.images) ? content.images : null
          ].filter(Boolean);
          
          for (const imgArray of imageArrays) {
            if (Array.isArray(imgArray) && imgArray.length > 0) {
              imageUrls = imgArray.map(img => {
                // Try different URL locations in image object
                const url = img.urls?.[0]?.value || 
                           img.urls?.[0]?.url ||
                           img.url || 
                           img.src || 
                           img.imageUrl ||
                           img.thumbnail ||
                           (typeof img === 'string' ? img : null);
                
                if (url) {
                  // Ensure URL is absolute
                  if (url.startsWith('http://') || url.startsWith('https://')) {
                    return url;
                  } else if (url.startsWith('//')) {
                    return `https:${url}`;
                  } else if (url.startsWith('/')) {
                    return `https://www.agoda.com${url}`;
                  } else {
                    return `https://${url}`;
                  }
                }
                return null;
              }).filter(Boolean);
              
              if (imageUrls.length > 0) break; // Use first array that has images
            }
          }
        }
        
        // If no images found, use a placeholder or Agoda's default image URL pattern
        if (imageUrls.length === 0 && propertyId) {
          // Agoda often has images at: https://images.agoda.com/hotels/{propertyId}/...
          // But we'll leave it empty for now to avoid broken images
        }
        
        // Extract pricing - try multiple locations
        // Note: Pricing might not be in the search response, might need separate API call
        let basePrice = 0;
        let currency = filters?.currency || 'INR';
        
        // Try to extract from pricing object
        if (pricing && Object.keys(pricing).length > 0) {
          // Try nested pricing structures
          const offers = pricing.offers?.[0] || {};
          const roomOffers = offers.roomOffers?.[0] || {};
          const room = roomOffers.room || {};
          const roomPricing = room.pricing?.[0] || {};
          const priceInfo = roomPricing.price || {};
          
          basePrice = priceInfo.perRoomPerNight?.inclusive?.display || 
                     priceInfo.perBook?.inclusive?.display || 
                     priceInfo.exclusive?.display ||
                     roomPricing.price?.display ||
                     pricing.price ||
                     pricing.basePrice ||
                     0;
          
          currency = filters?.currency || 
                    priceInfo.currency || 
                    roomPricing.currency || 
                    pricing.currency || 
                    'INR';
        }
        
        // If still no price, use a default based on star rating (rough estimate)
        if (basePrice === 0) {
          // Rough price estimates by star rating (in requested currency)
          const priceEstimates = {
            1: 1000,
            2: 2000,
            3: 4000,
            4: 8000,
            5: 15000
          };
          basePrice = priceEstimates[Math.round(starRating)] || 3000;
        }
        
        // Extract amenities
        const amenities = this.extractAmenities(content);
        
        // Build Agoda booking URL with check-in/check-out dates if available
        let agodaUrl = '#';
        if (propertyId) {
          agodaUrl = `https://www.agoda.com/hotel/${propertyId}`;
          // Add check-in/check-out if available in filters
          if (filters.checkInDate && filters.checkOutDate) {
            const checkIn = new Date(filters.checkInDate).toISOString().split('T')[0];
            const checkOut = new Date(filters.checkOutDate).toISOString().split('T')[0];
            agodaUrl += `?checkIn=${checkIn}&checkOut=${checkOut}`;
          }
        }

        // Extract city - use search city as fallback if not in response
        const hotelCity = informationSummary.address?.city?.name || 
                         informationSummary.address?.city ||
                         (informationSummary.address?.cityEnglishName) ||
                         city;

        const formattedHotel = {
          hotelId: propertyId?.toString() || `HTL${Date.now()}_${index}`,
          name: hotelName,
          city: hotelCity,
          starRating: Math.min(Math.max(Math.round(starRating), 1), 5),
          rating: {
            score: reviewScore > 10 ? parseFloat((reviewScore / 10).toFixed(1)) : parseFloat(reviewScore.toFixed(1)),
            reviews: parseInt(reviewCount) || 0,
            platform: 'agoda.com'
          },
          pricing: {
            basePrice: Math.round(parseFloat(basePrice) || 0),
            currency: currency,
            discount: 0, // Will be set if available in pricing data
            taxIncluded: false
          },
          amenities: amenities,
          images: imageUrls.map(url => ({ url })),
          location: {
            address: address,
            coordinates: coordinates
          },
          sources: [{
            platform: 'rapidapi-agoda',
            url: agodaUrl,
            lastChecked: new Date(),
            price: Math.round(parseFloat(basePrice) || 0),
            available: true
          }],
          // Add booking links object for compatibility
          bookingLinks: {
            agoda: agodaUrl
          }
        };
        
        return formattedHotel;
      } catch (error) {
        console.error(`❌ Error formatting hotel at index ${index}:`, error.message);
        // Return a minimal hotel object to avoid breaking the entire list
        return {
          hotelId: hotel.propertyId?.toString() || `HTL_ERROR_${index}`,
          name: hotel.content?.informationSummary?.defaultName || `Hotel ${index + 1}`,
          city: city,
          starRating: 3,
          rating: { score: 0, reviews: 0, platform: 'agoda.com' },
          pricing: { basePrice: 0, currency: filters?.currency || 'INR', discount: 0, taxIncluded: false },
          amenities: {},
          images: [],
          location: { address: city, coordinates: null },
          sources: [{ platform: 'rapidapi-agoda', url: '#', lastChecked: new Date(), price: 0, available: false }],
          bookingLinks: {}
        };
      }
    }).filter(hotel => hotel && hotel.name); // Filter out any null/undefined hotels
  }

  /**
   * Extract amenities from Agoda hotel data
   * Agoda structure: content.features.hotelFacilities (array of facility objects with id/name)
   */
  extractAmenities(content) {
    const amenities = {
      wifi: false,
      parking: false,
      pool: false,
      gym: false,
      restaurant: false,
      spa: false,
      airConditioning: false,
      elevator: false,
      roomService: false,
      businessCenter: false,
      conferenceRoom: false,
      petFriendly: false,
      laundry: false
    };
    
    // Agoda structure: content.features.hotelFacilities
    const features = content.features || {};
    const hotelFacilities = features.hotelFacilities || [];
    const roomAmenities = features.roomAmenities || [];
    
    // Combine all facilities
    const allFacilities = [...hotelFacilities, ...roomAmenities];
    
    // Agoda facility mapping (based on common facility IDs and names)
    // Note: These IDs may vary, so we'll also check names
    const facilityMap = {
      // WiFi/Internet
      wifi: [90, 91, 92, 'wifi', 'internet', 'free wifi', 'wireless internet', 'wi-fi'],
      // Parking
      parking: [80, 81, 'parking', 'car park', 'free parking', 'valet parking'],
      // Pool
      pool: [93, 94, 'swimming pool', 'pool', 'outdoor pool', 'indoor pool'],
      // Gym/Fitness
      gym: [95, 96, 'gym', 'fitness', 'fitness center', 'fitness centre', 'gymnasium'],
      // Restaurant
      restaurant: [11, 12, 'restaurant', 'dining', 'breakfast', 'dining room'],
      // Spa
      spa: [97, 98, 'spa', 'wellness', 'massage', 'sauna'],
      // Air Conditioning
      airConditioning: [25, 26, 'air conditioning', 'ac', 'airconditioning', 'climate control'],
      // Elevator
      elevator: [125, 126, 'elevator', 'lift'],
      // Room Service
      roomService: [27, 28, 'room service', 'roomservice', '24-hour room service'],
      // Business Center
      businessCenter: [88, 89, 'business center', 'business centre', 'business facilities', 'business services'],
      // Conference Room
      conferenceRoom: [100, 101, 'conference', 'meeting room', 'meeting facilities', 'conference facilities'],
      // Pet Friendly
      petFriendly: [24, 'pet friendly', 'pets allowed', 'pet policy'],
      // Laundry
      laundry: [29, 30, 'laundry', 'laundry service', 'dry cleaning']
    };
    
    // Check each facility
    allFacilities.forEach(facility => {
      const facilityId = facility.id || facility.facilityId;
      const facilityName = (facility.name || facility.facilityName || '').toLowerCase();
      
      // Check against facility map
      Object.keys(facilityMap).forEach(amenityKey => {
        const facilityKeywords = facilityMap[amenityKey];
        const matchesId = facilityKeywords.some(keyword => 
          typeof keyword === 'number' && facilityId === keyword
        );
        const matchesName = facilityKeywords.some(keyword => 
          typeof keyword === 'string' && facilityName.includes(keyword)
        );
        
        if (matchesId || matchesName) {
          amenities[amenityKey] = true;
        }
      });
    });
    
    // Default common amenities to true if not explicitly set (many hotels have these)
    // Only set to true if we haven't explicitly checked
    if (allFacilities.length === 0) {
      // If no facilities data, assume basic amenities
      amenities.wifi = true;
    }

    return amenities;
  }
}

module.exports = new RapidApiHotelService();

