const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/travelAdvisoryController');

const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/travel-advisory/preferences
 * @desc    Create or update client travel preferences
 * @access  Private (Admin, Operations Manager)
 */
router.post('/preferences', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), createOrUpdatePreferences);

/**
 * @route   GET /api/travel-advisory/preferences
 * @desc    Get all travel preferences (with optional filters)
 * @access  Private (Admin, Operations Manager)
 */
router.get('/preferences', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), getAllPreferences);

/**
 * @route   GET /api/travel-advisory/preferences/:clientId
 * @desc    Get preferences for a specific client
 * @access  Private (Admin, Operations Manager, Client - own data)
 */
router.get('/preferences/client/:clientId', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CLIENT']), getClientPreferences);

/**
 * @route   GET /api/travel-advisory/preferences/:preferenceId
 * @desc    Get single preference by ID
 * @access  Private (Admin, Operations Manager)
 */
router.get('/preferences/:preferenceId', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), getPreferenceById);

/**
 * @route   DELETE /api/travel-advisory/preferences/:preferenceId
 * @desc    Delete preferences
 * @access  Private (Admin, Operations Manager)
 */
router.delete('/preferences/:preferenceId', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), deletePreferences);

/**
 * @route   POST /api/travel-advisory/recommendations/:preferenceId
 * @desc    Generate hotel recommendations for a preference
 * @access  Private (Admin, Operations Manager)
 */
router.post('/recommendations/:preferenceId', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), generateRecommendations);

/**
 * @route   GET /api/travel-advisory/recommendations/:preferenceId
 * @desc    Get recommendations for a preference
 * @access  Private (Admin, Operations Manager)
 */
router.get('/recommendations/:preferenceId', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), getRecommendations);

/**
 * @route   POST /api/travel-advisory/recommendations/:preferenceId/select
 * @desc    Select a hotel for a preference
 * @access  Private (Admin, Operations Manager)
 */
router.post('/recommendations/:preferenceId/select', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), selectHotel);

/**
 * @route   GET /api/travel-advisory/dashboard
 * @desc    Get dashboard data with statistics
 * @access  Private (Admin, Operations Manager)
 */
router.get('/dashboard', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), getDashboard);

/**
 * @route   GET /api/travel-advisory/hotels/:hotelId/links
 * @desc    Get booking links for a hotel
 * @access  Private (Admin, Operations Manager)
 */
router.get('/hotels/:hotelId/links', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), getHotelLinks);

/**
 * @route   GET /api/travel-advisory/hotels/:hotelId/cards
 * @desc    Get hotel cards for a hotel
 * @access  Private (Admin, Operations Manager)
 */
router.get('/hotels/:hotelId/cards', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), getHotelCards);

/**
 * @route   POST /api/travel-advisory/cozycozy/search
 * @desc    Search hotels via CozyCozy API
 * @access  Private (Admin, Operations Manager)
 */
router.post('/cozycozy/search', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), searchCozyCozy);

/**
 * @route   GET /api/travel-advisory/test/:preferenceId
 * @desc    Test endpoint to debug recommendation generation
 * @access  Private (Admin, Operations Manager)
 */
router.get('/test/:preferenceId', authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { preferenceId } = req.params;
    const ClientTravelPreferences = require('../models/ClientTravelPreferences');
    const travelAdvisoryService = require('../services/travelAdvisoryService');
    const hotelSearchService = require('../services/hotelSearchService');
    const cozyCozyService = require('../services/cozyCozyService');
    
    const preference = await ClientTravelPreferences.findById(preferenceId).populate('clientId');
    if (!preference) {
      return res.status(404).json({ success: false, message: 'Preference not found' });
    }
    
    const searchCity = preference.targetAreas?.[0] || preference.country;
    
    // Test all data sources
    const testResults = {
      preference: {
        id: preference._id,
        city: searchCity,
        budget: `${preference.budgetMin} - ${preference.budgetMax}`,
        dates: `${preference.checkInDate} to ${preference.checkOutDate}`
      },
      dataSources: {
        cozyCozy: {
          enabled: process.env.COZYCOZY_ENABLED !== 'false',
          hasToken: !!process.env.COZYCOZY_AUTH_TOKEN,
          status: 'not_tested'
        },
        hotelSearchService: {
          status: 'not_tested'
        },
        mockHotels: {
          status: 'not_tested'
        }
      },
      testResults: {}
    };
    
    // Test CozyCozy
    if (testResults.dataSources.cozyCozy.enabled && testResults.dataSources.cozyCozy.hasToken) {
      try {
        const cozyCozyResult = await cozyCozyService.searchByLocation(
          searchCity,
          preference.checkInDate,
          preference.checkOutDate,
          {
            guests: 2,
            limit: 5,
            filters: {
              priceRange: [preference.budgetMin || 0, preference.budgetMax || Infinity],
              sorting: 'ranking'
            }
          }
        );
        testResults.dataSources.cozyCozy.status = 'success';
        testResults.testResults.cozyCozy = {
          hotelsFound: cozyCozyResult.length,
          sampleHotel: cozyCozyResult[0] || null
        };
      } catch (error) {
        testResults.dataSources.cozyCozy.status = 'error';
        testResults.testResults.cozyCozy = {
          error: error.message
        };
      }
    } else {
      testResults.dataSources.cozyCozy.status = 'disabled_or_no_token';
    }
    
    // Test Hotel Search Service
    try {
      const filters = {
        minPrice: preference.budgetMin || 0,
        maxPrice: preference.budgetMax || Infinity,
        minStarRating: preference.preferredStarRating || 1
      };
      const hotelSearchResult = await hotelSearchService.searchHotels(searchCity, filters);
      testResults.dataSources.hotelSearchService.status = 'success';
      testResults.testResults.hotelSearchService = {
        hotelsFound: hotelSearchResult.hotels?.length || 0,
        sources: hotelSearchResult.sources || [],
        sampleHotel: hotelSearchResult.hotels?.[0] || null
      };
    } catch (error) {
      testResults.dataSources.hotelSearchService.status = 'error';
      testResults.testResults.hotelSearchService = {
        error: error.message
      };
    }
    
    // Test full recommendation generation
    const result = await travelAdvisoryService.generateRecommendations(preference);
    
    res.json({
      success: true,
      test: true,
      dataSources: testResults.dataSources,
      testResults: testResults.testResults,
      recommendationGeneration: {
        totalHotelsFound: result.totalHotelsFound,
        recommendationsGenerated: result.recommendationsGenerated,
        recommendationsCount: result.recommendations?.length || 0,
        sampleRecommendation: result.recommendations?.[0] || null
      },
      environment: {
        cozyCozyEnabled: process.env.COZYCOZY_ENABLED,
        cozyCozyHasToken: !!process.env.COZYCOZY_AUTH_TOKEN,
        cozyCozyApiUrl: process.env.COZYCOZY_API_URL
      }
    });
  } catch (error) {
    console.error('🧪 TEST Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;

