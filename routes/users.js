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
 * @route   GET /api/users
 * @desc    Get all users (SUPER_ADMIN, ADMIN, VENDOR, CLIENT - excludes TRAVELER and DRIVER)
 * @access  Private (Super Admin/Admin only)
 */
router.get('/', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const UserModel = getUserModel();
    const users = await UserModel.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'VENDOR', 'CLIENT'] }
    })
    .select('-password')
    .populate('createdBy', 'username email profile')
    .populate('assignedClients', 'username email profile')
    .populate('assignedVendors', 'username email profile')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/users/vendors
 * @desc    Get all vendors
 * @access  Private (Super Admin/Admin only)
 */
router.get('/vendors', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const UserModel = getUserModel();
    const vendors = await UserModel.find({ role: 'VENDOR' })
      .select('-password')
      .populate('assignedClients', 'username email profile')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: vendors,
      count: vendors.length
    });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/users/clients
 * @desc    Get all clients
 * @access  Private (Super Admin/Admin only)
 */
router.get('/clients', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const UserModel = getUserModel();
    const clients = await UserModel.find({ role: 'CLIENT' })
      .select('-password')
      .populate('assignedVendors', 'username email profile')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: clients,
      count: clients.length
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/users/vendors/:vendorId/clients
 * @desc    Get assigned clients for a vendor (names only)
 * @access  Private
 */
router.get('/vendors/:vendorId/clients', authenticate, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const UserModel = getUserModel();

    const vendor = await UserModel.findById(vendorId)
      .select('assignedClients')
      .populate('assignedClients', 'username email profile.firstName profile.lastName');

    if (!vendor || vendor.role !== 'VENDOR') {
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
    console.error('Error fetching vendor clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor clients',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/users/clients/:clientId/vendors
 * @desc    Get assigned vendors for a client (names only)
 * @access  Private
 */
router.get('/clients/:clientId/vendors', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    const UserModel = getUserModel();

    const client = await UserModel.findById(clientId)
      .select('assignedVendors')
      .populate('assignedVendors', 'username email profile.firstName profile.lastName vendorDetails.companyName');

    if (!client || client.role !== 'CLIENT') {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Return only names
    const vendorNames = client.assignedVendors.map(vendor => ({
      id: vendor._id,
      name: vendor.vendorDetails?.companyName || `${vendor.profile.firstName} ${vendor.profile.lastName}`,
      email: vendor.email
    }));

    res.json({
      success: true,
      data: vendorNames
    });
  } catch (error) {
    console.error('Error fetching client vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client vendors',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get single user by ID
 * @access  Private (Super Admin/Admin only)
 */
router.get('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const UserModel = getUserModel();
    const user = await UserModel.findById(req.params.id)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .populate('assignedClients', 'username email profile')
      .populate('assignedVendors', 'username email profile');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/users
 * @desc    Create ADMIN (Super Admin only), VENDOR, or CLIENT account
 * @access  Private (Super Admin/Admin only)
 */
router.post('/', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { username, email, password, role, profile, preferences, vendorDetails } = req.body;

    // Validate role
    // SUPER_ADMIN can create ADMIN, VENDOR, or CLIENT
    // ADMIN can only create VENDOR or CLIENT
    const allowedRoles = req.user.role === 'SUPER_ADMIN' 
      ? ['ADMIN', 'VENDOR', 'CLIENT']
      : ['VENDOR', 'CLIENT'];
    
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${allowedRoles.join(', ')}`
      });
    }

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

    // Create new user
    const userData = {
      username,
      email,
      password,
      role,
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
    };

    // Add vendor details if role is VENDOR
    if (role === 'VENDOR' && vendorDetails) {
      userData.vendorDetails = vendorDetails;
    }

    const user = new UserModel(userData);
    await user.save();

    // Return user without password
    const userResponse = await UserModel.findById(user._id)
      .select('-password')
      .populate('createdBy', 'username email profile');

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      data: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Super Admin/Admin only)
 */
router.put('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, password, profile, preferences, vendorDetails } = req.body;

    const UserModel = getUserModel();
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent updating protected users (except by Super Admin)
    if (user.isProtected && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update protected user'
      });
    }

    // Check if email/username is already taken by another user
    if (email !== user.email || username !== user.username) {
      const existingUser = await UserModel.findOne({
        $or: [{ email }, { username }],
        _id: { $ne: userId }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email or username already taken by another user'
        });
      }
    }

    // Update user data
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (profile) {
      updateData['profile.firstName'] = profile.firstName;
      updateData['profile.lastName'] = profile.lastName;
      if (profile.phone) updateData['profile.phone'] = profile.phone;
    }
    if (preferences) updateData.preferences = preferences;
    if (vendorDetails && user.role === 'VENDOR') {
      updateData.vendorDetails = vendorDetails;
    }
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password')
    .populate('createdBy', 'username email profile')
    .populate('assignedClients', 'username email profile')
    .populate('assignedVendors', 'username email profile');

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private (Super Admin/Admin only)
 */
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const userId = req.params.id;
    const UserModel = getUserModel();
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting protected users (Super Admin)
    if (user.isProtected) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete protected user'
      });
    }

    // Prevent Admin from deleting other Admins
    if (user.role === 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admins cannot delete other admins'
      });
    }

    await UserModel.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/users/vendors/:vendorId/assign-client/:clientId
 * @desc    Assign client to vendor
 * @access  Private (Super Admin/Admin only)
 */
router.post('/vendors/:vendorId/assign-client/:clientId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { vendorId, clientId } = req.params;
    const UserModel = getUserModel();

    const vendor = await UserModel.findById(vendorId);
    const client = await UserModel.findById(clientId);

    if (!vendor || vendor.role !== 'VENDOR') {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (!client || client.role !== 'CLIENT') {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if already assigned
    if (vendor.assignedClients.includes(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Client is already assigned to this vendor'
      });
    }

    // Add client to vendor's assignedClients
    vendor.assignedClients.push(clientId);
    await vendor.save();

    // Add vendor to client's assignedVendors
    if (!client.assignedVendors.includes(vendorId)) {
      client.assignedVendors.push(vendorId);
      await client.save();
    }

    const updatedVendor = await UserModel.findById(vendorId)
      .select('-password')
      .populate('assignedClients', 'username email profile');

    res.json({
      success: true,
      message: 'Client assigned to vendor successfully',
      data: updatedVendor
    });
  } catch (error) {
    console.error('Error assigning client to vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign client to vendor',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/users/vendors/:vendorId/unassign-client/:clientId
 * @desc    Unassign client from vendor
 * @access  Private (Super Admin/Admin only)
 */
router.delete('/vendors/:vendorId/unassign-client/:clientId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { vendorId, clientId } = req.params;
    const UserModel = getUserModel();

    const vendor = await UserModel.findById(vendorId);
    const client = await UserModel.findById(clientId);

    if (!vendor || vendor.role !== 'VENDOR') {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (!client || client.role !== 'CLIENT') {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Remove client from vendor's assignedClients
    vendor.assignedClients = vendor.assignedClients.filter(
      id => id.toString() !== clientId
    );
    await vendor.save();

    // Remove vendor from client's assignedVendors
    client.assignedVendors = client.assignedVendors.filter(
      id => id.toString() !== vendorId
    );
    await client.save();

    const updatedVendor = await UserModel.findById(vendorId)
      .select('-password')
      .populate('assignedClients', 'username email profile');

    res.json({
      success: true,
      message: 'Client unassigned from vendor successfully',
      data: updatedVendor
    });
  } catch (error) {
    console.error('Error unassigning client from vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign client from vendor',
      error: error.message
    });
  }
});

module.exports = router;
