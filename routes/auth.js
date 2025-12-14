const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { MockUser } = require('../services/mockUserService');
const { authenticate, authorize } = require('../middleware/auth');
const { authLimiter, registrationLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { logAuthEvent } = require('../middleware/auditLogger');

// Check if we're using mock data
const isUsingMockData = () => {
  const mongoose = require('mongoose');
  // Use mock data only if MongoDB is not connected
  return mongoose.connection.readyState !== 1; // 1 = connected
};

// Get the appropriate User model
const getUserModel = () => {
  const mongoose = require('mongoose');
  // Use real database if MongoDB is connected, otherwise use mock
  return mongoose.connection.readyState === 1 ? User : MockUser;
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Restricted - only Super Admin/Admin can create accounts)
 * @access  Private (Super Admin/Admin only)
 */
router.post('/register', registrationLimiter, authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      role = 'CUSTOMER',
      vendorId,
      driverId,
      vendorDetails,
      driverDetails
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }

    // Validate role-specific requirements
    if (role === 'VENDOR_MANAGER' || role === 'DRIVER') {
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: 'Vendor ID is required for vendor managers and drivers'
        });
      }
    }

    if (role === 'DRIVER') {
      if (!driverId) {
        return res.status(400).json({
          success: false,
          message: 'Driver ID is required for drivers'
        });
      }
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      role,
      profile: {
        firstName,
        lastName,
        phone
      },
      vendorId,
      driverId,
      vendorDetails,
      driverDetails
    });

    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          vendorId: user.vendorId,
          driverId: user.driverId
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const mongoose = require('mongoose');
    const UserModel = getUserModel();
    let user;
    
    if (mongoose.connection.readyState === 1) {
      // Real MongoDB - use Mongoose query with password field
      user = await UserModel.findOne({ email }).select('+password');
    } else {
      // Mock data - find user directly from the Map to get the actual instance
      const { MockUserService } = require('../services/mockUserService');
      for (const u of MockUserService.users.values()) {
        if (u.email === email) {
          user = u;
          break;
        }
      }
    }
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      await logAuthEvent(req, 'login_failure', 'failure', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Reset login attempts and update last login
    await user.resetLoginAttempts();

    // Generate token
    const token = user.generateAuthToken();
    
    // Log successful login
    await logAuthEvent(req, 'login_success', 'success', { email, userId: user._id });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          vendorId: user.vendorId,
          driverId: user.driverId,
          preferences: user.preferences
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        profile: req.user.profile,
        vendorId: req.user.vendorId,
        driverId: req.user.driverId,
        preferences: req.user.preferences,
        lastLogin: req.user.lastLogin,
        createdAt: req.user.createdAt
      }
    }
  });
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, phone, preferences } = req.body;
    
    const updateData = {};
    
    if (firstName) updateData['profile.firstName'] = firstName;
    if (lastName) updateData['profile.lastName'] = lastName;
    if (phone) updateData['profile.phone'] = phone;
    if (preferences) updateData.preferences = preferences;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          preferences: user.preferences
        }
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/auth/roles
 * @desc    Get available roles
 * @access  Private (Admin only)
 */
router.get('/roles', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), (req, res) => {
  const roles = [
    {
      value: 'SUPER_ADMIN',
      label: 'Super Admin',
      description: 'Full system access and user management'
    },
    {
      value: 'ADMIN',
      label: 'Administrator',
      description: 'Full transfer and vendor/client management'
    },
    {
      value: 'VENDOR',
      label: 'Vendor',
      description: 'Manage drivers and handle assigned client transfers'
    },
    {
      value: 'CLIENT',
      label: 'Client',
      description: 'Manage travelers and view assigned vendor transfers'
    }
  ];

  res.json({
    success: true,
    data: { roles }
  });
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh-token', authenticate, (req, res) => {
  try {
    const token = req.user.generateAuthToken();
    
    res.json({
      success: true,
      data: { token }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      error: error.message
    });
  }
});

module.exports = router;
