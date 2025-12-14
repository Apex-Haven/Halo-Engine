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
 * @route   GET /api/travelers
 * @desc    Get all travelers created by the logged-in client
 * @access  Private (CLIENT role only)
 */
router.get('/', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const UserModel = getUserModel();
    let query = { role: 'TRAVELER' };

    // If not Super Admin/Admin, only show travelers created by this client
    if (req.user.role === 'CLIENT') {
      query.createdBy = req.user._id;
    }

    const travelers = await UserModel.find(query)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: travelers,
      count: travelers.length
    });
  } catch (error) {
    console.error('Error fetching travelers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch travelers',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/travelers/:id
 * @desc    Get single traveler by ID
 * @access  Private (CLIENT role only - can only access their own travelers)
 */
router.get('/:id', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const UserModel = getUserModel();
    const traveler = await UserModel.findById(id)
      .select('-password')
      .populate('createdBy', 'username email profile');

    if (!traveler || traveler.role !== 'TRAVELER') {
      return res.status(404).json({
        success: false,
        message: 'Traveler not found'
      });
    }

    // If CLIENT, verify they created this traveler
    if (req.user.role === 'CLIENT' && traveler.createdBy && traveler.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: traveler
    });
  } catch (error) {
    console.error('Error fetching traveler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch traveler',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/travelers
 * @desc    Create traveler (CLIENT role only)
 * @access  Private (CLIENT role only)
 */
router.post('/', authenticate, authorize(['CLIENT']), async (req, res) => {
  try {
    const { username, email, password, profile, preferences } = req.body;

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

    // Create traveler
    const traveler = new UserModel({
      username,
      email,
      password,
      role: 'TRAVELER',
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone || ''
      },
      createdBy: req.user._id,
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

    await traveler.save();

    // Return traveler without password
    const travelerResponse = await UserModel.findById(traveler._id)
      .select('-password')
      .populate('createdBy', 'username email profile');

    res.status(201).json({
      success: true,
      message: 'Traveler created successfully',
      data: travelerResponse
    });
  } catch (error) {
    console.error('Error creating traveler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create traveler',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/travelers/:id
 * @desc    Update traveler
 * @access  Private (CLIENT role only - can only update their own travelers)
 */
router.put('/:id', authenticate, authorize(['CLIENT']), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, profile, preferences } = req.body;

    const UserModel = getUserModel();
    const traveler = await UserModel.findById(id);

    if (!traveler || traveler.role !== 'TRAVELER') {
      return res.status(404).json({
        success: false,
        message: 'Traveler not found'
      });
    }

    // Verify client created this traveler
    if (traveler.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if email/username is already taken by another user
    if (email !== traveler.email || username !== traveler.username) {
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

    // Update traveler data
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (profile) {
      updateData['profile.firstName'] = profile.firstName;
      updateData['profile.lastName'] = profile.lastName;
      if (profile.phone) updateData['profile.phone'] = profile.phone;
    }
    if (preferences) updateData.preferences = preferences;
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    const updatedTraveler = await UserModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password')
    .populate('createdBy', 'username email profile');

    res.json({
      success: true,
      message: 'Traveler updated successfully',
      data: updatedTraveler
    });
  } catch (error) {
    console.error('Error updating traveler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update traveler',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/travelers/:id
 * @desc    Delete traveler
 * @access  Private (CLIENT role only - can only delete their own travelers)
 */
router.delete('/:id', authenticate, authorize(['CLIENT']), async (req, res) => {
  try {
    const { id } = req.params;
    const UserModel = getUserModel();
    const traveler = await UserModel.findById(id);

    if (!traveler || traveler.role !== 'TRAVELER') {
      return res.status(404).json({
        success: false,
        message: 'Traveler not found'
      });
    }

    // Verify client created this traveler
    if (traveler.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await UserModel.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Traveler deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting traveler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete traveler',
      error: error.message
    });
  }
});

module.exports = router;

