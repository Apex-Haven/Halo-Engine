const Transfer = require('../models/Transfer');
const mongoose = require('mongoose');
const { sendTemplatedEmail } = require('../config/nodemailer');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const moment = require('moment');

// Check if we're using mock data - check actual MongoDB connection status
const isUsingMockData = () => {
  // Use mock data only if MongoDB is not connected
  return mongoose.connection.readyState !== 1; // 1 = connected
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

    // Validate and convert customer_id and vendor_id to ObjectId
    if (!transferData.customer_id || transferData.customer_id === '' || transferData.customer_id === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field',
        error: 'customer_id is required and cannot be empty'
      });
    }
    
    if (!transferData.vendor_id || transferData.vendor_id === '' || transferData.vendor_id === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field',
        error: 'vendor_id is required and cannot be empty'
      });
    }

    // Convert customer_id to ObjectId if it's a string
    if (typeof transferData.customer_id === 'string') {
      if (!mongoose.Types.ObjectId.isValid(transferData.customer_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid customer_id format',
          error: `customer_id "${transferData.customer_id}" must be a valid MongoDB ObjectId (24 hex characters)`
        });
      }
      transferData.customer_id = new mongoose.Types.ObjectId(transferData.customer_id);
    }
    
    // Convert vendor_id to ObjectId if it's a string
    if (typeof transferData.vendor_id === 'string') {
      if (!mongoose.Types.ObjectId.isValid(transferData.vendor_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor_id format',
          error: `vendor_id "${transferData.vendor_id}" must be a valid MongoDB ObjectId (24 hex characters)`
        });
      }
      transferData.vendor_id = new mongoose.Types.ObjectId(transferData.vendor_id);
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
    const mongoose = require('mongoose');
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
    
    // If user is VENDOR, automatically filter by their vendor details
    if (req.user && req.user.role === 'VENDOR') {
      // Match transfers by vendor email or company name
      const vendorEmail = req.user.email;
      const vendorCompanyName = req.user.vendorDetails?.companyName;
      
      if (vendorEmail || vendorCompanyName) {
        // Build OR condition to match by email or company name
        const vendorConditions = [];
        
        if (vendorEmail) {
          vendorConditions.push({ 'vendor_details.email': vendorEmail });
        }
        
        if (vendorCompanyName) {
          vendorConditions.push({ 'vendor_details.vendor_name': vendorCompanyName });
        }
        
        // Also try to match by vendor_id ObjectId if Vendor model exists
        const VendorModel = mongoose.connection.readyState === 1 
          ? require('../models/Vendor')
          : null;
        
        if (VendorModel && mongoose.connection.readyState === 1) {
          try {
            let vendor = null;
            if (vendorCompanyName) {
              vendor = await VendorModel.findOne({ companyName: vendorCompanyName });
            }
            if (!vendor && vendorEmail) {
              vendor = await VendorModel.findOne({ 'contactPerson.email': vendorEmail });
            }
            if (vendor) {
              vendorConditions.push({ vendor_id: vendor._id });
            }
          } catch (err) {
            console.error('Error finding vendor:', err);
          }
        }
        
        if (vendorConditions.length > 0) {
          filter.$or = filter.$or || [];
          filter.$or.push(...vendorConditions);
        } else {
          // No matching criteria found, return empty results
          return res.json({
            success: true,
            data: [],
            pagination: {
              current: parseInt(page),
              pages: 0,
              total: 0,
              limit: parseInt(limit)
            }
          });
        }
      }
    }
    
    if (status) {
      filter['transfer_details.transfer_status'] = status;
    }
    
    // Only apply vendor_id filter from query if user is not VENDOR (admins can filter)
    if (vendor_id && (!req.user || req.user.role !== 'VENDOR')) {
      filter['vendor_details.vendor_id'] = vendor_id;
    }
    
    if (driver_id) {
      filter['assigned_driver_details.driver_id'] = driver_id;
    }
    
    if (flight_no) {
      filter['flight_details.flight_no'] = flight_no.toUpperCase();
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
    
    if (search) {
      // Combine search conditions with vendor filter if both exist
      const searchConditions = [
        { _id: { $regex: search, $options: 'i' } },
        { 'customer_details.name': { $regex: search, $options: 'i' } },
        { 'customer_details.email': { $regex: search, $options: 'i' } },
        { 'flight_details.flight_no': { $regex: search, $options: 'i' } },
        { 'vendor_details.vendor_name': { $regex: search, $options: 'i' } }
      ];
      
      // If vendor filter already created $or, we need to combine properly
      if (filter.$or && filter.$or.length > 0) {
        // Vendor filter exists - combine: (vendor conditions) AND (search conditions)
        // We need to use $and to combine $or arrays
        const existingOr = [...filter.$or];
        delete filter.$or;
        filter.$and = [
          { $or: existingOr },
          { $or: searchConditions }
        ];
      } else {
        filter.$or = searchConditions;
      }
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transfers = await TransferModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();
    
    // Get total count for pagination (only for real MongoDB, mock data already has length)
    const total = mongoose.connection.readyState === 1 
      ? await TransferModel.countDocuments(filter)
      : transfers.length;

    res.json({
      success: true,
      data: transfers,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
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
    const TransferModel = getTransferModel();
    const mongoose = require('mongoose');
    
    const transfer = await TransferModel.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // If user is VENDOR, verify they own this transfer
    // The authorizeResource middleware already checked this, but double-check here
    if (req.user && req.user.role === 'VENDOR') {
      const userIdString = req.user._id.toString();
      const vendorIdString = transfer.vendor_id ? transfer.vendor_id.toString() : null;
      
      if (!vendorIdString || vendorIdString !== userIdString) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This transfer does not belong to your vendor account.'
        });
      }
    }

    // Assign driver (doesn't save yet)
    transfer.assignDriver(driverDetails, req.user ? `user:${req.user._id}` : 'api');
    
    // Save the transfer first before sending notifications
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

      // Record notification in transfer and save again
      transfer.addNotificationRecord(
        'whatsapp',
        message,
        transfer.customer_details.contact_number
      );
      await transfer.save();
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
    
    transfer.addAuditLog('driver_updated', 'api', `Driver status changed to ${status}`);
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

// Confirm traveler pickup
const confirmTravelerPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'pickup' or 'drop'
    
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

    if (action === 'pickup') {
      transfer.assigned_driver_details.traveler_picked_up = true;
      transfer.assigned_driver_details.pickup_time = new Date();
      transfer.assigned_driver_details.status = 'enroute';
      transfer.transfer_details.transfer_status = 'in_progress';
      
      const userRole = req.user?.role || 'api';
      const actionBy = userRole === 'VENDOR' || userRole === 'VENDOR_MANAGER' 
        ? 'vendor' 
        : userRole === 'DRIVER' 
        ? 'driver' 
        : 'admin';
      
      transfer.addAuditLog(
        'pickup_confirmed', 
        req.user ? `user:${req.user._id}` : 'api', 
        `${actionBy === 'vendor' ? 'Vendor' : actionBy === 'driver' ? 'Driver' : 'Admin'} confirmed traveler pickup at ${new Date().toLocaleString()}`
      );

      // Send notification to customer
      try {
        const message = `✅ Your driver ${transfer.assigned_driver_details.name} has picked up the traveler and is heading to ${transfer.transfer_details.drop_location}.`;
        await sendNotification(
          transfer.customer_details.contact_number,
          message,
          'whatsapp'
        );
        transfer.addNotificationRecord('whatsapp', message, transfer.customer_details.contact_number);
      } catch (notificationError) {
        console.error('Failed to send pickup notification:', notificationError);
      }
    } else if (action === 'drop') {
      transfer.assigned_driver_details.arrived_at_drop = true;
      transfer.assigned_driver_details.drop_time = new Date();
      transfer.assigned_driver_details.status = 'completed';
      transfer.transfer_details.transfer_status = 'completed';
      transfer.transfer_details.actual_drop_time = new Date();
      
      const userRole = req.user?.role || 'api';
      const actionBy = userRole === 'VENDOR' || userRole === 'VENDOR_MANAGER' 
        ? 'vendor' 
        : userRole === 'DRIVER' 
        ? 'driver' 
        : 'admin';
      
      transfer.addAuditLog(
        'drop_confirmed', 
        req.user ? `user:${req.user._id}` : 'api', 
        `${actionBy === 'vendor' ? 'Vendor' : actionBy === 'driver' ? 'Driver' : 'Admin'} confirmed traveler drop-off at ${new Date().toLocaleString()}`
      );

      // Send notification to customer
      try {
        const message = `✅ Transfer completed! Your traveler has been dropped off at ${transfer.transfer_details.drop_location}. Thank you for using HALO.`;
        await sendNotification(
          transfer.customer_details.contact_number,
          message,
          'whatsapp'
        );
        transfer.addNotificationRecord('whatsapp', message, transfer.customer_details.contact_number);
      } catch (notificationError) {
        console.error('Failed to send drop notification:', notificationError);
      }
    }

    await transfer.save();

    res.json({
      success: true,
      message: action === 'pickup' ? 'Pickup confirmed successfully' : 'Drop-off confirmed successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error confirming action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm action',
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

    // Get status aggregation - use correct field path
    const stats = await TransferModel.aggregate([
      {
        $group: {
          _id: '$transfer_details.transfer_status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalTransfers = await TransferModel.countDocuments();
    
    // Today's transfers - use correct field path
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    const todayTransfers = await TransferModel.countDocuments({
      'flight_details.arrival_time': {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    const upcomingTransfers = await TransferModel.countDocuments({
      'flight_details.arrival_time': { $gte: new Date() },
      'transfer_details.transfer_status': { $in: ['pending', 'assigned', 'enroute'] }
    });

    // Calculate success rate (completed / total)
    const completedCount = stats.find(s => s._id === 'completed')?.count || 0;
    const successRate = totalTransfers > 0 
      ? Math.round((completedCount / totalTransfers) * 100 * 10) / 10 // Round to 1 decimal
      : 0;

    // Count active drivers (drivers with assigned transfers)
    const activeDriversResult = await TransferModel.aggregate([
      {
        $match: {
          'assigned_driver_details.driver_id': { $exists: true, $ne: null },
          'transfer_details.transfer_status': { $in: ['assigned', 'enroute', 'waiting', 'in_progress'] }
        }
      },
      {
        $group: {
          _id: '$assigned_driver_details.driver_id'
        }
      },
      {
        $count: 'activeDrivers'
      }
    ]);
    const activeDrivers = activeDriversResult[0]?.activeDrivers || 0;

    res.json({
      success: true,
      data: {
        total: totalTransfers,
        today: todayTransfers,
        upcoming: upcomingTransfers,
        successRate: successRate,
        activeDrivers: activeDrivers,
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

// Update client details (flight info, passengers, luggage, notes)
const updateClientDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { flight_details, customer_details, transfer_details } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Find the transfer
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }

    // Check if user is the customer or has admin rights
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && String(transfer.customer_id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this transfer'
      });
    }

    // Update the transfer fields
    if (flight_details) {
      transfer.flight_details = {
        ...transfer.flight_details,
        ...flight_details
      };
    }

    if (customer_details) {
      transfer.customer_details = {
        ...transfer.customer_details,
        ...customer_details
      };
    }

    if (transfer_details && transfer_details.special_notes !== undefined) {
      transfer.transfer_details = {
        ...transfer.transfer_details,
        special_notes: transfer_details.special_notes
      };
    }

    // Add audit log entry
    transfer.audit_log.push({
      action: 'client_details_updated',
      timestamp: new Date(),
      by: `user:${userId}`,
      details: 'Client updated transfer details (flight info, passengers, notes)'
    });

    await transfer.save();

    res.status(200).json({
      success: true,
      message: 'Transfer details updated successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error updating client details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transfer details',
      error: error.message
    });
  }
};

// Assign traveler to transfer
const assignTraveler = async (req, res) => {
  try {
    const { id } = req.params;
    const { traveler_id, traveler_details } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Find the transfer
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }

    // Check if user is the customer or has admin rights
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && String(transfer.customer_id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to assign travelers to this transfer'
      });
    }

    // Update traveler information
    transfer.traveler_id = traveler_id;
    transfer.traveler_details = traveler_details;

    // Add audit log entry
    transfer.audit_log.push({
      action: 'traveler_assigned',
      timestamp: new Date(),
      by: `user:${userId}`,
      details: `Traveler ${traveler_details.name} assigned to transfer`
    });

    await transfer.save();

    console.log('Traveler assigned successfully:', traveler_details.name);

    res.status(200).json({
      success: true,
      message: 'Traveler assigned successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error assigning traveler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign traveler',
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
  confirmTravelerPickup,
  deleteTransfer,
  getTransferStats,
  updateClientDetails,
  assignTraveler
};
