const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { MockUser, MockUserService } = require('../services/mockUserService');
const { authenticate, authorize } = require('../middleware/auth');

// Helper function to get the appropriate User model
const getUserModel = () => {
  return MockUserService.isUsingMockData() ? MockUser : User;
};

/**
 * @route   GET /api/drivers
 * @desc    Get all drivers for the logged-in vendor
 * @access  Private (VENDOR role only)
 */
router.get('/', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const UserModel = getUserModel();
    let query = { role: 'DRIVER' };

    // If not Super Admin/Admin, only show drivers for this vendor
    if (req.user.role === 'VENDOR') {
      query.vendorId = req.user._id.toString();
      query.createdBy = req.user._id;
    }

    const drivers = await UserModel.find(query)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .populate('vendorId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: drivers,
      count: drivers.length
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drivers',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/drivers/:id
 * @desc    Get single driver by ID
 * @access  Private (VENDOR role only - can only access their own drivers)
 */
router.get('/:id', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const UserModel = getUserModel();
    const driver = await UserModel.findById(id)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .populate('vendorId');

    if (!driver || driver.role !== 'DRIVER') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // If VENDOR, verify they created this driver
    if (req.user.role === 'VENDOR') {
      if (driver.createdBy.toString() !== req.user._id.toString() || 
          driver.vendorId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    res.json({
      success: true,
      data: driver
    });
  } catch (error) {
    console.error('Error fetching driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/drivers
 * @desc    Create driver (VENDOR role only)
 * @access  Private (VENDOR role only)
 */
router.post('/', authenticate, authorize(['VENDOR']), async (req, res) => {
  try {
    const { username, email, password, profile, preferences, driverDetails } = req.body;

    // Validate required fields
    if (!username || !email || !password || !profile?.firstName || !profile?.lastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, email, password, firstName, lastName'
      });
    }

    const UserModel = getUserModel();

    // Check if user already exists
    const existingUser = await UserModel.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }

    // Generate driver ID
    const driverId = `DRV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create driver
    const driver = new UserModel({
      username,
      email,
      password,
      role: 'DRIVER',
      vendorId: req.user._id.toString(),
      driverId: driverId,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone || ''
      },
      createdBy: req.user._id,
      driverDetails: driverDetails || {
        licenseNumber: '',
        vehicleType: '',
        vehicleNumber: '',
        experience: 0,
        rating: 0,
        isActive: true
      },
      preferences: preferences || {
        notifications: {
          email: true,
          sms: true,
          whatsapp: true,
          push: true
        },
        language: 'en',
        timezone: 'Asia/Kolkata'
      }
    });

    await driver.save();

    // Return driver without password
    const driverResponse = await UserModel.findById(driver._id)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .populate('vendorId');

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: driverResponse
    });
  } catch (error) {
    console.error('Error creating driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create driver',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/drivers/:id
 * @desc    Update driver
 * @access  Private (VENDOR role only - can only update their own drivers)
 */
router.put('/:id', authenticate, authorize(['VENDOR']), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, profile, preferences, driverDetails } = req.body;

    const UserModel = getUserModel();
    const driver = await UserModel.findById(id);

    if (!driver || driver.role !== 'DRIVER') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Verify vendor created this driver
    if (driver.createdBy.toString() !== req.user._id.toString() || 
        driver.vendorId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if email/username is already taken by another user
    if (email !== driver.email || username !== driver.username) {
      const existingUser = await UserModel.findOne({
        $or: [{ email }, { username }],
        _id: { $ne: id }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email or username already taken by another user'
        });
      }
    }

    // Update driver data
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (profile) {
      updateData['profile.firstName'] = profile.firstName;
      updateData['profile.lastName'] = profile.lastName;
      if (profile.phone) updateData['profile.phone'] = profile.phone;
    }
    if (preferences) updateData.preferences = preferences;
    if (driverDetails) {
      updateData.driverDetails = { ...driver.driverDetails, ...driverDetails };
    }
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    const updatedDriver = await UserModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password')
    .populate('createdBy', 'username email profile')
    .populate('vendorId');

    res.json({
      success: true,
      message: 'Driver updated successfully',
      data: updatedDriver
    });
  } catch (error) {
    console.error('Error updating driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update driver',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/drivers/:id
 * @desc    Delete driver
 * @access  Private (VENDOR role only - can only delete their own drivers)
 */
router.delete('/:id', authenticate, authorize(['VENDOR']), async (req, res) => {
  try {
    const { id } = req.params;
    const UserModel = getUserModel();
    const driver = await UserModel.findById(id);

    if (!driver || driver.role !== 'DRIVER') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Verify vendor created this driver
    if (driver.createdBy.toString() !== req.user._id.toString() || 
        driver.vendorId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await UserModel.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Driver deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete driver',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/drivers/:driverId/assigned-clients
 * @desc    Get assigned clients for a driver (names only)
 * @access  Private (VENDOR role only)
 */
router.get('/:driverId/assigned-clients', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { driverId } = req.params;
    const UserModel = getUserModel();

    const driver = await UserModel.findById(driverId);
    if (!driver || driver.role !== 'DRIVER') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // If VENDOR, verify driver belongs to them
    if (req.user.role === 'VENDOR' && driver.vendorId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get vendor and their assigned clients
    const vendor = await UserModel.findById(driver.vendorId)
      .select('assignedClients')
      .populate('assignedClients', 'username email profile.firstName profile.lastName');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Return only names
    const clientNames = vendor.assignedClients.map(client => ({
      id: client._id,
      name: `${client.profile.firstName} ${client.profile.lastName}`,
      email: client.email
    }));

    res.json({
      success: true,
      data: clientNames
    });
  } catch (error) {
    console.error('Error fetching driver assigned clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver assigned clients',
      error: error.message
    });
  }
});

module.exports = router;

