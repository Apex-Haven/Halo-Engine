const express = require('express');
const router = express.Router();
const Transfer = require('../models/Transfer');
const User = require('../models/User');
const googleSheetsSyncService = require('../services/googleSheetsSyncService');
const { authenticate } = require('../middleware/auth');

// Test endpoint
router.get('/test', authenticate, async (req, res) => {
  try {
    console.log('🧪 Operations test endpoint called');
    res.json({
      success: true,
      message: 'Operations route is working!',
      user: req.user.email
    });
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Test endpoint failed'
    });
  }
});

// Get operations dashboard data
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    console.log('🔍 Fetching operations dashboard data...');
    
    // Get all transfers with populated details
    const transfers = await Transfer.find({})
      .populate('customer_id', 'name email contact_number')
      .populate('traveler_id', 'name phone email')
      .sort({ 'transfer_details.estimated_pickup_time': 1 })
      .lean(); // Use lean for better performance

    console.log(`✅ Found ${transfers.length} transfers`);

    // Calculate stage metrics
    const stageMetrics = {
      pending: 0,
      assigned: 0,
      enroute: 0,
      in_progress: 0,
      completed: 0
    };

    transfers.forEach(transfer => {
      // Onward leg
      const onwardStatus = transfer.transfer_details?.transfer_status || 'pending';
      if (stageMetrics.hasOwnProperty(onwardStatus)) {
        stageMetrics[onwardStatus]++;
      }
      // Return leg (if present)
      if (transfer.return_transfer_details) {
        const returnStatus = transfer.return_transfer_details.transfer_status || 'pending';
        if (stageMetrics.hasOwnProperty(returnStatus)) {
          stageMetrics[returnStatus]++;
        }
      }
    });

    console.log('📊 Stage metrics:', stageMetrics);

    res.json({
      success: true,
      transfers,
      stageMetrics,
      total: transfers.length
    });
  } catch (error) {
    console.error('❌ Error fetching operations dashboard data:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

// Update transfer stage (onward or return leg)
router.put('/transfers/:id/stage', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, leg = 'onward' } = req.body;

    // Validate stage
    const validStages = ['pending', 'assigned', 'enroute', 'in_progress', 'completed'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid stage'
      });
    }

    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }

    if (leg === 'return') {
      if (!transfer.return_transfer_details) {
        return res.status(400).json({
          success: false,
          message: 'This transfer has no return leg'
        });
      }
      transfer.return_transfer_details.transfer_status = stage;
    } else {
      transfer.transfer_details.transfer_status = stage;
    }

    // Add audit log
    const legLabel = leg === 'return' ? 'Return leg ' : '';
    transfer.audit_log.push({
      action: 'status_changed',
      timestamp: new Date(),
      by: req.user.email,
      details: `${legLabel}Status changed to ${stage}`
    });

    await transfer.save();

    res.json({
      success: true,
      message: 'Transfer stage updated successfully'
    });
  } catch (error) {
    console.error('Error updating transfer stage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transfer stage'
    });
  }
});

module.exports = router;
