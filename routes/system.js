const express = require('express');
const router = express.Router();
const User = require('../models/User');
const googleSheetsSyncService = require('../services/googleSheetsSyncService');
const { authenticate } = require('../middleware/auth');

// Get system sync status
router.get('/sync-status', authenticate, async (req, res) => {
  try {
    // Get sync status from database or environment
    const syncStatus = {
      travelers: {
        lastSync: new Date(), // This should come from your sync logs table
        status: 'success',
        recordCount: 0 // This should come from your sync logs
      },
      drivers: {
        lastSync: new Date(),
        status: 'success',
        recordCount: 0
      },
      system: {
        status: 'healthy',
        lastCheck: new Date()
      }
    };

    // Try to get actual counts from database
    try {
      const travelerCount = await User.countDocuments({ role: 'TRAVELER' });
      const driverCount = await User.countDocuments({ role: 'DRIVER' });
      
      syncStatus.travelers.recordCount = travelerCount;
      syncStatus.drivers.recordCount = driverCount;
    } catch (countError) {
      console.error('Error getting user counts:', countError);
    }

    res.json({
      success: true,
      syncStatus
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sync status'
    });
  }
});

// Manual sync trigger
router.post('/sync-travelers', authenticate, async (req, res) => {
  try {
    // Get sheet ID from environment or settings
    const sheetId = process.env.GOOGLE_SHEETS_TRAVELERS_ID;
    if (!sheetId) {
      return res.status(400).json({
        success: false,
        message: 'Travelers sheet ID not configured'
      });
    }

    const result = await googleSheetsSyncService.syncTravelersFromSheet(sheetId);
    
    res.json({
      success: true,
      message: `Successfully synced ${result.synced} travelers`,
      ...result
    });
  } catch (error) {
    console.error('Error syncing travelers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync travelers'
    });
  }
});

// Manual sync trigger for drivers
router.post('/sync-drivers', authenticate, async (req, res) => {
  try {
    // Get sheet ID from environment or settings
    const sheetId = process.env.GOOGLE_SHEETS_DRIVERS_ID;
    if (!sheetId) {
      return res.status(400).json({
        success: false,
        message: 'Drivers sheet ID not configured'
      });
    }

    const result = await googleSheetsSyncService.syncDriversFromSheet(sheetId);
    
    res.json({
      success: true,
      message: `Successfully synced ${result.synced} drivers`,
      ...result
    });
  } catch (error) {
    console.error('Error syncing drivers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync drivers'
    });
  }
});

// Sync all
router.post('/sync-all', authenticate, async (req, res) => {
  try {
    const results = {
      travelers: { success: false, message: 'Not configured' },
      drivers: { success: false, message: 'Not configured' }
    };

    // Sync travelers if configured
    if (process.env.GOOGLE_SHEETS_TRAVELERS_ID) {
      try {
        results.travelers = await googleSheetsSyncService.syncTravelersFromSheet(
          process.env.GOOGLE_SHEETS_TRAVELERS_ID
        );
      } catch (error) {
        results.travelers = { success: false, message: error.message };
      }
    }

    // Sync drivers if configured
    if (process.env.GOOGLE_SHEETS_DRIVERS_ID) {
      try {
        results.drivers = await googleSheetsSyncService.syncDriversFromSheet(
          process.env.GOOGLE_SHEETS_DRIVERS_ID
        );
      } catch (error) {
        results.drivers = { success: false, message: error.message };
      }
    }

    res.json({
      success: true,
      message: 'Sync completed',
      results
    });
  } catch (error) {
    console.error('Error syncing all:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync all data'
    });
  }
});

module.exports = router;
