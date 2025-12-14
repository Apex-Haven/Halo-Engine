const Transfer = require('../models/Transfer');
const { getFlightByNumber, batchUpdateFlights } = require('../config/flightApi');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const { sendTemplatedEmail } = require('../config/nodemailer');
const moment = require('moment');

// Get flight status by flight number
const getFlightStatus = async (req, res) => {
  try {
    const { flight_no } = req.params;
    
    const flightData = await getFlightByNumber(flight_no);
    
    if (!flightData) {
      return res.status(404).json({
        success: false,
        message: 'Flight not found',
        flight_no
      });
    }

    res.json({
      success: true,
      data: flightData
    });
  } catch (error) {
    console.error('Error fetching flight status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch flight status',
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

// Sync flight status from external API
const syncFlightStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // Get latest flight data from API
    const flightData = await getFlightByNumber(transfer.flight_details.flight_no);
    
    if (!flightData) {
      return res.status(404).json({
        success: false,
        message: 'Flight data not available from API',
        flight_no: transfer.flight_details.flight_no
      });
    }

    // Update transfer with latest flight data
    const oldStatus = transfer.flight_details.status;
    const oldArrivalTime = transfer.flight_details.arrival_time;
    
    transfer.flight_details.status = flightData.status;
    transfer.flight_details.delay_minutes = flightData.delay_minutes || 0;
    transfer.flight_details.gate = flightData.gate || transfer.flight_details.gate;
    transfer.flight_details.terminal = flightData.terminal || transfer.flight_details.terminal;
    
    // Update arrival time if delayed
    if (flightData.delay_minutes > 0) {
      const originalArrival = new Date(oldArrivalTime);
      transfer.flight_details.arrival_time = new Date(originalArrival.getTime() + (flightData.delay_minutes * 60000));
    }
    
    transfer.addAuditLog('flight_updated', 'api_sync', `Flight status synced: ${oldStatus} → ${flightData.status}`);
    await transfer.save();

    // Send notifications if status changed
    if (oldStatus !== flightData.status) {
      await handleFlightStatusNotifications(transfer, flightData.status, flightData.delay_minutes);
    }

    res.json({
      success: true,
      message: 'Flight status synced successfully',
      data: {
        oldStatus,
        newStatus: flightData.status,
        delayMinutes: flightData.delay_minutes,
        transfer
      }
    });
  } catch (error) {
    console.error('Error syncing flight status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync flight status',
      error: error.message
    });
  }
};

// Batch sync multiple flights
const batchSyncFlights = async (req, res) => {
  try {
    const { flight_numbers } = req.body;
    
    if (!Array.isArray(flight_numbers) || flight_numbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'flight_numbers must be a non-empty array'
      });
    }

    // Get all transfers for these flights
    const transfers = await Transfer.find({
      'flight_details.flight_no': { $in: flight_numbers.map(fn => fn.toUpperCase()) }
    });

    if (transfers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No transfers found for the provided flight numbers'
      });
    }

    // Batch update flights
    const results = await batchUpdateFlights(flight_numbers);
    
    // Update transfers with new flight data
    const updateResults = [];
    for (const transfer of transfers) {
      try {
        const flightData = results.find(r => 
          r.success && r.data && r.data.flight_no === transfer.flight_details.flight_no
        );
        
        if (flightData && flightData.data) {
          const oldStatus = transfer.flight_details.status;
          
          transfer.flight_details.status = flightData.data.status;
          transfer.flight_details.delay_minutes = flightData.data.delay_minutes || 0;
          transfer.flight_details.gate = flightData.data.gate || transfer.flight_details.gate;
          transfer.flight_details.terminal = flightData.data.terminal || transfer.flight_details.terminal;
          
          transfer.addAuditLog('flight_updated', 'batch_sync', `Batch sync: ${oldStatus} → ${flightData.data.status}`);
          await transfer.save();
          
          updateResults.push({
            apexId: transfer._id,
            flightNo: transfer.flight_details.flight_no,
            success: true,
            oldStatus,
            newStatus: flightData.data.status
          });
        } else {
          updateResults.push({
            apexId: transfer._id,
            flightNo: transfer.flight_details.flight_no,
            success: false,
            error: 'Flight data not available'
          });
        }
      } catch (error) {
        updateResults.push({
          apexId: transfer._id,
          flightNo: transfer.flight_details.flight_no,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Batch flight sync completed',
      data: {
        totalTransfers: transfers.length,
        updated: updateResults.filter(r => r.success).length,
        failed: updateResults.filter(r => !r.success).length,
        results: updateResults
      }
    });
  } catch (error) {
    console.error('Error in batch flight sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to batch sync flights',
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
