const Transfer = require('../models/Transfer');
const mongoose = require('mongoose');
const { mockTransfers } = require('../services/mockDataService');

// Check if we're using mock data - check actual MongoDB connection status
const isUsingMockData = () => {
  // Use mock data only if MongoDB is not connected
  return mongoose.connection.readyState !== 1; // 1 = connected
};

// Get the appropriate Transfer model
const getTransferModel = () => {
  if (isUsingMockData()) {
    return null; // Will use mock data
  }
  return Transfer;
};

// Get transfer by ID for tracking
const getTransferForTracking = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Normalize the ID to uppercase (APX IDs are uppercase)
    const normalizedId = id.toUpperCase();
    
    let transfer;
    
    if (isUsingMockData()) {
      // Use mock data
      transfer = mockTransfers.find(t => t._id === normalizedId || t._id === id);
    } else {
      // Use database - search by _id (which is the APX ID like APX123456)
      const TransferModel = getTransferModel();
      
      if (!TransferModel) {
        console.error('TransferModel is null - MongoDB might not be connected');
        return res.status(500).json({
          success: false,
          message: 'Database connection error',
          error: 'Transfer model not available. Please check MongoDB connection.'
        });
      }
      
      // Try exact match first
      transfer = await TransferModel.findById(normalizedId);
      console.log(`🔍 First attempt (findById): ${transfer ? '✅ Found' : '❌ Not found'}`);
      
      // If not found, try searching without case sensitivity
      if (!transfer) {
        try {
          // MongoDB string fields are case-sensitive, but let's try a case-insensitive search
          const allTransfers = await TransferModel.find({}).select('_id').limit(100).lean();
          console.log(`📋 Found ${allTransfers.length} transfers in database`);
          
          if (allTransfers.length > 0) {
            console.log(`🔎 Sample IDs:`, allTransfers.slice(0, 10).map(t => t._id).join(', '));
            
            // Try to find a case-insensitive match
            const matched = allTransfers.find(t => 
              t._id.toUpperCase() === normalizedId || 
              t._id === normalizedId ||
              t._id.toLowerCase() === normalizedId.toLowerCase()
            );
            
            if (matched) {
              console.log(`✅ Found case-insensitive match: ${matched._id}`);
              transfer = await TransferModel.findById(matched._id);
            }
          }
        } catch (searchError) {
          console.error('Search error:', searchError);
        }
      }
      
      // If still not found, try to find by any variation of the ID
      if (!transfer) {
        // Remove leading zeros or try different formats
        const digits = normalizedId.replace(/^APX/i, '');
        if (digits) {
          // Try with leading zeros
          const paddedDigits = digits.padStart(6, '0');
          const paddedId = `APX${paddedDigits}`;
          console.log(`🔍 Trying padded version: ${paddedId}`);
          transfer = await TransferModel.findById(paddedId);
          
          // Also try without padding (if original had padding)
          if (!transfer && digits.length === 6) {
            const unpaddedDigits = digits.replace(/^0+/, '');
            if (unpaddedDigits !== digits) {
              const unpaddedId = `APX${unpaddedDigits}`;
              console.log(`🔍 Trying unpadded version: ${unpaddedId}`);
              transfer = await TransferModel.findById(unpaddedId);
            }
          }
        }
      }
      
      // Debug: Log what we found
      if (transfer) {
        console.log(`✅ Found transfer: ${transfer._id}`);
      } else {
        // Log available transfers for debugging
        try {
          const count = await TransferModel.countDocuments({});
          const sampleIds = await TransferModel.find({}).select('_id').limit(10).lean();
          console.log(`❌ Transfer lookup failed for ID: ${normalizedId}`);
          console.log(`📊 Total transfers in database: ${count}`);
          if (sampleIds.length > 0) {
            console.log(`📋 Sample transfer IDs:`, sampleIds.map(t => t._id).join(', '));
          } else {
            console.log(`⚠️ No transfers found in database`);
          }
        } catch (debugError) {
          console.error('Error during debug logging:', debugError);
        }
      }
    }
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: `Transfer with ID ${normalizedId} not found. Please check your tracking ID and try again.`,
        searchedId: normalizedId,
        suggestion: 'Make sure the APX ID is correct and the transfer was created successfully.'
      });
    }

    // Convert transfer to plain object if it's a Mongoose document
    const transferObj = transfer.toObject ? transfer.toObject() : transfer;
    
    // Get actual location from database if available
    let actualLocation = null;
    if (transferObj.location_tracking?.last_location) {
      actualLocation = {
        latitude: transferObj.location_tracking.last_location.latitude,
        longitude: transferObj.location_tracking.last_location.longitude,
        address: transferObj.location_tracking.last_location.address || '',
        timestamp: transferObj.location_tracking.last_location.timestamp
      };
    } else if (transferObj.assigned_driver_details?.currentLocation) {
      // Fallback to assigned_driver_details.currentLocation
      actualLocation = {
        latitude: transferObj.assigned_driver_details.currentLocation.latitude,
        longitude: transferObj.assigned_driver_details.currentLocation.longitude,
        address: transferObj.assigned_driver_details.currentLocation.address || '',
        timestamp: transferObj.assigned_driver_details.currentLocation.lastUpdated
      };
    } else {
      // Generate mock location if no real location exists
      actualLocation = generateMockDriverLocation(transferObj);
    }
    
    // Add tracking-specific data
    const trackingData = {
      ...transferObj,
      tracking: {
        currentStatus: transferObj.transfer_details?.transfer_status || transferObj.transfer_details?.status || 'pending',
        lastUpdated: actualLocation?.timestamp || new Date(),
        estimatedArrival: calculateEstimatedArrival(transferObj),
        driverLocation: actualLocation,
        routeHistory: transferObj.location_tracking?.route_history || [],
        progressSteps: generateProgressSteps(transferObj)
      }
    };

    res.json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    console.error('Error getting transfer for tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update driver location
const updateDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, address, speed, heading, status } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    let transfer;
    const TransferModel = getTransferModel();
    
    if (isUsingMockData()) {
      transfer = mockTransfers.find(t => t._id === id.toUpperCase());
      if (transfer) {
        // Update mock transfer location
        transfer.location_tracking = transfer.location_tracking || {};
        transfer.location_tracking.last_location = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address: address || '',
          timestamp: new Date()
        };
      }
    } else {
      if (!TransferModel) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }
      
      transfer = await TransferModel.findById(id.toUpperCase());
      
      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: 'Transfer not found'
        });
      }

      // Update location_tracking.last_location
      if (!transfer.location_tracking) {
        transfer.location_tracking = {
          enabled: true,
          last_location: {},
          route_history: []
        };
      }

      const timestamp = new Date();
      
      // Update last location
      transfer.location_tracking.last_location = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || '',
        timestamp: timestamp
      };

      // Add to route history
      transfer.location_tracking.route_history.push({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timestamp: timestamp,
        speed: speed ? parseFloat(speed) : null,
        heading: heading ? parseFloat(heading) : null
      });

      // Keep only last 100 route points to avoid bloating the database
      if (transfer.location_tracking.route_history.length > 100) {
        transfer.location_tracking.route_history = transfer.location_tracking.route_history.slice(-100);
      }

      // Also update assigned_driver_details.currentLocation for backwards compatibility
      if (transfer.assigned_driver_details) {
        transfer.assigned_driver_details.currentLocation = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          address: address || '',
          lastUpdated: timestamp
        };
        
        if (status) {
          transfer.assigned_driver_details.status = status;
          transfer.transfer_details.transfer_status = status;
        }
      }

      // Save to database
      await transfer.save();
    }
    
    res.json({
      success: true,
      message: 'Driver location updated successfully',
      data: {
        location: { 
          latitude: parseFloat(latitude), 
          longitude: parseFloat(longitude), 
          address: address || '' 
        },
        status: transfer.transfer_details?.transfer_status || transfer.transfer_details?.status || 'enroute',
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Error updating driver location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update driver location',
      error: error.message
    });
  }
};

// Get tracking history
const getTrackingHistory = async (req, res) => {
  try {
    const { id } = req.params;
    
    let transfer;
    
    if (isUsingMockData()) {
      transfer = mockTransfers.find(t => t._id === id);
    } else {
      transfer = await Transfer.findById(id);
    }
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }

    const history = generateTrackingHistory(transfer);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting tracking history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Helper functions
const calculateEstimatedArrival = (transfer) => {
  const now = new Date();
  const pickupTime = new Date(transfer.transfer_details.estimated_pickup_time);
  const dropTime = new Date(transfer.transfer_details.estimated_drop_time);
  
  // If pickup time has passed, estimate based on current time
  if (now > pickupTime) {
    const travelTime = dropTime.getTime() - pickupTime.getTime();
    return new Date(now.getTime() + travelTime);
  }
  
  return dropTime;
};

const generateMockDriverLocation = (transfer) => {
  // Generate mock location near Mumbai airport
  const baseLat = 19.0760;
  const baseLng = 72.8777;
  
  return {
    latitude: baseLat + (Math.random() - 0.5) * 0.01,
    longitude: baseLng + (Math.random() - 0.5) * 0.01,
    address: 'Near Mumbai Airport Terminal 2',
    lastUpdated: new Date()
  };
};

const generateProgressSteps = (transfer) => {
  const currentStatus = transfer.transfer_details.transfer_status || transfer.transfer_details.status;
  
  const steps = [
    { 
      id: 1, 
      title: 'Transfer Requested', 
      description: 'Your transfer request has been received',
      status: 'completed',
      timestamp: new Date(transfer.createdAt || new Date())
    },
    { 
      id: 2, 
      title: 'Driver Assigned', 
      description: 'Driver has been assigned to your transfer',
      status: transfer.assigned_driver_details ? 'completed' : 'pending',
      timestamp: transfer.assigned_driver_details ? new Date() : null
    },
    { 
      id: 3, 
      title: 'Driver En Route', 
      description: 'Driver is on the way to pickup location',
      status: currentStatus === 'in_progress' ? 'in_progress' : 'pending',
      timestamp: currentStatus === 'in_progress' ? new Date() : null
    },
    { 
      id: 4, 
      title: 'Arrived at Pickup', 
      description: 'Driver has arrived at pickup location',
      status: 'pending',
      timestamp: null
    },
    { 
      id: 5, 
      title: 'Transfer Started', 
      description: 'Transfer has begun',
      status: 'pending',
      timestamp: null
    },
    { 
      id: 6, 
      title: 'Transfer Completed', 
      description: 'You have reached your destination',
      status: currentStatus === 'completed' ? 'completed' : 'pending',
      timestamp: currentStatus === 'completed' ? new Date() : null
    }
  ];

  return steps;
};

const generateTrackingHistory = (transfer) => {
  const history = [];
  
  // Add creation event
  history.push({
    timestamp: new Date(transfer.createdAt || new Date()),
    event: 'Transfer Created',
    description: 'Transfer request was created',
    type: 'system'
  });

  // Add driver assignment if exists
  if (transfer.assigned_driver_details) {
    history.push({
      timestamp: new Date(),
      event: 'Driver Assigned',
      description: `Driver ${transfer.assigned_driver_details.driver_name} was assigned`,
      type: 'assignment'
    });
  }

  // Add status changes
  history.push({
    timestamp: new Date(),
    event: 'Status Update',
    description: `Status changed to ${transfer.transfer_details.transfer_status || transfer.transfer_details.status}`,
    type: 'status'
  });

  return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

module.exports = {
  getTransferForTracking,
  updateDriverLocation,
  getTrackingHistory
};
