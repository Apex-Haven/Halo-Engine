const Transfer = require('../models/Transfer');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const { sendTemplatedEmail } = require('../config/nodemailer');
const moment = require('moment');

// Get flight status by flight number (deprecated - use global search instead)
const getFlightStatus = async (req, res) => {
  try {
    return res.status(410).json({
      success: false,
      message: 'This endpoint is deprecated. Please use the global flight search API instead.',
      suggestion: 'GET /api/flights/global-search?flight=FLIGHT_NUMBER&date=YYYY-MM-DD'
    });
  } catch (error) {
    console.error('Error in deprecated flight status endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Endpoint deprecated',
      error: error.message
    });
  }
};

// Update flight status for a specific transfer
const updateTransferFlightStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, delay_minutes, gate, terminal } = req.body;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // Update flight status
    await transfer.updateFlightStatus(status, delay_minutes);
    
    // Update additional flight details if provided
    if (gate) transfer.flight_details.gate = gate;
    if (terminal) transfer.flight_details.terminal = terminal;
    
    await transfer.save();

    // Send notifications based on status change
    await handleFlightStatusNotifications(transfer, status, delay_minutes);

    res.json({
      success: true,
      message: 'Flight status updated successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Error updating flight status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update flight status',
      error: error.message
    });
  }
};

// Sync flight status from external API (deprecated)
const syncFlightStatus = async (req, res) => {
  try {
    return res.status(410).json({
      success: false,
      message: 'Flight sync is deprecated. Flight data is now fetched on-demand using the global search API.',
      suggestion: 'Use GET /api/flights/global-search for real-time flight information'
    });
  } catch (error) {
    console.error('Error in deprecated flight sync endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Endpoint deprecated',
      error: error.message
    });
  }
};

// Batch sync multiple flights (deprecated)
const batchSyncFlights = async (req, res) => {
  try {
    return res.status(410).json({
      success: false,
      message: 'Batch flight sync is deprecated. Flight data is now fetched on-demand using the global search API.',
      suggestion: 'Use GET /api/flights/global-search for real-time flight information'
    });
  } catch (error) {
    console.error('Error in deprecated batch flight sync endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Endpoint deprecated',
      error: error.message
    });
  }
};

// Get flights requiring attention
const getFlightsRequiringAttention = async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const futureTime = new Date(Date.now() + (hours * 60 * 60 * 1000));
    
    // Find flights that need attention
    const attentionFlights = await Transfer.find({
      $or: [
        // Flights that have landed but no driver is waiting
        {
          'flight_details.status': 'landed',
          'assigned_driver_details.status': { $ne: 'waiting' },
          'transfer_details.transfer_status': { $in: ['assigned', 'enroute'] }
        },
        // Cancelled flights
        {
          'flight_details.status': 'cancelled',
          'transfer_details.transfer_status': { $in: ['pending', 'assigned', 'enroute'] }
        },
        // Flights arriving soon without driver assignment
        {
          'flight_details.arrival_time': { $lte: futureTime },
          'transfer_details.transfer_status': 'pending',
          'flight_details.status': { $in: ['on_time', 'delayed'] }
        },
        // Delayed flights that need pickup time adjustment
        {
          'flight_details.status': 'delayed',
          'flight_details.delay_minutes': { $gt: 30 },
          'transfer_details.transfer_status': { $in: ['assigned', 'enroute'] }
        }
      ]
    }).sort({ 'flight_details.arrival_time': 1 });

    res.json({
      success: true,
      data: attentionFlights,
      count: attentionFlights.length
    });
  } catch (error) {
    console.error('Error fetching flights requiring attention:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flights requiring attention',
      error: error.message
    });
  }
};

// Handle flight status change notifications
const handleFlightStatusNotifications = async (transfer, newStatus, delayMinutes = 0) => {
  try {
    let message, emailTemplate, emailData;
    
    switch (newStatus) {
      case 'delayed':
        message = MESSAGE_TEMPLATES.flightDelayed(
          transfer.customer_details.name,
          transfer.flight_details.flight_no,
          delayMinutes,
          moment(transfer.flight_details.arrival_time).format('MMMM Do YYYY, h:mm A')
        );
        emailTemplate = 'flightDelayed';
        emailData = [
          transfer.customer_details.name,
          transfer.flight_details.flight_no,
          delayMinutes,
          moment(transfer.flight_details.arrival_time).format('MMMM Do YYYY, h:mm A'),
          transfer._id
        ];
        break;
        
      case 'landed':
        if (transfer.assigned_driver_details) {
          message = MESSAGE_TEMPLATES.flightLanded(
            transfer.customer_details.name,
            transfer.flight_details.flight_no,
            transfer.assigned_driver_details.name,
            transfer.assigned_driver_details.vehicle_type
          );
          emailTemplate = 'flightLanded';
          emailData = [
            transfer.customer_details.name,
            transfer.flight_details.flight_no,
            transfer.assigned_driver_details.name,
            transfer.assigned_driver_details.vehicle_type,
            transfer.transfer_details.pickup_location,
            transfer._id
          ];
        }
        break;
        
      case 'cancelled':
        message = MESSAGE_TEMPLATES.transferCancelled(
          transfer.customer_details.name,
          'Flight cancellation'
        );
        break;
        
      default:
        return; // No notification needed for other statuses
    }

    // Send WhatsApp notification
    if (message) {
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
    }

    // Send email notification
    if (emailTemplate && emailData) {
      await sendTemplatedEmail(
        transfer.customer_details.email,
        emailTemplate,
        emailData
      );
    }

    // Notify vendor about flight status change
    if (transfer.vendor_details.contact_number) {
      const vendorMessage = MESSAGE_TEMPLATES.vendorFlightUpdate(
        transfer.vendor_details.vendor_name,
        transfer.customer_details.name,
        transfer.flight_details.flight_no,
        newStatus,
        delayMinutes > 0 ? `Delayed by ${delayMinutes} minutes` : 'Status updated'
      );
      
      await sendNotification(
        transfer.vendor_details.contact_number,
        vendorMessage,
        'whatsapp'
      );
    }

  } catch (error) {
    console.error('Error sending flight status notifications:', error);
    // Don't throw error to avoid breaking the main flow
  }
};

module.exports = {
  getFlightStatus,
  updateTransferFlightStatus,
  syncFlightStatus,
  batchSyncFlights,
  getFlightsRequiringAttention
};
