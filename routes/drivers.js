const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const googleSheetsSyncService = require('../services/googleSheetsSyncService');

/**
 * @route   GET /api/drivers
 * @desc    Get all drivers for the logged-in vendor
 * @access  Private (VENDOR role only)
 */
router.get('/', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    let query = { role: 'DRIVER' };

    // If not Super Admin/Admin, only show drivers for this vendor
    if (req.user.role === 'VENDOR') {
      query.vendorId = req.user._id.toString();
      query.createdBy = req.user._id;
    }

    const drivers = await User.find(query)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .populate('vendorId', 'username email profile vendorDetails companyName')
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
 * @route   GET /api/drivers/export
 * @desc    Export drivers to Excel
 * @access  Private (VENDOR, SUPER_ADMIN, ADMIN)
 */
router.get('/export', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
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

    // Build query based on user role - match the regular GET route logic
    let query = { role: 'DRIVER' };
    
    // VENDOR users can only export their own drivers
    if (req.user.role === 'VENDOR') {
      query.vendorId = req.user._id.toString();
      query.createdBy = req.user._id;
    }

    console.log('🔍 Export query:', JSON.stringify(query, null, 2));
    console.log('👤 User role:', req.user.role, 'User ID:', req.user._id);

    // Fetch drivers
    const drivers = await User.find(query)
      .select('username email profile driverDetails vendorId createdBy role')
      .populate('vendorId', 'username email profile vendorDetails companyName')
      .populate('createdBy', 'username email profile vendorDetails companyName')
      .sort({ createdAt: -1 });

    console.log(`📊 Found ${drivers.length} drivers to export`);
    if (drivers.length > 0) {
      console.log('📋 Sample driver roles:', drivers.slice(0, 3).map(d => ({ 
        username: d.username, 
        role: d.role, 
        email: d.email 
      })));
    }

    if (drivers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No drivers found to export'
      });
    }

    // Filter out any users that don't have DRIVER role (safety check)
    const validDrivers = drivers.filter(driver => {
      if (driver.role !== 'DRIVER') {
        console.warn(`⚠️ Skipping user ${driver.username} (${driver.email}) - has role "${driver.role}" instead of "DRIVER"`);
        return false;
      }
      return true;
    });

    if (validDrivers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid drivers found to export. All users found have incorrect role.'
      });
    }

    // Prepare data for Excel
    const excelData = validDrivers.map(driver => {
      const vendorName = driver.vendorId?.vendorDetails?.companyName || 
                        driver.vendorId?.companyName || 
                        (driver.vendorId?.profile?.firstName && driver.vendorId?.profile?.lastName 
                          ? `${driver.vendorId.profile.firstName} ${driver.vendorId.profile.lastName}`.trim()
                          : driver.vendorId?.username || driver.vendorId?.email || 'Unassigned');

      return {
        'First Name': driver.profile?.firstName || '',
        'Last Name': driver.profile?.lastName || '',
        'Email': driver.email || '',
        'Phone': driver.profile?.phone || '',
        'Username': driver.username || '',
        'Role': driver.role || 'DRIVER', // Include role for verification
        'Vendor': vendorName,
        'License Number': driver.driverDetails?.licenseNumber || '',
        'Vehicle Type': driver.driverDetails?.vehicleType || '',
        'Vehicle Number': driver.driverDetails?.vehicleNumber || '',
        'Experience (Years)': driver.driverDetails?.experience || 0,
        'Created At': driver.createdAt ? new Date(driver.createdAt).toLocaleString() : ''
      };
    });

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Drivers');

    // Set column widths
    const columnWidths = [
      { wch: 15 }, // First Name
      { wch: 15 }, // Last Name
      { wch: 30 }, // Email
      { wch: 18 }, // Phone
      { wch: 20 }, // Username
      { wch: 12 }, // Role
      { wch: 25 }, // Vendor
      { wch: 18 }, // License Number
      { wch: 15 }, // Vehicle Type
      { wch: 18 }, // Vehicle Number
      { wch: 18 }, // Experience
      { wch: 20 }  // Created At
    ];
    worksheet['!cols'] = columnWidths;

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    const filename = `drivers-export-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting drivers:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to export drivers',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    const driver = await User.findById(id)
      .select('-password')
      .populate('createdBy', 'username email profile')
      .populate('vendorId', 'username email profile vendorDetails companyName');

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
 * @desc    Create driver (VENDOR, SUPER_ADMIN, ADMIN roles)
 * @access  Private (VENDOR, SUPER_ADMIN, ADMIN roles)
 */
router.post('/', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { username, email, password, profile, preferences, driverDetails, vendorId } = req.body;

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

    // Determine vendorId based on user role
    let finalVendorId = req.user._id.toString();
    let finalCreatedBy = req.user._id;

    // If admin provided vendorId, validate and use it
    if ((req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') && vendorId) {
      const vendor = await User.findById(vendorId);
      if (!vendor || vendor.role !== 'VENDOR') {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendorId. The provided ID does not correspond to a VENDOR user.'
        });
      }
      finalVendorId = vendorId;
      finalCreatedBy = vendorId;
    }

    // Generate driver ID
    const driverId = `DRV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create driver
    const driver = new User({
      username,
      email,
      password,
      role: 'DRIVER',
      vendorId: finalVendorId,
      driverId: driverId,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone || ''
      },
      createdBy: finalCreatedBy,
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
    const driverResponse = await User.findById(driver._id)
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

    const driver = await User.findById(id);

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

    const updatedDriver = await User.findByIdAndUpdate(
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
 * @route   POST /api/drivers/sync-from-sheets
 * @desc    Sync drivers from Google Sheets
 * @access  Private (VENDOR, SUPER_ADMIN, ADMIN)
 * @note    VENDOR users can only sync drivers that will be assigned to them
 */
router.post('/sync-from-sheets', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { sheetId, sheetName } = req.body;

    if (!sheetId) {
      return res.status(400).json({
        success: false,
        message: 'Google Sheet ID is required'
      });
    }

    console.log(`🔄 Starting Google Sheets sync for drivers, sheet: ${sheetId}`);
    console.log(`👤 User role: ${req.user.role}, User ID: ${req.user._id}`);

    // For VENDOR users, all synced drivers will be assigned to them
    // For SUPER_ADMIN/ADMIN, drivers will be assigned based on Vendor column in sheet
    const syncUserId = req.user._id;
    const forceVendorAssignment = req.user.role === 'VENDOR';

    // Perform sync
    const syncResults = await googleSheetsSyncService.syncDriversFromSheet(
      sheetId,
      sheetName || '',
      syncUserId,
      forceVendorAssignment
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
    console.error('Error syncing drivers from Google Sheets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync from Google Sheets',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/drivers/bulk
 * @desc    Delete multiple drivers
 * @access  Private (VENDOR, SUPER_ADMIN, ADMIN - VENDOR can only delete their own drivers)
 */
router.delete('/bulk', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    console.log('🗑️  Bulk delete request received for drivers');
    console.log('Request body:', req.body);
    console.log('Request method:', req.method);

    const { driverIds } = req.body;

    if (!driverIds || !Array.isArray(driverIds) || driverIds.length === 0) {
      console.log('❌ Invalid driverIds:', driverIds);
      return res.status(400).json({
        success: false,
        message: 'Driver IDs array is required',
        received: req.body
      });
    }

    // Fetch all drivers to verify permissions
    const driversToDelete = await User.find({
      _id: { $in: driverIds },
      role: 'DRIVER'
    });

    if (driversToDelete.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No drivers found with the provided IDs'
      });
    }

    // Verify permissions: VENDOR can only delete their own drivers
    if (req.user.role === 'VENDOR') {
      const unauthorizedDrivers = driversToDelete.filter(
        driver => driver.createdBy?.toString() !== req.user._id.toString() && driver.vendorId?.toString() !== req.user._id.toString()
      );

      if (unauthorizedDrivers.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only delete drivers you created or are assigned to your vendor account'
        });
      }
    }

    // Delete drivers
    const deleteResult = await User.deleteMany({
      _id: { $in: driverIds },
      role: 'DRIVER'
    });

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.deletedCount} driver(s)`,
      data: {
        deletedCount: deleteResult.deletedCount,
        requestedCount: driverIds.length
      }
    });
  } catch (error) {
    console.error('Error deleting drivers in bulk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete drivers',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/drivers/:id
 * @desc    Delete driver
 * @access  Private (VENDOR role only - can only delete their own drivers)
 */
router.delete('/:id', authenticate, authorize(['VENDOR', 'SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await User.findById(id);

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

    await User.findByIdAndDelete(id);

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

    const driver = await User.findById(driverId);
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

    // Check if vendorId exists before querying
    if (!driver.vendorId) {
      console.warn(`Driver ${driverId} has no vendorId assigned (orphaned driver)`);
      return res.json({
        success: true,
        data: []
      });
    }

    // Get vendor and their assigned clients
    const vendor = await User.findById(driver.vendorId)
      .select('assignedClients')
      .populate('assignedClients', 'username email profile.firstName profile.lastName');

    if (!vendor) {
      // Log warning for orphaned driver (driver with missing vendor)
      console.warn(`Driver ${driverId} references non-existent vendor ${driver.vendorId} (orphaned driver)`);
      // Return empty array instead of error to prevent UI disruption
      return res.json({
        success: true,
        data: []
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

