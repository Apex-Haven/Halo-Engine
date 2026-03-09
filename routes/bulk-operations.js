const express = require('express');
const router = express.Router();
const Transfer = require('../models/Transfer');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Bulk update transfer status (onward or return leg)
router.put('/status', authenticate, async (req, res) => {
  try {
    const { transferIds, newStatus, leg = 'onward' } = req.body;

    if (!transferIds || !Array.isArray(transferIds) || transferIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transfer IDs are required'
      });
    }

    if (!newStatus || !['pending', 'assigned', 'enroute', 'in_progress', 'completed', 'cancelled'].includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required'
      });
    }

    if (!['onward', 'return'].includes(leg)) {
      return res.status(400).json({
        success: false,
        message: 'leg must be onward or return'
      });
    }

    const legLabel = leg === 'return' ? 'return' : 'onward';
    const statusField = leg === 'return'
      ? 'return_transfer_details.transfer_status'
      : 'transfer_details.transfer_status';

    const filter = { _id: { $in: transferIds } };
    if (leg === 'return') {
      filter.return_transfer_details = { $exists: true, $ne: null };
    }

    const result = await Transfer.updateMany(
      filter,
      {
        $set: { [statusField]: newStatus },
        $push: {
          audit_log: {
            action: 'status_changed',
            timestamp: new Date(),
            by: req.user.email,
            details: `${legLabel} leg bulk status changed to ${newStatus}`
          }
        }
      }
    );

    const skipped = transferIds.length - result.modifiedCount;
    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} ${leg} leg(s) to ${newStatus}${skipped > 0 ? `. ${skipped} skipped (no ${leg} leg)` : ''}`,
      updatedCount: result.modifiedCount,
      skipped
    });
  } catch (error) {
    console.error('Error in bulk status update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transfer status'
    });
  }
});

// Bulk assign vendor
router.put('/vendor', authenticate, async (req, res) => {
  try {
    const { transferIds, vendorId, vendorName, contactPerson, contactNumber } = req.body;
    
    if (!transferIds || !Array.isArray(transferIds) || transferIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transfer IDs are required'
      });
    }

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    // Fetch vendor User to get complete vendor_details (email, contact_number must satisfy schema)
    const vendorUser = await User.findById(vendorId);
    if (!vendorUser || vendorUser.role !== 'VENDOR') {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor. User not found or not a VENDOR role.'
      });
    }

    const vendorIdStr = vendorUser._id.toString();
    const vendor_name = (vendorName && String(vendorName).trim()) || vendorUser.vendorDetails?.companyName || vendorUser.username || 'Vendor';
    const contact_person = (contactPerson && String(contactPerson).trim()) || [vendorUser.profile?.firstName, vendorUser.profile?.lastName].filter(Boolean).join(' ') || 'Contact';
    const phone = (contactNumber && /^\+[1-9]\d{1,14}$/.test(String(contactNumber).trim())) ? String(contactNumber).trim() : (vendorUser.profile?.phone || vendorUser.vendorDetails?.phone);
    const contact_number = (phone && /^\+[1-9]\d{1,14}$/.test(phone)) ? phone : '+10000000000';
    const email = (vendorUser.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendorUser.email)) ? vendorUser.email : 'vendor@placeholder.local';

    // Update transfers - set full vendor_details object (handles vendor_details: null)
    const result = await Transfer.updateMany(
      { _id: { $in: transferIds } },
      { 
        $set: {
          vendor_details: {
            vendor_id: vendorIdStr,
            vendor_name,
            contact_person,
            contact_number,
            email
          },
          'transfer_details.transfer_status': 'assigned'
        },
        $push: {
          audit_log: {
            action: 'vendor_assigned',
            timestamp: new Date(),
            by: req.user.email,
            details: `Bulk assigned to vendor: ${vendor_name}`
          }
        }
      }
    );

    res.json({
      success: true,
      message: `Assigned ${result.modifiedCount} transfers to ${vendor_name}`,
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error in bulk vendor assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign vendor'
    });
  }
});

// Bulk assign driver
router.put('/driver', authenticate, async (req, res) => {
  try {
    const { transferIds, driverId, driverName, driverPhone, vehicleType, vehicleNumber } = req.body;
    
    if (!transferIds || !Array.isArray(transferIds) || transferIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transfer IDs are required'
      });
    }

    if (!driverId || !driverName) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID and name are required'
      });
    }

    // E.164 placeholder when phone missing/invalid (schema requires valid format)
    const contactNumber = (driverPhone && /^\+[1-9]\d{1,14}$/.test(driverPhone)) ? driverPhone : '+10000000000';

    // Check for conflicts - overlapping time slots for same driver
    const conflictingTransfers = await Transfer.find({
      _id: { $in: transferIds },
      'assigned_driver_details.driver_id': driverId,
      'transfer_details.transfer_status': { $in: ['assigned', 'enroute', 'in_progress'] }
    });

    if (conflictingTransfers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Driver ${driverName} is already assigned to ${conflictingTransfers.length} active transfers`,
        conflicts: conflictingTransfers.map(t => ({
          id: t._id,
          pickupTime: t.transfer_details.estimated_pickup_time,
          status: t.transfer_details.transfer_status
        }))
      });
    }

    // Update transfers with driver details - set full object (assigned_driver_details can be null)
    const assignedDriverDetails = {
      driver_id: driverId,
      name: driverName,
      contact_number: contactNumber,
      vehicle_type: vehicleType || 'sedan',
      vehicle_number: vehicleNumber || 'TBD',
      assigned_at: new Date()
    };
    const result = await Transfer.updateMany(
      { _id: { $in: transferIds } },
      { 
        $set: {
          assigned_driver_details: assignedDriverDetails,
          'transfer_details.transfer_status': 'assigned'
        },
        $push: {
          audit_log: {
            action: 'driver_assigned',
            timestamp: new Date(),
            by: req.user.email,
            details: `Bulk assigned to driver: ${driverName}`
          }
        }
      }
    );

    res.json({
      success: true,
      message: `Assigned ${result.modifiedCount} transfers to driver ${driverName}`,
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error in bulk driver assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign driver',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Bulk assign return driver (round-trip only; onward must be completed first)
router.put('/return-driver', authenticate, async (req, res) => {
  try {
    const { transferIds, driverId, driverName, driverPhone, vehicleType, vehicleNumber } = req.body;

    if (!transferIds || !Array.isArray(transferIds) || transferIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transfer IDs are required'
      });
    }

    if (!driverId || !driverName) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID and name are required'
      });
    }

    const contactNumber = (driverPhone && /^\+[1-9]\d{1,14}$/.test(driverPhone)) ? driverPhone : '+10000000000';
    const assignedDriverDetails = {
      driver_id: driverId,
      name: driverName,
      contact_number: contactNumber,
      vehicle_type: vehicleType || 'sedan',
      vehicle_number: vehicleNumber || 'TBD',
      assigned_at: new Date()
    };

    // Only update transfers that have return leg AND onward is completed
    const result = await Transfer.updateMany(
      {
        _id: { $in: transferIds },
        return_transfer_details: { $exists: true, $ne: null },
        'transfer_details.transfer_status': 'completed'
      },
      {
        $set: {
          return_assigned_driver_details: assignedDriverDetails,
          'return_transfer_details.transfer_status': 'assigned'
        },
        $push: {
          audit_log: {
            action: 'driver_assigned',
            timestamp: new Date(),
            by: req.user.email,
            details: `Return driver ${driverName} assigned`
          }
        }
      }
    );

    const skipped = transferIds.length - result.modifiedCount;
    res.json({
      success: true,
      message: `Assigned return driver to ${result.modifiedCount} transfer(s)${skipped > 0 ? `. ${skipped} skipped (onward not completed or no return leg)` : ''}`,
      updatedCount: result.modifiedCount,
      skipped
    });
  } catch (error) {
    console.error('Error in bulk return driver assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign return driver',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check for driver conflicts
router.post('/check-conflicts', authenticate, async (req, res) => {
  try {
    const { transferIds, driverId } = req.body;
    
    if (!transferIds || !driverId) {
      return res.status(400).json({
        success: false,
        message: 'Transfer IDs and driver ID are required'
      });
    }

    // Find existing assignments for this driver
    const existingAssignments = await Transfer.find({
      'assigned_driver_details.driver_id': driverId,
      'transfer_details.transfer_status': { $in: ['assigned', 'enroute', 'in_progress'] },
      _id: { $nin: transferIds } // Exclude the transfers we're trying to assign
    }).select('transfer_details.estimated_pickup_time transfer_details.estimated_drop_time _id');

    // Find time ranges for transfers we want to assign
    const newAssignments = await Transfer.find({
      _id: { $in: transferIds }
    }).select('transfer_details.estimated_pickup_time transfer_details.estimated_drop_time _id');

    const conflicts = [];

    // Check for time overlaps
    newAssignments.forEach(newTransfer => {
      const newStart = new Date(newTransfer.transfer_details.estimated_pickup_time);
      const newEnd = new Date(newTransfer.transfer_details.estimated_drop_time || 
                           new Date(newStart.getTime() + 2 * 60 * 60 * 1000)); // 2 hours default

      existingAssignments.forEach(existingTransfer => {
        const existingStart = new Date(existingTransfer.transfer_details.estimated_pickup_time);
        const existingEnd = new Date(existingTransfer.transfer_details.estimated_drop_time || 
                                 new Date(existingStart.getTime() + 2 * 60 * 60 * 1000));

        // Check for overlap
        if (newStart < existingEnd && existingStart < newEnd) {
          conflicts.push({
            existingTransferId: existingTransfer._id,
            newTransferId: newTransfer._id,
            conflictTime: {
              existing: `${existingStart.toLocaleTimeString()} - ${existingEnd.toLocaleTimeString()}`,
              new: `${newStart.toLocaleTimeString()} - ${newEnd.toLocaleTimeString()}`
            }
          });
        }
      });
    });

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts,
      message: conflicts.length > 0 ? 
        `Found ${conflicts.length} potential scheduling conflicts` : 
        'No conflicts detected'
    });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check conflicts'
    });
  }
});

// Bulk delete transfers
router.delete('/', authenticate, async (req, res) => {
  try {
    const { transferIds, deleteAllBulk } = req.body;

    let idsToDelete = [];

    if (deleteAllBulk === true) {
      // Delete all transfers the user can access (respecting role)
      const filter = {};
      if (req.user?.role === 'VENDOR') {
        filter['vendor_details.vendor_id'] = req.user._id.toString();
      } else if (req.user?.role === 'CLIENT') {
        filter.customer_id = req.user._id;
      }
      const docs = await Transfer.find(filter, { _id: 1 }).lean();
      idsToDelete = docs.map((d) => d._id);
    } else if (transferIds && Array.isArray(transferIds) && transferIds.length > 0) {
      idsToDelete = transferIds;
    }

    if (idsToDelete.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transfer IDs are required, or use deleteAllBulk: true'
      });
    }

    // Check if any transfers are in progress
    const activeTransfers = await Transfer.find({
      _id: { $in: idsToDelete },
      'transfer_details.transfer_status': { $in: ['enroute', 'in_progress'] }
    });

    if (activeTransfers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete ${activeTransfers.length} active transfers`
      });
    }

    const result = await Transfer.deleteMany({ _id: { $in: idsToDelete } });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} transfers`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete transfers'
    });
  }
});

module.exports = router;
