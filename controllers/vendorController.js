const Transfer = require('../models/Transfer');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const moment = require('moment');

// Get transfers by vendor
const getVendorTransfers = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      date_from,
      date_to
    } = req.query;

    // Build filter
    const filter = { 'vendor_details.vendor_id': vendorId };
    
    if (status) {
      filter['transfer_details.transfer_status'] = status;
    }
    
    if (date_from || date_to) {
      filter['flight_details.arrival_time'] = {};
      if (date_from) {
        filter['flight_details.arrival_time'].$gte = new Date(date_from);
      }
      if (date_to) {
        filter['flight_details.arrival_time'].$lte = new Date(date_to);
      }
    }

    // Execute query with pagination
    const transfers = await Transfer.find(filter)
      .sort({ 'flight_details.arrival_time': 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Transfer.countDocuments(filter);

    // Get vendor statistics
    const stats = await Transfer.aggregate([
      { $match: { 'vendor_details.vendor_id': vendorId } },
      {
        $group: {
          _id: '$transfer_details.transfer_status',
          count: { $sum: 1 }
        }
      }
    ]);

    const vendorStats = stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: transfers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      },
      stats: vendorStats
    });
  } catch (error) {
    console.error('Error fetching vendor transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor transfers',
      error: error.message
    });
  }
};

// Get vendor dashboard data
const getVendorDashboard = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    // Get today's transfers
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const todayTransfers = await Transfer.find({
      'vendor_details.vendor_id': vendorId,
      'flight_details.arrival_time': {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).sort({ 'flight_details.arrival_time': 1 });

    // Get upcoming transfers (next 24 hours)
    const upcomingTransfers = await Transfer.find({
      'vendor_details.vendor_id': vendorId,
      'flight_details.arrival_time': { $gte: new Date() },
      'transfer_details.transfer_status': { $in: ['pending', 'assigned', 'enroute'] }
    }).sort({ 'flight_details.arrival_time': 1 }).limit(10);

    // Get transfers requiring attention
    const attentionTransfers = await Transfer.find({
      'vendor_details.vendor_id': vendorId,
      $or: [
        { 'flight_details.status': 'landed', 'assigned_driver_details.status': { $ne: 'waiting' } },
        { 'flight_details.status': 'cancelled' },
        { 'transfer_details.transfer_status': 'pending', 'flight_details.arrival_time': { $lte: new Date(Date.now() + 2 * 60 * 60 * 1000) } }
      ]
    }).sort({ 'flight_details.arrival_time': 1 });

    // Get statistics
    const stats = await Transfer.aggregate([
      { $match: { 'vendor_details.vendor_id': vendorId } },
      {
        $group: {
          _id: '$transfer_details.transfer_status',
          count: { $sum: 1 }
        }
      }
    ]);

    const vendorStats = stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    // Get driver performance
    const driverStats = await Transfer.aggregate([
      { 
        $match: { 
          'vendor_details.vendor_id': vendorId,
          'assigned_driver_details.driver_id': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$assigned_driver_details.driver_id',
          name: { $first: '$assigned_driver_details.name' },
          totalTransfers: { $sum: 1 },
          completedTransfers: {
            $sum: {
              $cond: [{ $eq: ['$transfer_details.transfer_status', 'completed'] }, 1, 0]
            }
          },
          averageRating: { $avg: '$driver_rating' } // Assuming rating field exists
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        today: todayTransfers,
        upcoming: upcomingTransfers,
        attention: attentionTransfers,
        stats: vendorStats,
        drivers: driverStats
      }
    });
  } catch (error) {
    console.error('Error fetching vendor dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor dashboard',
      error: error.message
    });
  }
};

// Assign driver to vendor transfer
const assignDriverToVendorTransfer = async (req, res) => {
  try {
    const { vendorId, transferId } = req.params;
    const driverDetails = req.body;
    
    // Verify transfer belongs to vendor
    const transfer = await Transfer.findOne({
      _id: transferId,
      'vendor_details.vendor_id': vendorId
    });

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found or does not belong to this vendor'
      });
    }

    // Assign driver (doesn't save yet)
    transfer.assignDriver(driverDetails, `vendor:${vendorId}`);
    
    // Save the transfer first
    await transfer.save();

    // Send notification to customer
    try {
      const message = MESSAGE_TEMPLATES.driverAssigned(
        transfer.customer_details.name,
        driverDetails.name,
        driverDetails.vehicle_type,
        driverDetails.vehicle_number,
        transfer.transfer_details.pickup_location,
        moment(transfer.transfer_details.estimated_pickup_time).format('MMMM Do YYYY, h:mm A')
      );

      await sendNotification(
        transfer.customer_details.contact_number,
        message,
        'whatsapp'
      );

      // Record notification in transfer and save again
      transfer.addNotificationRecord(
        'whatsapp',
        message,
        transfer.customer_details.contact_number
      );
      await transfer.save();
    } catch (notificationError) {
      console.error('Failed to send driver assignment notification:', notificationError);
    }

    res.json({
      success: true,
      message: 'Driver assigned successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error assigning driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign driver',
      error: error.message
    });
  }
};

// Update driver status for vendor
const updateVendorDriverStatus = async (req, res) => {
  try {
    const { vendorId, transferId } = req.params;
    const { status, location } = req.body;
    
    // Verify transfer belongs to vendor
    const transfer = await Transfer.findOne({
      _id: transferId,
      'vendor_details.vendor_id': vendorId
    });

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found or does not belong to this vendor'
      });
    }

    if (!transfer.assigned_driver_details) {
      return res.status(400).json({
        success: false,
        message: 'No driver assigned to this transfer'
      });
    }

    // Update driver status
    transfer.assigned_driver_details.status = status;
    if (location) {
      transfer.assigned_driver_details.location = location;
    }
    
    transfer.addAuditLog('driver_updated', `vendor:${vendorId}`, `Driver status changed to ${status}`);
    await transfer.save();

    // Send status update notification if driver is waiting
    if (status === 'waiting') {
      try {
        const message = MESSAGE_TEMPLATES.driverWaiting(
          transfer.customer_details.name,
          transfer.assigned_driver_details.name,
          transfer.assigned_driver_details.vehicle_type,
          transfer.assigned_driver_details.vehicle_number,
          transfer.transfer_details.pickup_location
        );

        await sendNotification(
          transfer.customer_details.contact_number,
          message,
          'whatsapp'
        );

        await transfer.addNotificationRecord(
          'whatsapp',
          message,
          transfer.customer_details.contact_number
        );
      } catch (notificationError) {
        console.error('Failed to send driver waiting notification:', notificationError);
      }
    }

    res.json({
      success: true,
      message: 'Driver status updated successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error updating driver status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update driver status',
      error: error.message
    });
  }
};

// Get vendor performance metrics
const getVendorPerformance = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { period = '30' } = req.query; // days
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const performance = await Transfer.aggregate([
      {
        $match: {
          'vendor_details.vendor_id': vendorId,
          'create_time': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalTransfers: { $sum: 1 },
          completedTransfers: {
            $sum: {
              $cond: [{ $eq: ['$transfer_details.transfer_status', 'completed'] }, 1, 0]
            }
          },
          cancelledTransfers: {
            $sum: {
              $cond: [{ $eq: ['$transfer_details.transfer_status', 'cancelled'] }, 1, 0]
            }
          },
          averageDelay: {
            $avg: {
              $cond: [
                { $gt: ['$flight_details.delay_minutes', 0] },
                '$flight_details.delay_minutes',
                null
              ]
            }
          }
        }
      }
    ]);

    const result = performance[0] || {
      totalTransfers: 0,
      completedTransfers: 0,
      cancelledTransfers: 0,
      averageDelay: 0
    };

    result.completionRate = result.totalTransfers > 0 
      ? (result.completedTransfers / result.totalTransfers * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching vendor performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor performance',
      error: error.message
    });
  }
};

module.exports = {
  getVendorTransfers,
  getVendorDashboard,
  assignDriverToVendorTransfer,
  updateVendorDriverStatus,
  getVendorPerformance
};
