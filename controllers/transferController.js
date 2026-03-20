const Transfer = require('../models/Transfer');
const User = require('../models/User');
const mongoose = require('mongoose');
const { sendTemplatedEmail: sendSendGridEmail } = require('../config/sendgrid');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const googleSheetsSyncService = require('../services/googleSheetsSyncService');
const { enrichFlightDetails } = require('../services/flightEnrichmentHelper');
const moment = require('moment');
const {
  notifyAdminsTransferCreated,
  notifyClientVendorAssigned,
  notifyVendorAssignedToTransfer,
  notifyClientDriverAssigned
} = require('../services/inAppNotificationService');


// Generate APEX ID: APX + client name (letters only, uppercase, max 20) + 5 random digits
function generateApexId(customerName) {
  const namePart = (customerName || '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 20) || 'X';
  const digits = Math.floor(Math.random() * 90000) + 10000; // 10000–99999
  return `APX${namePart}${digits}`;
}

// Create new transfer (Client: no vendor; Admin: optional vendor)
const createTransfer = async (req, res) => {
  try {
    const transferData = { ...req.body };
    const userRole = req.user?.role;
    const isClient = userRole === 'CLIENT';

    // Generate APEX ID on backend: APX + client name + 5 digits
    const customerName = transferData.customer_details?.name || 'Client';
    let apexId;
    for (let attempt = 0; attempt < 10; attempt++) {
      apexId = generateApexId(customerName);
      const exists = await Transfer.findById(apexId);
      if (!exists) break;
    }
    transferData._id = apexId;

    // Customer: required. For CLIENT, must be self.
    if (!transferData.customer_id || transferData.customer_id === '' || transferData.customer_id === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field',
        error: 'customer_id is required and cannot be empty'
      });
    }
    if (typeof transferData.customer_id === 'string') {
      if (!mongoose.Types.ObjectId.isValid(transferData.customer_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid customer_id format',
          error: 'customer_id must be a valid MongoDB ObjectId (24 hex characters)'
        });
      }
      transferData.customer_id = new mongoose.Types.ObjectId(transferData.customer_id);
    }
    if (isClient && transferData.customer_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Clients can only create transfers for themselves',
        error: 'customer_id must match your account'
      });
    }

    // Vendor: optional. Clients cannot select vendor (admin assigns later).
    const hasVendor = transferData.vendor_id && transferData.vendor_id !== '' && transferData.vendor_id !== null;
    if (hasVendor) {
      if (typeof transferData.vendor_id === 'string') {
        if (!mongoose.Types.ObjectId.isValid(transferData.vendor_id)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid vendor_id format',
            error: 'vendor_id must be a valid MongoDB ObjectId (24 hex characters)'
          });
        }
        transferData.vendor_id = new mongoose.Types.ObjectId(transferData.vendor_id);
      }
      const vendorUser = await User.findById(transferData.vendor_id);
      if (!vendorUser || vendorUser.role !== 'VENDOR') {
        return res.status(400).json({
          success: false,
          message: 'Invalid vendor',
          error: 'Vendor user not found or not a VENDOR role'
        });
      }
      const vendorIdStr = vendorUser._id.toString();
      transferData.vendor_details = {
        vendor_id: vendorIdStr,
        vendor_name: vendorUser.vendorDetails?.companyName || vendorUser.username || 'Vendor',
        contact_person: [vendorUser.profile?.firstName, vendorUser.profile?.lastName].filter(Boolean).join(' ') || 'Contact',
        contact_number: vendorUser.profile?.phone || '+0000000000',
        email: vendorUser.email || ''
      };
    } else {
      // No vendor: client-created or admin will assign later. Omit vendor_details.
      delete transferData.vendor_id;
      delete transferData.vendor_details;
    }

    // Don't persist vendor_id on document (we use vendor_details.vendor_id)
    delete transferData.vendor_id;

    // When Delegate 2 has "flight same as Delegate 1", copy flight_details to traveler_flight_details if not provided
    if (transferData.traveler_details && transferData.traveler_details.flight_same_as_delegate_1 === true) {
      if (!transferData.traveler_flight_details || !transferData.traveler_flight_details.flight_no) {
        transferData.traveler_flight_details = transferData.flight_details
          ? {
            flight_no: transferData.flight_details.flight_no,
            airline: transferData.flight_details.airline,
            departure_airport: transferData.flight_details.departure_airport,
            arrival_airport: transferData.flight_details.arrival_airport,
            departure_time: transferData.flight_details.departure_time,
            arrival_time: transferData.flight_details.arrival_time,
            status: transferData.flight_details.status || 'on_time',
            delay_minutes: transferData.flight_details.delay_minutes ?? 0,
            gate: transferData.flight_details.gate,
            terminal: transferData.flight_details.terminal
          }
          : null;
      }
    }

    // Auto-fetch flight data from FlightStats when flight_no exists
    if (transferData.flight_details?.flight_no) {
      try {
        const enriched = await enrichFlightDetails(
          transferData.flight_details,
          transferData.flight_details.arrival_time || transferData.flight_details.departure_time
        );
        if (enriched) transferData.flight_details = enriched;
      } catch (e) {
        console.warn('Flight enrichment failed:', e.message);
      }
    }
    if (transferData.traveler_flight_details?.flight_no && transferData.traveler_flight_details !== transferData.flight_details) {
      try {
        const enriched = await enrichFlightDetails(
          transferData.traveler_flight_details,
          transferData.traveler_flight_details.arrival_time || transferData.traveler_flight_details.departure_time
        );
        if (enriched) transferData.traveler_flight_details = enriched;
      } catch (e) {
        console.warn('Traveler flight enrichment failed:', e.message);
      }
    }

    // Normalize delegates array: ObjectIds and copy primary flight when flight_same_as_primary
    if (Array.isArray(transferData.delegates) && transferData.delegates.length > 0) {
      const primaryFlight = transferData.flight_details;
      transferData.delegates = transferData.delegates.map((d) => {
        const entry = {
          traveler_id: mongoose.Types.ObjectId.isValid(d.traveler_id) ? new mongoose.Types.ObjectId(d.traveler_id) : d.traveler_id,
          flight_same_as_primary: d.flight_same_as_primary !== false,
          flight_details: d.flight_details || null
        };
        if (entry.flight_same_as_primary && primaryFlight) {
          entry.flight_details = {
            flight_no: primaryFlight.flight_no,
            airline: primaryFlight.airline,
            departure_airport: primaryFlight.departure_airport,
            arrival_airport: primaryFlight.arrival_airport,
            departure_time: primaryFlight.departure_time,
            arrival_time: primaryFlight.arrival_time,
            status: primaryFlight.status || 'on_time',
            delay_minutes: primaryFlight.delay_minutes ?? 0,
            gate: primaryFlight.gate,
            terminal: primaryFlight.terminal
          };
        }
        return entry;
      });
    }

    const transfer = new Transfer(transferData);
    await transfer.save();

    // Send confirmation emails to client and traveler (if assigned)
    const emailResults = {
      client: null,
      traveler: null
    };

    try {
      // Format dates
      const departureTime = moment(transfer.flight_details?.departure_time).format('MMMM Do YYYY, h:mm A');
      const arrivalTime = moment(transfer.flight_details?.arrival_time).format('MMMM Do YYYY, h:mm A');
      
      // Send email to client
      if (transfer.customer_details?.email) {
        const clientEmailResult = await sendSendGridEmail(
          transfer.customer_details.email,
          'transferCreatedClient',
          [
            transfer.customer_details.name,
            transfer._id,
            transfer.flight_details?.flight_no || 'N/A',
            transfer.flight_details?.departure_airport || 'N/A',
            transfer.flight_details?.arrival_airport || 'N/A',
            departureTime,
            arrivalTime,
            transfer.transfer_details?.pickup_location || 'N/A',
            transfer.transfer_details?.drop_location || 'N/A'
          ]
        );
        emailResults.client = clientEmailResult;
        
        if (clientEmailResult.success) {
          console.log(`✅ Transfer creation email sent to client: ${transfer.customer_details.email} (Status: ${clientEmailResult.statusCode}, Message ID: ${clientEmailResult.messageId || 'N/A'})`);
        } else {
          console.error(`❌ Failed to send email to client ${transfer.customer_details.email}:`, clientEmailResult.error);
        }
      } else {
        console.warn(`⚠️ No client email found for transfer ${transfer._id}`);
      }

      // Send email to traveler if assigned
      if (transfer.traveler_details?.email) {
        const travelerEmailResult = await sendSendGridEmail(
          transfer.traveler_details.email,
          'transferCreatedTraveler',
          [
            transfer.traveler_details.name,
            transfer._id,
            transfer.flight_details?.flight_no || 'N/A',
            transfer.flight_details?.departure_airport || 'N/A',
            transfer.flight_details?.arrival_airport || 'N/A',
            departureTime,
            arrivalTime,
            transfer.transfer_details?.pickup_location || 'N/A',
            transfer.transfer_details?.drop_location || 'N/A'
          ]
        );
        emailResults.traveler = travelerEmailResult;
        
        if (travelerEmailResult.success) {
          console.log(`✅ Transfer creation email sent to traveler: ${transfer.traveler_details.email} (Status: ${travelerEmailResult.statusCode}, Message ID: ${travelerEmailResult.messageId || 'N/A'})`);
        } else {
          console.error(`❌ Failed to send email to traveler ${transfer.traveler_details.email}:`, travelerEmailResult.error);
        }
      } else {
        console.log(`ℹ️ No traveler assigned for transfer ${transfer._id}, skipping traveler email`);
      }
    } catch (emailError) {
      console.error('❌ Error sending confirmation emails:', emailError);
      // Don't fail the request if email fails
    }

    // In-app notification to admins when client creates a transfer
    if (userRole === 'CLIENT') {
      try {
        await notifyAdminsTransferCreated(transfer);
      } catch (notifErr) {
        console.error('In-app notification to admins failed:', notifErr);
      }
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
    
    const transfer = await Transfer.findById(id)
      .populate('traveler_id', 'username email profile')
      .populate('delegates.traveler_id', 'username email profile');
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
    
    // If user is VENDOR, only show transfers assigned to them (admin assigns vendor first)
    if (req.user && req.user.role === 'VENDOR') {
      const vendorIdStr = req.user._id.toString();
      filter['vendor_details.vendor_id'] = vendorIdStr;
    }

    // If user is CLIENT, only show their own transfers
    if (req.user && req.user.role === 'CLIENT') {
      filter.customer_id = req.user._id;
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
        { 'customer_details.company_name': { $regex: search, $options: 'i' } },
        { 'traveler_details.name': { $regex: search, $options: 'i' } },
        { 'traveler_details.company_name': { $regex: search, $options: 'i' } },
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
    const transfers = await Transfer.find(filter)
      .populate('traveler_id', 'username email profile')
      .populate('delegates.traveler_id', 'username email profile')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();
    
    // Get total count for pagination
    const total = await Transfer.countDocuments(filter);

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
    const updateData = { ...req.body };
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // Normalize delegates if provided
    if (Array.isArray(updateData.delegates)) {
      const primaryFlight = transfer.flight_details || updateData.flight_details;
      updateData.delegates = updateData.delegates.map((d) => {
        const entry = {
          traveler_id: mongoose.Types.ObjectId.isValid(d.traveler_id) ? new mongoose.Types.ObjectId(d.traveler_id) : d.traveler_id,
          flight_same_as_primary: d.flight_same_as_primary !== false,
          flight_details: d.flight_details || null
        };
        if (entry.flight_same_as_primary && primaryFlight) {
          const fd = primaryFlight.toObject ? primaryFlight.toObject() : primaryFlight;
          entry.flight_details = {
            flight_no: fd.flight_no,
            airline: fd.airline,
            departure_airport: fd.departure_airport,
            arrival_airport: fd.arrival_airport,
            departure_time: fd.departure_time,
            arrival_time: fd.arrival_time,
            status: fd.status || 'on_time',
            delay_minutes: fd.delay_minutes ?? 0,
            gate: fd.gate,
            terminal: fd.terminal
          };
        }
        return entry;
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

// Map FlightStats status to our allowed values
const mapFlightStatus = (status) => {
  if (!status || typeof status !== 'string') return 'on_time';
  const s = status.toLowerCase();
  const valid = ['on_time', 'delayed', 'landed', 'cancelled', 'boarding', 'departed'];
  if (valid.includes(s)) return s;
  if (['scheduled', 'ontime', 'on time'].includes(s)) return 'on_time';
  if (['delay'].includes(s)) return 'delayed';
  if (['arrived', 'arrival'].includes(s)) return 'landed';
  if (['canceled', 'cancel'].includes(s)) return 'cancelled';
  if (['board'].includes(s)) return 'boarding';
  if (['departure'].includes(s)) return 'departed';
  return 'on_time';
};

// Update flight details only (partial update - no full transfer validation)
const updateFlightDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { flight_details, return_flight_details, return_transfer_details } = req.body;

    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    if (flight_details) {
      const normalized = {
        ...flight_details,
        status: mapFlightStatus(flight_details.status)
      };
      transfer.flight_details = {
        ...(transfer.flight_details?.toObject ? transfer.flight_details.toObject() : transfer.flight_details || {}),
        ...normalized
      };
    }

    if (return_flight_details !== undefined) {
      if (return_flight_details === null) {
        transfer.return_flight_details = null;
      } else {
        const normalized = {
          ...return_flight_details,
          status: mapFlightStatus(return_flight_details.status)
        };
        transfer.return_flight_details = {
          ...(transfer.return_flight_details?.toObject ? transfer.return_flight_details.toObject() : transfer.return_flight_details || {}),
          ...normalized
        };
      }
    }

    if (return_transfer_details && Object.keys(return_transfer_details).length > 0) {
      transfer.return_transfer_details = {
        ...(transfer.return_transfer_details?.toObject ? transfer.return_transfer_details.toObject() : transfer.return_transfer_details || {}),
        ...return_transfer_details
      };
    }

    await transfer.save();

    res.json({
      success: true,
      message: 'Flight details updated successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error updating flight details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update flight details',
      error: error.message
    });
  }
};

// Assign vendor to transfer (admin only) - makes transfer visible to that vendor
const assignVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_id: vendorId } = req.body;
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'vendor_id is required'
      });
    }
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }
    const vendorUser = await User.findById(vendorId);
    if (!vendorUser || vendorUser.role !== 'VENDOR') {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor. User not found or not a VENDOR role.'
      });
    }
    const vendorIdStr = vendorUser._id.toString();
    // E.164 placeholder when missing: must match +[1-9] + 1–14 digits (e.g. +10000000000)
    const phone = vendorUser.profile?.phone || vendorUser.vendorDetails?.phone;
    const contactNumber = (phone && /^\+[1-9]\d{1,14}$/.test(phone)) ? phone : '+10000000000';
    const email = (vendorUser.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendorUser.email)) ? vendorUser.email : 'vendor@placeholder.local';
    transfer.vendor_details = {
      vendor_id: vendorIdStr,
      vendor_name: vendorUser.vendorDetails?.companyName || vendorUser.username || 'Vendor',
      contact_person: [vendorUser.profile?.firstName, vendorUser.profile?.lastName].filter(Boolean).join(' ') || 'Contact',
      contact_number: contactNumber,
      email
    };
    transfer.addAuditLog('updated', req.user ? `user:${req.user._id}` : 'api', 'Vendor assigned by admin');
    await transfer.save();

    // In-app: notify client and vendor
    try {
      await Promise.all([
        notifyClientVendorAssigned(transfer),
        notifyVendorAssignedToTransfer(transfer, vendorId)
      ]);
    } catch (notifErr) {
      console.error('In-app notification (vendor assigned) failed:', notifErr);
    }

    res.json({
      success: true,
      message: 'Vendor assigned successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error assigning vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign vendor',
      error: error.message
    });
  }
};

// Assign driver to transfer
const assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driverDetails = req.body;
    const mongoose = require('mongoose');
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // If user is VENDOR, verify they own this transfer (assigned to them by admin)
    if (req.user && req.user.role === 'VENDOR') {
      const userIdString = req.user._id.toString();
      const vendorIdString = (transfer.vendor_details && transfer.vendor_details.vendor_id)
        ? String(transfer.vendor_details.vendor_id)
        : null;
      if (!vendorIdString || vendorIdString !== userIdString) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This transfer does not belong to your vendor account.'
        });
      }
    }

    // Assign driver (saves once internally)
    await transfer.assignDriver(driverDetails, req.user ? `user:${req.user._id}` : 'api');

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

      // Record notification in transfer (saves once)
      await transfer.addNotificationRecord(
        'whatsapp',
        message,
        transfer.customer_details.contact_number
      );
    } catch (notificationError) {
      console.error('Failed to send driver assignment notification:', notificationError);
      // Don't fail the request if notification fails
    }

    // In-app: notify client that driver was assigned
    try {
      await notifyClientDriverAssigned(transfer);
    } catch (notifErr) {
      console.error('In-app notification (driver assigned) failed:', notifErr);
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

// Assign return driver (for round-trip; onward leg must be completed first)
const assignReturnDriver = async (req, res) => {
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

    if (!transfer.return_transfer_details) {
      return res.status(400).json({
        success: false,
        message: 'This transfer has no return leg'
      });
    }

    const onwardStatus = transfer.transfer_details?.transfer_status || 'pending';
    if (onwardStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Onward transfer must be completed before assigning return driver. Current onward status: ' + onwardStatus
      });
    }

    if (req.user && req.user.role === 'VENDOR') {
      const userIdString = req.user._id.toString();
      const vendorIdString = (transfer.vendor_details && transfer.vendor_details.vendor_id)
        ? String(transfer.vendor_details.vendor_id)
        : null;
      if (!vendorIdString || vendorIdString !== userIdString) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This transfer does not belong to your vendor account.'
        });
      }
    }

    const contactNumber = (driverDetails.contact_number && /^\+[1-9]\d{1,14}$/.test(driverDetails.contact_number))
      ? driverDetails.contact_number
      : '+10000000000';

    transfer.return_assigned_driver_details = {
      driver_id: driverDetails.driver_id,
      name: driverDetails.name,
      contact_number: contactNumber,
      vehicle_type: driverDetails.vehicle_type || 'sedan',
      vehicle_number: driverDetails.vehicle_number || 'TBD',
      assigned_at: new Date()
    };
    transfer.return_transfer_details.transfer_status = 'assigned';
    transfer.addAuditLog('driver_assigned', req.user ? `user:${req.user._id}` : 'api', `Return driver ${driverDetails.name} assigned`);
    await transfer.save();

    try {
      const message = MESSAGE_TEMPLATES.driverAssigned(
        transfer.customer_details.name,
        driverDetails.name,
        driverDetails.vehicle_type || 'sedan',
        driverDetails.vehicle_number || 'TBD',
        transfer.return_transfer_details.pickup_location,
        moment(transfer.return_transfer_details.estimated_pickup_time).format('MMMM Do YYYY, h:mm A')
      );
      await sendNotification(transfer.customer_details.contact_number, message, 'whatsapp');
      await transfer.addNotificationRecord('whatsapp', message, transfer.customer_details.contact_number);
    } catch (notificationError) {
      console.error('Return driver assignment notification failed:', notificationError);
    }

    try {
      await notifyClientDriverAssigned(transfer);
    } catch (notifErr) {
      console.error('In-app notification (return driver assigned) failed:', notifErr);
    }

    res.json({
      success: true,
      message: 'Return driver assigned successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error assigning return driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign return driver',
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

// Get transfer statistics (admin: all; client: own transfers only)
const getTransferStats = async (req, res) => {
  try {
    const baseFilter = {};
    if (req.user && req.user.role === 'CLIENT') {
      baseFilter.customer_id = req.user._id;
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Status aggregation
    const stats = await Transfer.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$transfer_details.transfer_status', count: { $sum: 1 } } }
    ]);

    const totalTransfers = await Transfer.countDocuments(baseFilter);

    // Placeholder flights (XX000, TBD, etc.) – exclude from today counts; sync uses nowIso when no date
    const placeholderFlights = ['', 'XX000', 'TBD', 'N/A'];

    // Arrivals today (onward flight arrival_time) – only real flights, not placeholders
    const todayArrivals = await Transfer.countDocuments({
      ...baseFilter,
      'flight_details.arrival_time': { $gte: startOfDay, $lte: endOfDay },
      'flight_details.flight_no': { $exists: true, $nin: placeholderFlights }
    });

    // Departures today (onward departure OR return departure) – only real flights
    const todayDepartures = await Transfer.countDocuments({
      ...baseFilter,
      $or: [
        {
          'flight_details.departure_time': { $gte: startOfDay, $lte: endOfDay },
          'flight_details.flight_no': { $exists: true, $nin: placeholderFlights }
        },
        {
          'return_flight_details.departure_time': { $gte: startOfDay, $lte: endOfDay },
          'return_flight_details.flight_no': { $exists: true, $nin: placeholderFlights }
        }
      ]
    });

    const upcomingTransfers = await Transfer.countDocuments({
      ...baseFilter,
      'flight_details.arrival_time': { $gte: new Date() },
      'transfer_details.transfer_status': { $in: ['pending', 'assigned', 'enroute', 'waiting', 'in_progress'] }
    });

    const completedCount = stats.find(s => s._id === 'completed')?.count || 0;
    const successRate = totalTransfers > 0
      ? Math.round((completedCount / totalTransfers) * 100 * 10) / 10
      : 0;

    const byStatus = stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    const data = {
      total: totalTransfers,
      todayArrivals,
      todayDepartures,
      upcoming: upcomingTransfers,
      successRate,
      byStatus
    };

    // Active drivers only for admin roles
    if (req.user && !['CLIENT', 'TRAVELER', 'DRIVER'].includes(req.user.role)) {
      const activeDriversResult = await Transfer.aggregate([
        { $match: baseFilter },
        {
          $match: {
            'assigned_driver_details.driver_id': { $exists: true, $ne: null },
            'transfer_details.transfer_status': { $in: ['assigned', 'enroute', 'waiting', 'in_progress'] }
          }
        },
        { $group: { _id: '$assigned_driver_details.driver_id' } },
        { $count: 'activeDrivers' }
      ]);
      data.activeDrivers = activeDriversResult[0]?.activeDrivers || 0;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching transfer stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transfer statistics',
      error: error.message
    });
  }
};

// Update client details (flight info, passengers, luggage, notes, delegate fields)
const updateClientDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { flight_details, customer_details, transfer_details, traveler_details, traveler_flight_details, delegates, return_flight_details, return_transfer_details } = req.body;
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
        ...transfer.flight_details.toObject ? transfer.flight_details.toObject() : transfer.flight_details,
        ...flight_details
      };
    }

    if (customer_details) {
      transfer.customer_details = {
        ...transfer.customer_details.toObject ? transfer.customer_details.toObject() : transfer.customer_details,
        ...customer_details
      };
    }

    if (traveler_details !== undefined) {
      if (traveler_details === null) {
        transfer.traveler_details = null;
      } else {
        transfer.traveler_details = {
          ...(transfer.traveler_details && (transfer.traveler_details.toObject ? transfer.traveler_details.toObject() : transfer.traveler_details)),
          ...traveler_details
        };
      }
    }

    if (traveler_flight_details !== undefined) {
      if (traveler_flight_details === null) {
        transfer.traveler_flight_details = null;
      } else {
        const existing = transfer.traveler_flight_details && (transfer.traveler_flight_details.toObject ? transfer.traveler_flight_details.toObject() : transfer.traveler_flight_details);
        transfer.traveler_flight_details = { ...existing, ...traveler_flight_details };
      }
    }

    // When Delegate 2 flight same as Delegate 1, copy from flight_details
    if (transfer.traveler_details && transfer.traveler_details.flight_same_as_delegate_1 === true && transfer.flight_details) {
      transfer.traveler_flight_details = {
        flight_no: transfer.flight_details.flight_no,
        airline: transfer.flight_details.airline,
        departure_airport: transfer.flight_details.departure_airport,
        arrival_airport: transfer.flight_details.arrival_airport,
        departure_time: transfer.flight_details.departure_time,
        arrival_time: transfer.flight_details.arrival_time,
        status: transfer.flight_details.status || 'on_time',
        delay_minutes: transfer.flight_details.delay_minutes ?? 0,
        gate: transfer.flight_details.gate,
        terminal: transfer.flight_details.terminal
      };
    }

    if (Array.isArray(delegates)) {
      const primaryFlight = transfer.flight_details;
      transfer.delegates = delegates.map((d) => {
        const entry = {
          traveler_id: mongoose.Types.ObjectId.isValid(d.traveler_id) ? new mongoose.Types.ObjectId(d.traveler_id) : d.traveler_id,
          flight_same_as_primary: d.flight_same_as_primary !== false,
          flight_details: d.flight_details || null
        };
        if (entry.flight_same_as_primary && primaryFlight) {
          entry.flight_details = {
            flight_no: primaryFlight.flight_no,
            airline: primaryFlight.airline,
            departure_airport: primaryFlight.departure_airport,
            arrival_airport: primaryFlight.arrival_airport,
            departure_time: primaryFlight.departure_time,
            arrival_time: primaryFlight.arrival_time,
            status: primaryFlight.status || 'on_time',
            delay_minutes: primaryFlight.delay_minutes ?? 0,
            gate: primaryFlight.gate,
            terminal: primaryFlight.terminal
          };
        }
        return entry;
      });
    }

    if (transfer_details && transfer_details.special_notes !== undefined) {
      transfer.transfer_details = {
        ...transfer.transfer_details,
        special_notes: transfer_details.special_notes
      };
    }

    if (return_flight_details !== undefined) {
      if (return_flight_details === null) {
        transfer.return_flight_details = null;
      } else {
        transfer.return_flight_details = {
          ...(transfer.return_flight_details && (transfer.return_flight_details.toObject ? transfer.return_flight_details.toObject() : transfer.return_flight_details)),
          ...return_flight_details
        };
      }
    }
    if (return_transfer_details !== undefined) {
      if (return_transfer_details === null) {
        transfer.return_transfer_details = null;
      } else {
        transfer.return_transfer_details = {
          ...(transfer.return_transfer_details && (transfer.return_transfer_details.toObject ? transfer.return_transfer_details.toObject() : transfer.return_transfer_details)),
          ...return_transfer_details
        };
      }
    }

    // Add audit log entry
    transfer.audit_log.push({
      action: 'client_details_updated',
      timestamp: new Date(),
      by: `user:${userId}`,
      details: 'Client updated transfer details (flight info, passengers, notes)'
    });

    await transfer.save();

    const populated = await Transfer.findById(transfer._id)
      .populate('traveler_id', 'username email profile')
      .populate('delegates.traveler_id', 'username email profile');
    res.status(200).json({
      success: true,
      message: 'Transfer details updated successfully',
      data: populated
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

// Sync transfers from event registration Google Sheet
const syncTransfersFromRegistrationSheet = async (req, res) => {
  try {
    const { sheetId, sheetName, customerId, gid } = req.body;
    const user = req.user;

    if (!sheetId || typeof sheetId !== 'string' || !sheetId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'sheetId is required'
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    let resolvedCustomerId;

    if (user.role === 'CLIENT') {
      resolvedCustomerId = user._id;
    } else if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'OPERATIONS_MANAGER') {
      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'customerId is required for admin users'
        });
      }
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid customerId format',
          error: 'customerId must be a valid MongoDB ObjectId (24 hex characters)'
        });
      }
      resolvedCustomerId = new mongoose.Types.ObjectId(customerId);
    } else {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to run this sync'
      });
    }

    const sheetGid = gid != null ? parseInt(gid, 10) : 0;
    const results = await googleSheetsSyncService.syncTransfersFromRegistrationSheet(
      sheetId.trim(),
      sheetName && String(sheetName).trim() ? String(sheetName).trim() : '',
      resolvedCustomerId,
      user._id,
      Number.isNaN(sheetGid) ? 0 : sheetGid
    );

    const statusCode = results.success === false ? 400 : 200;

    return res.status(statusCode).json({
      success: results.success !== false,
      message: results.message,
      data: results
    });
  } catch (error) {
    console.error('Error syncing transfers from registration sheet:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync transfers from registration sheet',
      error: error.message
    });
  }
};

module.exports = {
  createTransfer,
  getTransfer,
  getTransfers,
  updateTransfer,
  updateFlightDetails,
  assignDriver,
  assignReturnDriver,
  updateDriverStatus,
  confirmTravelerPickup,
  deleteTransfer,
  getTransferStats,
  updateClientDetails,
  assignTraveler,
  assignVendor,
  syncTransfersFromRegistrationSheet
};
