const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
const { MockVendor, MockVendorService } = require('../services/mockVendorService');
const { authenticate, authorize } = require('../middleware/auth');
const { validateVendor, validateVendorAssignment } = require('../middleware/validation');

// Helper function to get the appropriate Vendor model
const getVendorModel = () => {
  const mongoose = require('mongoose');
  // Use real database if MongoDB is connected, otherwise use mock
  return mongoose.connection.readyState === 1 ? Vendor : MockVendor;
};

// Get all vendors
router.get('/', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER']), async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const VendorModel = getVendorModel();
    const mongoose = require('mongoose');
    
    let queryObj = {};
    if (status) queryObj.status = status;
    if (search) {
      queryObj.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { 'contactPerson.firstName': { $regex: search, $options: 'i' } },
        { 'contactPerson.lastName': { $regex: search, $options: 'i' } },
        { vendorId: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Real MongoDB - use proper queries
      const skip = (page - 1) * parseInt(limit);
      const vendors = await VendorModel.find(queryObj)
        .limit(parseInt(limit))
        .skip(skip)
        .sort({ createdAt: -1 })
        .lean();
      const total = await VendorModel.countDocuments(queryObj);
      
      return res.json({
        success: true,
        vendors,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } else {
      // Mock data - filter in memory
      let vendors = await VendorModel.find(queryObj);
      let filteredVendors = Array.isArray(vendors) ? vendors : [];
      
      if (search) {
        const searchLower = search.toLowerCase();
        filteredVendors = filteredVendors.filter(vendor => 
          vendor.companyName?.toLowerCase().includes(searchLower) ||
          vendor.contactPerson?.firstName?.toLowerCase().includes(searchLower) ||
          vendor.contactPerson?.lastName?.toLowerCase().includes(searchLower) ||
          vendor.vendorId?.toLowerCase().includes(searchLower)
        );
      }
      
      const startIndex = (page - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedVendors = filteredVendors.slice(startIndex, endIndex);
      
      return res.json({
        success: true,
        vendors: paginatedVendors,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total: filteredVendors.length,
          pages: Math.ceil(filteredVendors.length / parseInt(limit))
        }
      });
    }
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message
    });
  }
});

// Get single vendor
router.get('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER']), async (req, res) => {
  try {
    const VendorModel = getVendorModel();
    const vendor = await VendorModel.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    res.json({
      success: true,
      vendor
    });
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor',
      error: error.message
    });
  }
});

// Create new vendor
router.post('/', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), validateVendor, async (req, res) => {
  try {
    const VendorModel = getVendorModel();
    
    // Check if vendor already exists (only check vendorId if provided)
    const queryConditions = [
      { 'contactPerson.email': req.body.contactPerson.email }
    ];
    
    if (req.body.vendorId && req.body.vendorId.trim() !== '') {
      queryConditions.push({ vendorId: req.body.vendorId });
    }
    
    const existingVendor = await VendorModel.findOne({
      $or: queryConditions
    });
    
    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: 'Vendor with this ID or email already exists'
      });
    }
    
    // Create new vendor - remove vendorId if empty/undefined so pre-save hook can generate it
    const vendorData = { ...req.body };
    if (!vendorData.vendorId || vendorData.vendorId.trim() === '') {
      delete vendorData.vendorId;
    }
    
    const vendor = new VendorModel({
      ...vendorData,
      createdBy: req.user._id
    });
    
    await vendor.save();
    
    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      vendor
    });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vendor',
      error: error.message
    });
  }
});

// Update vendor
router.put('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const VendorModel = getVendorModel();
    const vendor = await VendorModel.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Update vendor data
    const updateData = {
      ...req.body,
      updatedBy: req.user._id,
      updatedAt: new Date()
    };
    
    const updatedVendor = await VendorModel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Vendor updated successfully',
      vendor: updatedVendor
    });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor',
      error: error.message
    });
  }
});

// Delete vendor
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const VendorModel = getVendorModel();
    const vendor = await VendorModel.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Check if vendor has active assignments
    if (vendor.assignedCustomers && vendor.assignedCustomers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete vendor with active customer assignments'
      });
    }
    
    await VendorModel.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vendor',
      error: error.message
    });
  }
});

// Assign vendor to customer
router.post('/:id/assign-customer', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), validateVendorAssignment, async (req, res) => {
  try {
    const { customerId, notes } = req.body;
    const VendorModel = getVendorModel();
    
    const vendor = await VendorModel.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Check if customer is already assigned
    const existingAssignment = vendor.assignedCustomers.find(
      ac => ac.customerId === customerId
    );
    
    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Customer is already assigned to this vendor'
      });
    }
    
    // Add customer assignment
    vendor.assignedCustomers.push({
      customerId,
      assignedAt: new Date(),
      assignedBy: req.user._id,
      notes: notes || ''
    });
    
    await vendor.save();
    
    res.json({
      success: true,
      message: 'Customer assigned to vendor successfully',
      vendor
    });
  } catch (error) {
    console.error('Assign customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign customer to vendor',
      error: error.message
    });
  }
});

// Remove customer assignment
router.delete('/:id/assign-customer/:customerId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { customerId } = req.params;
    const VendorModel = getVendorModel();
    
    const vendor = await VendorModel.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Remove customer assignment
    vendor.assignedCustomers = vendor.assignedCustomers.filter(
      ac => ac.customerId !== customerId
    );
    
    await vendor.save();
    
    res.json({
      success: true,
      message: 'Customer assignment removed successfully',
      vendor
    });
  } catch (error) {
    console.error('Remove assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove customer assignment',
      error: error.message
    });
  }
});

// Get vendors assigned to a specific customer
router.get('/customer/:customerId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER']), async (req, res) => {
  try {
    const { customerId } = req.params;
    const VendorModel = getVendorModel();
    
    const vendors = await VendorModel.find({
      'assignedCustomers.customerId': customerId,
      status: 'active'
    });
    
    res.json({
      success: true,
      vendors,
      count: vendors.length
    });
  } catch (error) {
    console.error('Get customer vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer vendors',
      error: error.message
    });
  }
});

// Update vendor performance
router.patch('/:id/performance', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { rating, totalBookings, completedBookings, cancelledBookings, averageResponseTime } = req.body;
    const VendorModel = getVendorModel();
    
    const vendor = await VendorModel.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Update performance metrics
    if (rating !== undefined) vendor.performance.rating = rating;
    if (totalBookings !== undefined) vendor.performance.totalBookings = totalBookings;
    if (completedBookings !== undefined) vendor.performance.completedBookings = completedBookings;
    if (cancelledBookings !== undefined) vendor.performance.cancelledBookings = cancelledBookings;
    if (averageResponseTime !== undefined) vendor.performance.averageResponseTime = averageResponseTime;
    
    vendor.performance.lastActive = new Date();
    vendor.updatedBy = req.user._id;
    
    await vendor.save();
    
    res.json({
      success: true,
      message: 'Vendor performance updated successfully',
      vendor
    });
  } catch (error) {
    console.error('Update performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor performance',
      error: error.message
    });
  }
});

// Get vendor statistics (aggregated)
router.get('/stats/overview', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER']), async (req, res) => {
  try {
    const VendorModel = getVendorModel();
    const Transfer = require('../models/Transfer');
    const mongoose = require('mongoose');
    
    // Get vendor counts by status
    const vendorStats = await VendorModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusCounts = vendorStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});
    
    // Calculate average rating
    const avgRatingResult = await VendorModel.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$performance.rating' },
          totalVendors: { $sum: 1 }
        }
      }
    ]);
    
    const avgRating = avgRatingResult[0]?.avgRating || 0;
    
    // Calculate total bookings across all vendors
    const totalBookingsResult = await VendorModel.aggregate([
      {
        $group: {
          _id: null,
          totalBookings: { $sum: '$performance.totalBookings' },
          completedBookings: { $sum: '$performance.completedBookings' },
          cancelledBookings: { $sum: '$performance.cancelledBookings' }
        }
      }
    ]);
    
    const bookings = totalBookingsResult[0] || {
      totalBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0
    };
    
    // Get total transfers from Transfer collection if available
    let totalTransfers = 0;
    if (mongoose.connection.readyState === 1) {
      try {
        totalTransfers = await Transfer.countDocuments();
      } catch (err) {
        // If Transfer model not available, use vendor performance data
        totalTransfers = bookings.totalBookings;
      }
    } else {
      totalTransfers = bookings.totalBookings;
    }
    
    res.json({
      success: true,
      stats: {
        totalVendors: statusCounts.active + (statusCounts.inactive || 0) + (statusCounts.pending_approval || 0) + (statusCounts.suspended || 0) || 0,
        activeVendors: statusCounts.active || 0,
        inactiveVendors: statusCounts.inactive || 0,
        pendingVendors: statusCounts.pending_approval || 0,
        suspendedVendors: statusCounts.suspended || 0,
        averageRating: Number(avgRating.toFixed(1)),
        totalTransfers: totalTransfers,
        totalBookings: bookings.totalBookings,
        completedBookings: bookings.completedBookings,
        cancelledBookings: bookings.cancelledBookings
      }
    });
  } catch (error) {
    console.error('Get vendor stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor statistics',
      error: error.message
    });
  }
});

module.exports = router;