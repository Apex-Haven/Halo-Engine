const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const googleSheetsSyncService = require('../services/googleSheetsSyncService');

/**
 * @route   GET /api/travelers
 * @desc    Get all travelers created by the logged-in client
 * @access  Private (CLIENT role only)
 */
router.get('/', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    let query = { role: 'TRAVELER' };

    // If not Super Admin/Admin, only show travelers created by this client
    if (req.user.role === 'CLIENT') {
      query.createdBy = req.user._id;
    }

    const travelers = await User.find(query)
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
 * @route   GET /api/travelers/export
 * @desc    Export travelers to Excel
 * @access  Private (CLIENT, SUPER_ADMIN, ADMIN)
 */
router.get('/export', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (requireError) {
      console.error('Failed to require xlsx module:', requireError);
      return res.status(500).json({
        success: false,
        message: 'Excel export functionality is not available. Please install the xlsx package: npm install xlsx',
        error: 'xlsx module not found'
      });
    }
    
    const User = require('../models/User');

    // Build query based on user role
    let query = { role: 'TRAVELER' };
    
    // CLIENT users can only export their own travelers
    if (req.user.role === 'CLIENT') {
      query.createdBy = req.user._id;
    }

    // Fetch travelers
    const travelers = await User.find(query)
      .select('username email profile preferences createdBy')
      .populate('createdBy', 'username email profile vendorDetails companyName')
      .sort({ createdAt: -1 });

    if (travelers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No travelers found to export'
      });
    }

    // Prepare data for Excel
    const excelData = travelers.map(traveler => ({
      'First Name': traveler.profile?.firstName || '',
      'Last Name': traveler.profile?.lastName || '',
      'Email': traveler.email || '',
      'Phone': traveler.profile?.phone || '',
      'Username': traveler.username || '',
      'Client': traveler.createdBy?.vendorDetails?.companyName || 
                traveler.createdBy?.companyName || 
                (traveler.createdBy?.profile?.firstName && traveler.createdBy?.profile?.lastName 
                  ? `${traveler.createdBy.profile.firstName} ${traveler.createdBy.profile.lastName}`.trim()
                  : traveler.createdBy?.username || traveler.createdBy?.email || 'Unassigned'),
      'Created At': traveler.createdAt ? new Date(traveler.createdAt).toLocaleString() : ''
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Travelers');

    // Set column widths
    const columnWidths = [
      { wch: 15 }, // First Name
      { wch: 15 }, // Last Name
      { wch: 30 }, // Email
      { wch: 18 }, // Phone
      { wch: 20 }, // Username
      { wch: 25 }, // Client
      { wch: 20 }  // Created At
    ];
    worksheet['!cols'] = columnWidths;

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    const filename = `travelers-export-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting travelers:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to export travelers',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    const traveler = await User.findById(id)
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
 * @desc    Create traveler
 * @access  Private (CLIENT, SUPER_ADMIN, ADMIN)
 */
router.post('/', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { username, email, password, profile, preferences, clientId } = req.body;

    // Validate required fields
    if (!username || !email || !password || !profile?.firstName || !profile?.lastName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, email, password, firstName, lastName'
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

    // Determine createdBy: use clientId if provided (for admins), otherwise use req.user._id
    let createdByUserId = req.user._id;
    
    // If admin provided a clientId, validate it and use it
    if (clientId && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN')) {
      const client = await User.findById(clientId);
      if (!client || client.role !== 'CLIENT') {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID provided'
        });
      }
      createdByUserId = clientId;
    }

    // Create traveler
    const traveler = new User({
      username,
      email,
      password,
      role: 'TRAVELER',
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone || '',
        job_position: profile.job_position || '',
        company_name: profile.company_name || '',
        consent_email: profile.consent_email ?? null,
        consent_whatsapp: profile.consent_whatsapp ?? null,
        whatsapp_number: profile.whatsapp_number || ''
      },
      createdBy: createdByUserId,
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
    const travelerResponse = await User.findById(traveler._id)
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
 * @access  Private (CLIENT, SUPER_ADMIN, ADMIN - CLIENT can only update their own travelers)
 */
router.put('/:id', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, profile, preferences } = req.body;

    const traveler = await User.findById(id);

    if (!traveler || traveler.role !== 'TRAVELER') {
      return res.status(404).json({
        success: false,
        message: 'Traveler not found'
      });
    }

    // Verify client created this traveler (admins can update any traveler)
    if (req.user.role === 'CLIENT' && traveler.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if email/username is already taken by another user
    if (email !== traveler.email || username !== traveler.username) {
      const existingUser = await User.findOne({
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
      if (profile.phone !== undefined) updateData['profile.phone'] = profile.phone;
      if (profile.job_position !== undefined) updateData['profile.job_position'] = profile.job_position;
      if (profile.company_name !== undefined) updateData['profile.company_name'] = profile.company_name;
      if (profile.consent_email !== undefined) updateData['profile.consent_email'] = profile.consent_email;
      if (profile.consent_whatsapp !== undefined) updateData['profile.consent_whatsapp'] = profile.consent_whatsapp;
      if (profile.whatsapp_number !== undefined) updateData['profile.whatsapp_number'] = profile.whatsapp_number;
    }
    if (preferences) updateData.preferences = preferences;
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    const updatedTraveler = await User.findByIdAndUpdate(
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
 * @route   DELETE /api/travelers/bulk
 * @desc    Delete multiple travelers
 * @access  Private (CLIENT, SUPER_ADMIN, ADMIN - CLIENT can only delete their own travelers)
 */
router.delete('/bulk', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    console.log('🗑️  Bulk delete request received');
    console.log('Request body:', req.body);
    console.log('Request method:', req.method);
    
    const { travelerIds } = req.body;

    if (!travelerIds || !Array.isArray(travelerIds) || travelerIds.length === 0) {
      console.log('❌ Invalid travelerIds:', travelerIds);
      return res.status(400).json({
        success: false,
        message: 'Traveler IDs array is required',
        received: req.body
      });
    }

    // Fetch all travelers to verify permissions
    const travelers = await User.find({
      _id: { $in: travelerIds },
      role: 'TRAVELER'
    });

    if (travelers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No travelers found with the provided IDs'
      });
    }

    // Verify permissions: CLIENT can only delete their own travelers
    if (req.user.role === 'CLIENT') {
      const unauthorizedTravelers = travelers.filter(
        traveler => traveler.createdBy?.toString() !== req.user._id.toString()
      );
      
      if (unauthorizedTravelers.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only delete travelers you created'
        });
      }
    }

    // Delete travelers
    const deleteResult = await User.deleteMany({
      _id: { $in: travelerIds },
      role: 'TRAVELER'
    });

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.deletedCount} traveler(s)`,
      data: {
        deletedCount: deleteResult.deletedCount,
        requestedCount: travelerIds.length
      }
    });
  } catch (error) {
    console.error('Error deleting travelers in bulk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete travelers',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/travelers/:id
 * @desc    Delete traveler
 * @access  Private (CLIENT, SUPER_ADMIN, ADMIN - CLIENT can only delete their own travelers)
 */
router.delete('/:id', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    const traveler = await User.findById(id);

    if (!traveler || traveler.role !== 'TRAVELER') {
      return res.status(404).json({
        success: false,
        message: 'Traveler not found'
      });
    }

    // Verify client created this traveler (admins can delete any traveler)
    if (req.user.role === 'CLIENT' && traveler.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await User.findByIdAndDelete(id);

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

/**
 * @route   POST /api/travelers/sync-from-sheets
 * @desc    Sync travelers from Google Sheets
 * @access  Private (CLIENT, SUPER_ADMIN, ADMIN)
 * @note    CLIENT users can only sync travelers that will be assigned to them
 */
router.post('/sync-from-sheets', authenticate, authorize(['CLIENT', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { sheetId, sheetName } = req.body;

    if (!sheetId) {
      return res.status(400).json({
        success: false,
        message: 'Google Sheet ID is required'
      });
    }

    console.log(`🔄 Starting Google Sheets sync for sheet: ${sheetId}`);
    console.log(`👤 User role: ${req.user.role}, User ID: ${req.user._id}`);

    // For CLIENT users, all synced travelers will be assigned to them
    // For SUPER_ADMIN/ADMIN, travelers will be assigned based on Client column in sheet
    const syncUserId = req.user._id;
    const forceClientAssignment = req.user.role === 'CLIENT';

    // Perform sync
    const syncResults = await googleSheetsSyncService.syncTravelersFromSheet(
      sheetId,
      sheetName || '',
      syncUserId,
      forceClientAssignment
    );

    if (syncResults.success) {
      res.json({
        success: true,
        message: syncResults.message,
        data: {
          total: syncResults.total,
          created: syncResults.created,
          updated: syncResults.updated,
          skipped: syncResults.skipped,
          errors: syncResults.errors
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: syncResults.message,
        data: {
          total: syncResults.total,
          created: syncResults.created,
          updated: syncResults.updated,
          skipped: syncResults.skipped,
          errors: syncResults.errors
        }
      });
    }
  } catch (error) {
    console.error('Error syncing from Google Sheets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync from Google Sheets',
      error: error.message
    });
  }
});

module.exports = router;

