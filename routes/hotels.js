const express = require('express');
const router = express.Router();
const Hotel = require('../models/Hotel');
const HotelSearchService = require('../services/hotelSearchService');
const { authenticate, authorize } = require('../middleware/auth');

// Initialize hotel search service
const hotelSearchService = new HotelSearchService();

// Search hotels by city
router.post('/search', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { city, filters, limit = 50 } = req.body;
    
    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City is required'
      });
    }

    
    // Search hotels from multiple sources
    const searchResults = await hotelSearchService.searchHotels(city, filters);
    
    // Limit results if specified
    if (limit && limit > 0) {
      searchResults.hotels = searchResults.hotels.slice(0, limit);
    }

    res.json({
      success: true,
      city: city.toUpperCase(),
      totalResults: searchResults.totalResults,
      sources: searchResults.sources,
      hotels: searchResults.hotels,
      filters: filters || {}
    });
  } catch (error) {
    console.error('Hotel search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search hotels',
      error: error.message
    });
  }
});

// Get all hotels (stored in system)
router.get('/', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { city, starRating, minPrice, maxPrice, status, page = 1, limit = 20 } = req.query;
    
    let query = {};
    
    if (city) query.city = city.toUpperCase();
    if (starRating) query.starRating = { $gte: parseInt(starRating) };
    if (minPrice || maxPrice) {
      query['pricing.basePrice'] = {};
      if (minPrice) query['pricing.basePrice'].$gte = parseInt(minPrice);
      if (maxPrice) query['pricing.basePrice'].$lte = parseInt(maxPrice);
    }
    if (status) query.status = status;
    
    const hotels = await Hotel.find(query);
    
    // Simple pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedHotels = hotels.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      hotels: paginatedHotels,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total: hotels.length,
        pages: Math.ceil(hotels.length / limit)
      }
    });
  } catch (error) {
    console.error('Get hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hotels',
      error: error.message
    });
  }
});

// Get single hotel
router.get('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER']), async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }
    
    res.json({
      success: true,
      hotel
    });
  } catch (error) {
    console.error('Get hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hotel',
      error: error.message
    });
  }
});

// Create new hotel
router.post('/', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    
    // Check if hotel already exists
    const existingHotel = await Hotel.findOne({
      name: req.body.name,
      city: req.body.city?.toUpperCase()
    });
    
    if (existingHotel) {
      return res.status(400).json({
        success: false,
        message: 'Hotel already exists in this city'
      });
    }
    
    // Create new hotel
    const hotel = new HotelModel({
      ...req.body,
      city: req.body.city?.toUpperCase(),
      createdBy: req.user._id
    });
    
    await hotel.save();
    
    res.status(201).json({
      success: true,
      message: 'Hotel created successfully',
      hotel
    });
  } catch (error) {
    console.error('Create hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create hotel',
      error: error.message
    });
  }
});

// Update hotel
router.put('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }
    
    const updatedHotel = await Hotel.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Hotel updated successfully',
      hotel: updatedHotel
    });
  } catch (error) {
    console.error('Update hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update hotel',
      error: error.message
    });
  }
});

// Assign hotel to customer
router.post('/:id/assign', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { customerId, checkIn, checkOut, guests, roomType, notes, bookingReference } = req.body;
    
    const hotel = await Hotel.findById(req.params.id);
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }
    
    // Add customer assignment
    hotel.assignedToCustomers.push({
      customerId,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guests: guests || { adults: 2, children: 0 },
      roomType: roomType || 'Standard Room',
      bookingStatus: 'pending',
      bookingReference: bookingReference || `HTL-${Date.now()}`,
      notes: notes || '',
      assignedBy: req.user._id
    });
    
    hotel.performance.totalBookings += 1;
    hotel.performance.lastBooked = new Date();
    
    await hotel.save();
    
    res.json({
      success: true,
      message: 'Hotel assigned to customer successfully',
      hotel
    });
  } catch (error) {
    console.error('Assign hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign hotel to customer',
      error: error.message
    });
  }
});

// Get hotels assigned to a customer
router.get('/customer/:customerId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER']), async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const hotels = await Hotel.find({ 'assignedToCustomers.customerId': customerId });
    
    res.json({
      success: true,
      hotels,
      count: hotels.length
    });
  } catch (error) {
    console.error('Get customer hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer hotels',
      error: error.message
    });
  }
});

// Get hotels by city
router.get('/city/:city', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER']), async (req, res) => {
  try {
    const { city } = req.params;
    
    const hotels = await Hotel.find({ city: city.toUpperCase() });
    
    res.json({
      success: true,
      hotels,
      count: hotels.length
    });
  } catch (error) {
    console.error('Get city hotels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hotels for city',
      error: error.message
    });
  }
});

// Update booking status
router.patch('/:id/booking/:bookingIndex', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { bookingIndex } = req.params;
    const { bookingStatus } = req.body;
    
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }
    
    if (bookingIndex >= hotel.assignedToCustomers.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking index'
      });
    }
    
    hotel.assignedToCustomers[bookingIndex].bookingStatus = bookingStatus;
    
    if (bookingStatus === 'cancelled' && hotel.performance.totalBookings > 0) {
      hotel.performance.cancellationRate = 
        ((hotel.performance.totalBookings - 1) / hotel.performance.totalBookings) * 100;
    }
    
    await hotel.save();
    
    res.json({
      success: true,
      message: 'Booking status updated successfully',
      hotel
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
});

// Delete hotel
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const hotel = await Hotel.findById(req.params.id);
    
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: 'Hotel not found'
      });
    }
    
    // Check if hotel has active bookings
    const activeBookings = hotel.assignedToCustomers.filter(
      booking => booking.bookingStatus === 'confirmed' || booking.bookingStatus === 'pending'
    );
    
    if (activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete hotel with active bookings'
      });
    }
    
    await Hotel.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Hotel deleted successfully'
    });
  } catch (error) {
    console.error('Delete hotel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete hotel',
      error: error.message
    });
  }
});

// Get hotel statistics
router.get('/stats/overview', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    
    const totalHotels = await Hotel.countDocuments();
    const activeHotels = await Hotel.countDocuments({ status: 'active', isAvailable: true });
    const verifiedHotels = await Hotel.countDocuments({ verified: true });
    
    // Get hotels by star rating
    const byStars = {
      five: await Hotel.countDocuments({ starRating: 5 }),
      four: await Hotel.countDocuments({ starRating: 4 }),
      three: await Hotel.countDocuments({ starRating: 3 })
    };
    
    // Get total bookings from database
    const bookingsResult = await Hotel.aggregate([
      {
        $group: {
          _id: null,
          totalBookings: { $sum: '$performance.totalBookings' }
        }
      }
    ]);
    const totalBookings = bookingsResult[0]?.totalBookings || 0;
    
    res.json({
      success: true,
      stats: {
        totalHotels,
        activeHotels,
        verifiedHotels,
        byStars,
        totalBookings
      }
    });
  } catch (error) {
    console.error('Get hotel stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get hotel statistics',
      error: error.message
    });
  }
});

module.exports = router;
