const ClientTravelPreferences = require('../models/ClientTravelPreferences');
const travelAdvisoryService = require('../services/travelAdvisoryService');
const User = require('../models/User');

/**
 * Create or update client travel preferences
 */
const createOrUpdatePreferences = async (req, res) => {
  try {
    // Check if model is available
    if (!ClientTravelPreferences) {
      return res.status(500).json({
        success: false,
        message: 'Travel preferences model not available'
      });
    }

    const {
      clientId,
      country,
      targetAreas,
      checkInDate,
      checkOutDate,
      budgetMin,
      budgetMax,
      currency,
      preferredStarRating,
      requiredAmenities,
      conferenceLocation,
      maxDistanceFromConference,
      specialRequirements,
      transferId,
      notes
    } = req.body;

    // Validate required fields
    if (!clientId || !country || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: clientId, country, checkInDate, checkOutDate'
      });
    }

    // Validate budget fields
    if (budgetMin === undefined || budgetMin === null || budgetMax === undefined || budgetMax === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: budgetMin, budgetMax'
      });
    }

    // Convert dates to Date objects if they're strings
    let checkInDateObj, checkOutDateObj;
    try {
      checkInDateObj = checkInDate instanceof Date ? checkInDate : new Date(checkInDate);
      checkOutDateObj = checkOutDate instanceof Date ? checkOutDate : new Date(checkOutDate);
      
      // Validate dates
      if (isNaN(checkInDateObj.getTime()) || isNaN(checkOutDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format for checkInDate or checkOutDate'
        });
      }

      // Validate check-out is after check-in
      if (checkOutDateObj <= checkInDateObj) {
        return res.status(400).json({
          success: false,
          message: 'Check-out date must be after check-in date'
        });
      }
    } catch (dateError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format: ' + dateError.message
      });
    }

    // Check if client exists
    const client = await User.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if preferences already exist for this client (for same dates)
    // Only update if preferenceId is provided in the request (editing existing preference)
    let existingPreferences = null;
    if (req.body.preferenceId) {
      try {
        existingPreferences = await ClientTravelPreferences.findById(req.body.preferenceId);
        if (existingPreferences && existingPreferences.clientId.toString() !== clientId) {
          return res.status(403).json({
            success: false,
            message: 'Cannot update preferences for a different client'
          });
        }
      } catch (findError) {
        console.error('Error finding existing preferences:', findError);
        // Continue to create new preferences
      }
    } else {
      // Only check for existing preferences if no preferenceId provided AND we want to prevent duplicates
      // For now, allow multiple preferences per client (comment out the check)
      /*
      try {
        existingPreferences = await ClientTravelPreferences.findOne({
          clientId,
          checkInDate: checkInDateObj,
          status: { $in: ['draft', 'active', 'recommendations_generated'] }
        });
      } catch (findError) {
        console.error('Error finding existing preferences:', findError);
      }
      */
    }

    let preferences;

    if (existingPreferences) {
      // Clean conference location for update
      let cleanConferenceLocation = null;
      if (conferenceLocation && conferenceLocation.name && conferenceLocation.name.trim()) {
        const coordinates = conferenceLocation.coordinates;
        const hasValidCoordinates = coordinates && 
          coordinates.latitude != null && 
          coordinates.longitude != null &&
          coordinates.latitude !== undefined &&
          coordinates.longitude !== undefined &&
          !isNaN(parseFloat(coordinates.latitude)) &&
          !isNaN(parseFloat(coordinates.longitude)) &&
          parseFloat(coordinates.latitude) >= -90 &&
          parseFloat(coordinates.latitude) <= 90 &&
          parseFloat(coordinates.longitude) >= -180 &&
          parseFloat(coordinates.longitude) <= 180;
        
        // Build clean conference location object
        cleanConferenceLocation = {
          name: conferenceLocation.name.trim(),
          address: (conferenceLocation.address || '').trim()
        };
        
        // ONLY add coordinates if they are valid - do not include null/undefined coordinates
        if (hasValidCoordinates) {
          cleanConferenceLocation.coordinates = {
            latitude: parseFloat(coordinates.latitude),
            longitude: parseFloat(coordinates.longitude)
          };
        }
        // If coordinates are invalid, do NOT include them at all
      }

      // Clean up existing null coordinates if present
      if (existingPreferences.conferenceLocation && 
          existingPreferences.conferenceLocation.coordinates) {
        const coords = existingPreferences.conferenceLocation.coordinates;
        if (coords.latitude == null || coords.longitude == null ||
            isNaN(coords.latitude) || isNaN(coords.longitude)) {
          // Remove invalid coordinates
          if (existingPreferences.conferenceLocation.toObject) {
            const confLoc = existingPreferences.conferenceLocation.toObject();
            delete confLoc.coordinates;
            existingPreferences.conferenceLocation = confLoc;
          } else {
            delete existingPreferences.conferenceLocation.coordinates;
          }
          existingPreferences.markModified('conferenceLocation');
        }
      }

      // Update existing preferences
      existingPreferences.country = country.trim();
      existingPreferences.targetAreas = Array.isArray(targetAreas) ? targetAreas.filter(a => a && a.trim()) : [];
      existingPreferences.checkInDate = checkInDateObj;
      existingPreferences.checkOutDate = checkOutDateObj;
      existingPreferences.budgetMin = parseFloat(budgetMin) || 0;
      existingPreferences.budgetMax = parseFloat(budgetMax) || 0;
      existingPreferences.currency = currency || 'INR';
      existingPreferences.preferredStarRating = preferredStarRating || 3;
      existingPreferences.requiredAmenities = requiredAmenities || [];
      existingPreferences.conferenceLocation = cleanConferenceLocation;
      existingPreferences.maxDistanceFromConference = maxDistanceFromConference || 10;
      existingPreferences.specialRequirements = specialRequirements || '';
      existingPreferences.transferId = transferId || null;
      existingPreferences.notes = notes || '';
      existingPreferences.updatedBy = req.user._id;

      preferences = await existingPreferences.save();
    } else {
      // Create new preferences
      // Clean conference location - only include if name is provided
      let cleanConferenceLocation = null;
      if (conferenceLocation && conferenceLocation.name && conferenceLocation.name.trim()) {
        // Only include coordinates if both lat and lng are valid numbers
        const coordinates = conferenceLocation.coordinates;
        const hasValidCoordinates = coordinates && 
          coordinates.latitude != null && 
          coordinates.longitude != null &&
          coordinates.latitude !== undefined &&
          coordinates.longitude !== undefined &&
          !isNaN(parseFloat(coordinates.latitude)) &&
          !isNaN(parseFloat(coordinates.longitude)) &&
          parseFloat(coordinates.latitude) >= -90 &&
          parseFloat(coordinates.latitude) <= 90 &&
          parseFloat(coordinates.longitude) >= -180 &&
          parseFloat(coordinates.longitude) <= 180;
        
        // Build clean conference location object
        cleanConferenceLocation = {
          name: conferenceLocation.name.trim(),
          address: (conferenceLocation.address || '').trim()
        };
        
        // ONLY add coordinates if they are valid - do not include null/undefined coordinates
        if (hasValidCoordinates) {
          cleanConferenceLocation.coordinates = {
            latitude: parseFloat(coordinates.latitude),
            longitude: parseFloat(coordinates.longitude)
          };
        }
        // If coordinates are invalid, do NOT include them at all
      }

      const preferenceData = {
        clientId,
        country: country.trim(),
        targetAreas: Array.isArray(targetAreas) ? targetAreas.filter(a => a && a.trim()) : [],
        checkInDate: checkInDateObj,
        checkOutDate: checkOutDateObj,
        budgetMin: parseFloat(budgetMin) || 0,
        budgetMax: parseFloat(budgetMax) || 0,
        currency: currency || 'INR',
        preferredStarRating: parseInt(preferredStarRating) || 3,
        requiredAmenities: Array.isArray(requiredAmenities) ? requiredAmenities : [],
        conferenceLocation: cleanConferenceLocation,
        maxDistanceFromConference: parseFloat(maxDistanceFromConference) || 10,
        specialRequirements: specialRequirements || '',
        transferId: transferId || null,
        notes: notes || '',
        createdBy: req.user._id,
        status: 'draft'
      };

      preferences = new ClientTravelPreferences(preferenceData);
      preferences = await preferences.save();
    }

    // Populate client details
    try {
      await preferences.populate('clientId', 'username email profile');
    } catch (populateError) {
      console.error('Error populating client:', populateError);
      // Continue without populate
    }

    res.json({
      success: true,
      message: existingPreferences ? 'Preferences updated successfully' : 'Preferences created successfully',
      preferences
    });
  } catch (error) {
    console.error('Error creating/updating preferences:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationErrors,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create/update preferences',
      error: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

/**
 * Get preferences for a specific client
 */
const getClientPreferences = async (req, res) => {
  try {
    const { clientId } = req.params;

    let preferences = [];
    try {
      preferences = await ClientTravelPreferences.find({ clientId })
        .populate({
          path: 'clientId',
          select: 'username email profile',
          model: 'User'
        })
        .populate({
          path: 'selectedHotel',
          model: 'Hotel'
        })
        .populate({
          path: 'recommendations.hotelId',
          model: 'Hotel'
        })
        .sort({ createdAt: -1 })
        .lean();
    } catch (dbError) {
      console.error('Database error in getClientPreferences:', dbError);
      preferences = [];
    }

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Error fetching client preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preferences',
      error: error.message
    });
  }
};

/**
 * Get all preferences (with filters)
 */
const getAllPreferences = async (req, res) => {
  try {
    const { status, country, clientId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (country) query.country = new RegExp(country, 'i');
    if (clientId) query.clientId = clientId;

    const preferences = await ClientTravelPreferences.find(query)
      .populate('clientId', 'username email profile')
      .populate('selectedHotel', 'name city starRating pricing')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: preferences.length,
      preferences
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preferences',
      error: error.message
    });
  }
};

/**
 * Get single preference by ID
 */
const getPreferenceById = async (req, res) => {
  try {
    const { preferenceId } = req.params;

    const preference = await ClientTravelPreferences.findById(preferenceId)
      .populate({
        path: 'clientId',
        select: 'username email profile',
        model: 'User'
      })
      .populate({
        path: 'selectedHotel',
        model: 'Hotel'
      })
      .populate({
        path: 'recommendations.hotelId',
        model: 'Hotel'
      });

    if (!preference) {
      return res.status(404).json({
        success: false,
        message: 'Preferences not found'
      });
    }

    res.json({
      success: true,
      preference
    });
  } catch (error) {
    console.error('Error fetching preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preference',
      error: error.message
    });
  }
};

/**
 * Generate recommendations for a preference
 */
const generateRecommendations = async (req, res) => {
  try {
    const { preferenceId } = req.params;

    const preference = await ClientTravelPreferences.findById(preferenceId)
      .populate('clientId');

    if (!preference) {
      return res.status(404).json({
        success: false,
        message: 'Preferences not found'
      });
    }

    // Generate recommendations using the service
    const result = await travelAdvisoryService.generateRecommendations(preference);

    console.log('📊 Recommendation generation result:', {
      success: result.success,
      totalHotelsFound: result.totalHotelsFound,
      recommendationsGenerated: result.recommendationsGenerated,
      recommendationsCount: result.recommendations?.length || 0
    });

    // Ensure we always have recommendations to return
    if (!result.recommendations || result.recommendations.length === 0) {
      console.warn('⚠️ No recommendations in result, generating fallback...');
      // Generate fallback recommendations
      const fallbackHotels = await travelAdvisoryService.generateFallbackHotels(preference);
      const fallbackRecommendations = fallbackHotels.map((hotel, index) => ({
        hotelId: hotel.hotelId,
        hotel: hotel,
        relevanceScore: 100 - (index * 10), // Decreasing scores
        priceMatch: 100,
        amenitiesMatch: 100,
        starRatingMatch: true,
        distanceFromConference: null,
        distanceFromTargetArea: 0,
        withinConferenceRadius: false,
        bookingLinks: {},
        prices: {},
        card: null,
        cozyCozyId: null
      }));
      result.recommendations = fallbackRecommendations;
      result.recommendationsGenerated = fallbackRecommendations.length;
    }

    // Save recommendations to preference (include booking links and cards)
    // Only save hotelId if it's a valid MongoDB ObjectId, otherwise store hotel data directly
    try {
      preference.recommendations = result.recommendations.map(rec => {
        const recData = {
          relevanceScore: rec.relevanceScore || 0,
          distanceFromConference: rec.distanceFromConference,
          distanceFromTargetArea: rec.distanceFromTargetArea,
          amenitiesMatch: rec.amenitiesMatch || 0,
          priceMatch: rec.priceMatch || 0,
          starRatingMatch: rec.starRatingMatch || false,
          cozyCozyId: rec.cozyCozyId
        };
        
        // Only set hotelId if it's a valid MongoDB ObjectId
        if (rec.hotelId && require('mongoose').Types.ObjectId.isValid(rec.hotelId)) {
          recData.hotelId = rec.hotelId;
        } else {
          // Store hotel data directly if not a valid ObjectId
          recData.hotelData = rec.hotel || rec.hotelId;
        }
        
        return recData;
      });

      preference.markRecommendationsGenerated();
      await preference.save();
      console.log('✅ Saved recommendations to preference');
    } catch (saveError) {
      console.error('❌ Error saving recommendations to preference:', saveError);
      // Continue anyway - we'll still return the recommendations
    }

    // Populate hotel details only for valid ObjectIds
    try {
      await preference.populate({
        path: 'recommendations.hotelId',
        model: 'Hotel'
      });
    } catch (populateError) {
      console.warn('Could not populate hotelId:', populateError.message);
    }

    // Enhance recommendations with booking links and cards
    // Include hotel data from the recommendation if hotelId wasn't populated
    let enhancedRecommendations = [];
    
    if (result.recommendations && result.recommendations.length > 0) {
      enhancedRecommendations = result.recommendations.map((rec, index) => {
        const prefRec = preference.recommendations?.[index];
        // Get hotel data - prefer from rec.hotel, then prefRec.hotelId (populated), then rec.hotelId
        let hotel = rec.hotel;
        if (!hotel && prefRec?.hotelId && typeof prefRec.hotelId === 'object') {
          hotel = prefRec.hotelId; // Populated hotel document
        }
        if (!hotel) {
          hotel = rec.hotelId; // Fallback to hotelId if it's the hotel object itself
        }
        
        // Determine the actual hotelId
        const actualHotelId = hotel?._id || hotel?.hotelId || rec.hotelId;
        
        return {
          ...rec,
          hotelId: actualHotelId, // Ensure hotelId is set
          hotel: hotel, // Always include full hotel data
          bookingLinks: rec.bookingLinks || {},
          prices: rec.prices || {},
          card: rec.card || null
        };
      });
    }

    console.log('✅ Returning', enhancedRecommendations.length, 'recommendations');
    console.log('📋 Sample recommendation structure:', JSON.stringify(enhancedRecommendations[0] || {}, null, 2).substring(0, 500));

    // Ensure we always return recommendations, even if empty array
    if (enhancedRecommendations.length === 0) {
      console.error('❌ CRITICAL: Still no recommendations after all fallbacks!');
      // Last resort - create minimal recommendations
      const lastResortHotels = await travelAdvisoryService.generateFallbackHotels(preference);
      enhancedRecommendations.push(...lastResortHotels.map((hotel, idx) => ({
        hotelId: hotel.hotelId,
        hotel: hotel,
        relevanceScore: 100 - (idx * 10),
        priceMatch: 100,
        amenitiesMatch: 100,
        starRatingMatch: true,
        distanceFromConference: null,
        distanceFromTargetArea: 0,
        withinConferenceRadius: false,
        bookingLinks: {},
        prices: {},
        card: null,
        cozyCozyId: null
      })));
      console.log('🆘 Last resort: Generated', enhancedRecommendations.length, 'recommendations');
    }

    res.json({
      success: true,
      message: `Generated ${enhancedRecommendations.length} recommendations`,
      totalHotelsFound: result.totalHotelsFound || enhancedRecommendations.length,
      recommendationsGenerated: enhancedRecommendations.length,
      recommendations: enhancedRecommendations, // Always return the enhanced recommendations
      preference
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations',
      error: error.message
    });
  }
};

/**
 * Get recommendations for a preference
 */
const getRecommendations = async (req, res) => {
  try {
    const { preferenceId } = req.params;
    const HotelLink = require('../models/HotelLink');
    const hotelCardService = require('../services/hotelCardService');
    const travelAdvisoryService = require('../services/travelAdvisoryService');

    const preference = await ClientTravelPreferences.findById(preferenceId)
      .populate('recommendations.hotelId')
      .populate('clientId', 'username email profile');

    if (!preference) {
      return res.status(404).json({
        success: false,
        message: 'Preferences not found'
      });
    }

    // Only auto-generate if explicitly requested via query parameter to avoid loops
    // Don't auto-generate on every getRecommendations call
    const shouldAutoGenerate = req.query.autoGenerate === 'true';
    
    if (shouldAutoGenerate && (!preference.recommendations || preference.recommendations.length === 0)) {
      console.log('⚠️ Auto-generating recommendations (explicitly requested)...');
      try {
        const result = await travelAdvisoryService.generateRecommendations(preference);
        if (result.recommendations && result.recommendations.length > 0) {
          // Save recommendations
          preference.recommendations = result.recommendations.map(rec => ({
            hotelId: rec.hotelId,
            relevanceScore: rec.relevanceScore,
            distanceFromConference: rec.distanceFromConference,
            distanceFromTargetArea: rec.distanceFromTargetArea,
            amenitiesMatch: rec.amenitiesMatch,
            priceMatch: rec.priceMatch,
            starRatingMatch: rec.starRatingMatch,
            cozyCozyId: rec.cozyCozyId,
            hotelData: rec.hotel
          }));
          preference.markRecommendationsGenerated();
          await preference.save();
          await preference.populate('recommendations.hotelId');
        }
      } catch (genError) {
        console.error('Error generating recommendations in getRecommendations:', genError);
        // Continue with empty recommendations
      }
    }

    // Enhance recommendations with booking links and cards
    const enhancedRecommendations = await Promise.all(
      (preference.recommendations || []).map(async (rec) => {
        // Convert rec to plain object if it's a Mongoose document
        const recObj = rec.toObject ? rec.toObject() : rec;
        
        // Get hotel data - could be from hotelId (populated), hotelData, or rec itself
        let hotel = null;
        if (recObj.hotelId && typeof recObj.hotelId === 'object') {
          hotel = recObj.hotelId; // Populated hotel document
          // Convert to plain object if it's a Mongoose document
          if (hotel && typeof hotel.toObject === 'function') {
            hotel = hotel.toObject();
          }
        } else if (recObj.hotelData) {
          hotel = recObj.hotelData; // Hotel data stored directly
          // Ensure hotelData is a plain object, not a Mongoose document
          if (hotel && typeof hotel.toObject === 'function') {
            hotel = hotel.toObject();
          }
        } else if (recObj.hotelId) {
          // hotelId is a string/ID, try to get hotel from database
          try {
            const Hotel = require('../models/Hotel');
            const hotelDoc = await Hotel.findById(recObj.hotelId);
            if (hotelDoc) {
              hotel = hotelDoc.toObject ? hotelDoc.toObject() : hotelDoc;
            }
          } catch (err) {
            console.warn('Could not fetch hotel by ID:', recObj.hotelId);
          }
        }

        // Try to get hotel links from database
        let hotelLink = null;
        if (recObj.cozyCozyId) {
          hotelLink = await HotelLink.findByCozyCozyId(recObj.cozyCozyId);
        } else if (recObj.hotelId) {
          const links = await HotelLink.findByHotelId(recObj.hotelId);
          hotelLink = links && links.length > 0 ? links[0] : null;
        }

        // Build card if hotel link exists
        let card = null;
        let bookingLinks = {};
        let prices = {};

        if (hotelLink) {
          bookingLinks = Object.fromEntries(hotelLink.bookingUrls || []);
          prices = Object.fromEntries(hotelLink.prices || []);
          if (hotelLink.cardData) {
            card = hotelCardService.buildCard({
              ...hotelLink.cardData,
              bookingLinks,
              prices
            });
          }
        }

        return {
          ...recObj,
          hotel: hotel, // Always include hotel data
          hotelId: hotel?._id || hotel?.hotelId || recObj.hotelId, // Ensure hotelId is set
          bookingLinks,
          prices,
          card
        };
      })
    );

    res.json({
      success: true,
      recommendations: enhancedRecommendations,
      preference: {
        id: preference._id,
        clientId: preference.clientId,
        country: preference.country,
        targetAreas: preference.targetAreas,
        checkInDate: preference.checkInDate,
        checkOutDate: preference.checkOutDate,
        budgetMin: preference.budgetMin,
        budgetMax: preference.budgetMax,
        conferenceLocation: preference.conferenceLocation
      }
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
      error: error.message
    });
  }
};

/**
 * Select a hotel for a preference
 */
const selectHotel = async (req, res) => {
  try {
    const { preferenceId } = req.params;
    const { hotelId, notes } = req.body;

    if (!hotelId) {
      return res.status(400).json({
        success: false,
        message: 'hotelId is required'
      });
    }

    const preference = await ClientTravelPreferences.findById(preferenceId);

    if (!preference) {
      return res.status(404).json({
        success: false,
        message: 'Preferences not found'
      });
    }

    // Select hotel
    preference.selectHotel(hotelId, notes || '');
    await preference.save();

    // Populate hotel details
    await preference.populate('selectedHotel');
    await preference.populate('clientId', 'username email profile');

    res.json({
      success: true,
      message: 'Hotel selected successfully',
      preference
    });
  } catch (error) {
    console.error('Error selecting hotel:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select hotel',
      error: error.message
    });
  }
};

/**
 * Get dashboard data
 */
const getDashboard = async (req, res) => {
  try {
    const { status, country } = req.query;

    // Check if model is available
    if (!ClientTravelPreferences) {
      return res.json({
        success: true,
        stats: {
          total: 0,
          draft: 0,
          active: 0,
          recommendationsGenerated: 0,
          hotelSelected: 0,
          completed: 0,
          withConference: 0
        },
        preferences: []
      });
    }

    const query = {};
    if (status) query.status = status;
    if (country) query.country = new RegExp(country, 'i');

    // Check if model exists and collection is accessible
    let preferences = [];
    try {
      const mongoose = require('mongoose');
      
      // Check if MongoDB is connected
      if (mongoose.connection.readyState !== 1) {
        console.log('MongoDB not connected, returning empty dashboard');
        preferences = [];
      } else {
        preferences = await ClientTravelPreferences.find(query)
          .populate({
            path: 'clientId',
            select: 'username email profile',
            model: 'User'
          })
          .populate({
            path: 'selectedHotel',
            select: 'name city starRating pricing',
            model: 'Hotel'
          })
          .sort({ createdAt: -1 })
          .lean();
      }
    } catch (dbError) {
      // If collection doesn't exist or model not registered, return empty results
      console.error('Database error in getDashboard:', dbError);
      console.error('Error message:', dbError.message);
      console.error('Error stack:', dbError.stack);
      // Return empty array instead of throwing
      preferences = [];
    }

    // Calculate statistics
    const stats = {
      total: preferences.length || 0,
      draft: (preferences || []).filter(p => p.status === 'draft').length,
      active: (preferences || []).filter(p => p.status === 'active').length,
      recommendationsGenerated: (preferences || []).filter(p => p.status === 'recommendations_generated').length,
      hotelSelected: (preferences || []).filter(p => p.status === 'hotel_selected').length,
      completed: (preferences || []).filter(p => p.status === 'completed').length,
      withConference: (preferences || []).filter(p => p.conferenceLocation && p.conferenceLocation.name).length
    };

    res.json({
      success: true,
      stats,
      preferences: (preferences || []).slice(0, 50) // Limit to 50 for dashboard
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

/**
 * Delete preferences
 */
const deletePreferences = async (req, res) => {
  try {
    const { preferenceId } = req.params;

    const preference = await ClientTravelPreferences.findById(preferenceId);

    if (!preference) {
      return res.status(404).json({
        success: false,
        message: 'Preferences not found'
      });
    }

    await preference.deleteOne();

    res.json({
      success: true,
      message: 'Preferences deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete preferences',
      error: error.message
    });
  }
};

/**
 * Get hotel booking links
 */
const getHotelLinks = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const HotelLink = require('../models/HotelLink');

    const hotelLinks = await HotelLink.findByHotelId(hotelId);
    
    if (!hotelLinks || hotelLinks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hotel links not found'
      });
    }

    res.json({
      success: true,
      links: hotelLinks
    });
  } catch (error) {
    console.error('Error fetching hotel links:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hotel links',
      error: error.message
    });
  }
};

/**
 * Get hotel cards
 */
const getHotelCards = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const HotelLink = require('../models/HotelLink');
    const hotelCardService = require('../services/hotelCardService');

    const hotelLinks = await HotelLink.findByHotelId(hotelId);
    
    if (!hotelLinks || hotelLinks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hotel cards not found'
      });
    }

    // Build cards from hotel links
    const cards = hotelLinks.map(link => ({
      id: link._id,
      hotelId: link.hotelId,
      cozyCozyId: link.cozyCozyId,
      cardData: link.cardData,
      cardHtml: link.cardHtml,
      bookingLinks: Object.fromEntries(link.bookingUrls || []),
      prices: Object.fromEntries(link.prices || []),
      bestPrice: link.bestPrice
    }));

    res.json({
      success: true,
      cards
    });
  } catch (error) {
    console.error('Error fetching hotel cards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hotel cards',
      error: error.message
    });
  }
};

/**
 * Search hotels via CozyCozy
 */
const searchCozyCozy = async (req, res) => {
  try {
    const { location, checkIn, checkOut, filters } = req.body;
    const cozyCozyService = require('../services/cozyCozyService');
    const hotelCardService = require('../services/hotelCardService');

    if (!location || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: location, checkIn, checkOut'
      });
    }

    const results = await cozyCozyService.searchByLocation(
      location,
      checkIn,
      checkOut,
      { ...filters }
    );

    // Build cards for each hotel
    const hotelsWithCards = results.map(hotel => {
      const card = hotelCardService.buildCard(hotel);
      return {
        ...hotel,
        card
      };
    });

    res.json({
      success: true,
      hotels: hotelsWithCards,
      totalResults: hotelsWithCards.length
    });
  } catch (error) {
    console.error('Error searching CozyCozy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search hotels',
      error: error.message
    });
  }
};

module.exports = {
  createOrUpdatePreferences,
  getClientPreferences,
  getAllPreferences,
  getPreferenceById,
  generateRecommendations,
  getRecommendations,
  selectHotel,
  getDashboard,
  deletePreferences,
  getHotelLinks,
  getHotelCards,
  searchCozyCozy
};

