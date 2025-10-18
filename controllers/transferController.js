const Transfer = require('../models/Transfer');
const { sendTemplatedEmail } = require('../config/nodemailer');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const moment = require('moment');

// Check if we're using mock data
const isUsingMockData = () => {
  return !process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/halo';
};

// Get the appropriate Transfer model
const getTransferModel = () => {
  if (isUsingMockData()) {
    const { MockTransfer } = require('../services/mockDataService');
    return MockTransfer;
  }
  return Transfer;
};

// Create new transfer
const createTransfer = async (req, res) => {
  try {
    const transferData = req.body;
    const TransferModel = getTransferModel();
    
    // Check if transfer already exists
    const existingTransfer = await TransferModel.findById(transferData._id);
    if (existingTransfer) {
      return res.status(409).json({
        success: false,
        message: 'Transfer with this Apex ID already exists',
        apexId: transferData._id
      });
    }

    // Create new transfer
    const transfer = new TransferModel(transferData);
    await transfer.save();

    // Send confirmation email to customer
    try {
      await sendTemplatedEmail(
        transfer.customer_details.email,
        'driverAssigned',
        [
          transfer.customer_details.name,
          'TBD', // Driver name will be updated when assigned
          'TBD', // Vehicle type
          'TBD', // Vehicle number
          transfer.transfer_details.pickup_location,
          moment(transfer.transfer_details.estimated_pickup_time).format('MMMM Do YYYY, h:mm A'),
          transfer._id
        ]
      );
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Transfer created successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error creating transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transfer',
      error: error.message
    });
  }
};

// Get transfer by ID
const getTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const TransferModel = getTransferModel();
    
    const transfer = await TransferModel.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    res.json({
      success: true,
      data: transfer
    });
  } catch (error) {
    console.error('Error fetching transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transfer',
      error: error.message
    });
  }
};

// Get all transfers with filtering and pagination
const getTransfers = async (req, res) => {
  try {
    const TransferModel = getTransferModel();
    const {
      page = 1,
      limit = 10,
      status,
      vendor_id,
      driver_id,
      flight_no,
      date_from,
      date_to,
      search
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) {
      filter['transfer_details.status'] = status;
    }
    
    if (vendor_id) {
      filter['vendor_details.vendor_id'] = vendor_id;
    }
    
    if (driver_id) {
      filter['assigned_driver_details.driver_id'] = driver_id;
    }
    
    if (flight_no) {
      filter['flight_details.flight_number'] = flight_no.toUpperCase();
    }
    
    if (date_from || date_to) {
      filter['flight_details.scheduled_arrival'] = {};
      if (date_from) {
        filter['flight_details.scheduled_arrival'].$gte = new Date(date_from);
      }
      if (date_to) {
        filter['flight_details.scheduled_arrival'].$lte = new Date(date_to);
      }
    }
    
    if (search) {
      filter.$or = [
        { _id: { $regex: search, $options: 'i' } },
        { 'customer_details.name': { $regex: search, $options: 'i' } },
        { 'customer_details.email': { $regex: search, $options: 'i' } },
        { 'flight_details.flight_number': { $regex: search, $options: 'i' } },
        { 'vendor_details.vendor_name': { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const transfers = await TransferModel.find(filter);
    const total = transfers.length;

    res.json({
      success: true,
      data: transfers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transfers',
      error: error.message
    });
  }
};

// Update transfer
const updateTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // Update transfer
    Object.assign(transfer, updateData);
    await transfer.save();

    res.json({
      success: true,
      message: 'Transfer updated successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error updating transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transfer',
      error: error.message
    });
  }
};

// Assign driver to transfer
const assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driverDetails = req.body;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // Assign driver
    await transfer.assignDriver(driverDetails, 'api');

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

      // Send WhatsApp notification
      await sendNotification(
        transfer.customer_details.contact_number,
        message,
        'whatsapp'
      );

      // Send email notification
      await sendTemplatedEmail(
        transfer.customer_details.email,
        'driverAssigned',
        [
          transfer.customer_details.name,
          driverDetails.name,
          driverDetails.vehicle_type,
          driverDetails.vehicle_number,
          transfer.transfer_details.pickup_location,
          moment(transfer.transfer_details.estimated_pickup_time).format('MMMM Do YYYY, h:mm A'),
          transfer._id
        ]
      );

      // Record notification in transfer
      await transfer.addNotificationRecord(
        'whatsapp',
        message,
        transfer.customer_details.contact_number
      );
    } catch (notificationError) {
      console.error('Failed to send driver assignment notification:', notificationError);
      // Don't fail the request if notification fails
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

// Update driver status
const updateDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, location } = req.body;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
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
    
    await transfer.addAuditLog('driver_updated', 'api', `Driver status changed to ${status}`);
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

// Delete transfer
const deleteTransfer = async (req, res) => {
  try {
    const { id } = req.params;
    
    const transfer = await Transfer.findByIdAndDelete(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    res.json({
      success: true,
      message: 'Transfer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete transfer',
      error: error.message
    });
  }
};

// Get transfer statistics
const getTransferStats = async (req, res) => {
  try {
    const TransferModel = getTransferModel();
    
    if (isUsingMockData()) {
      // Mock stats for demo
      const mockStats = {
        total: 156,
        today: 23,
        upcoming: 8,
        byStatus: {
          completed: 89,
          in_progress: 12,
          assigned: 8,
          pending: 3,
          cancelled: 2
        },
        successRate: 94,
        averageRating: 4.7,
        activeVendors: 8,
        activeDrivers: 24
      };
      
      return res.json({
        success: true,
        data: mockStats
      });
    }

    const stats = await TransferModel.aggregate([
      {
        $group: {
          _id: '$transfer_details.status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalTransfers = await TransferModel.countDocuments();
    const todayTransfers = await TransferModel.countDocuments({
      'flight_details.scheduled_arrival': {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999))
      }
    });

    const upcomingTransfers = await TransferModel.countDocuments({
      'flight_details.scheduled_arrival': { $gte: new Date() },
      'transfer_details.status': { $in: ['pending', 'assigned', 'enroute'] }
    });

    res.json({
      success: true,
      data: {
        total: totalTransfers,
        today: todayTransfers,
        upcoming: upcomingTransfers,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Error fetching transfer stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transfer statistics',
      error: error.message
    });
  }
};

module.exports = {
  createTransfer,
  getTransfer,
  getTransfers,
  updateTransfer,
  assignDriver,
  updateDriverStatus,
  deleteTransfer,
  getTransferStats
};
