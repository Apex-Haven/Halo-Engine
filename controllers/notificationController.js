const Transfer = require('../models/Transfer');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const { sendTemplatedEmail } = require('../config/nodemailer');
const moment = require('moment');

// Send manual notification
const sendManualNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, message, media_url } = req.body;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    let result;
    
    switch (type.toLowerCase()) {
      case 'whatsapp':
      case 'sms':
        result = await sendNotification(
          transfer.customer_details.contact_number,
          message,
          type,
          media_url
        );
        break;
        
      case 'email':
        result = await sendTemplatedEmail(
          transfer.customer_details.email,
          'custom',
          [message]
        );
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid notification type. Supported types: whatsapp, sms, email'
        });
    }

    if (result.success) {
      // Record notification in transfer
      await transfer.addNotificationRecord(
        type,
        message,
        type === 'email' ? transfer.customer_details.email : transfer.customer_details.contact_number,
        'sent'
      );

      res.json({
        success: true,
        message: 'Notification sent successfully',
        data: {
          type,
          recipient: type === 'email' ? transfer.customer_details.email : transfer.customer_details.contact_number,
          messageId: result.messageId,
          transfer: transfer._id
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send notification',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending manual notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
};

// Send pickup reminder
const sendPickupReminder = async (req, res) => {
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

    const message = MESSAGE_TEMPLATES.pickupReminder(
      transfer.customer_details.name,
      transfer.flight_details.flight_no,
      moment(transfer.transfer_details.estimated_pickup_time).format('MMMM Do YYYY, h:mm A')
    );

    // Send WhatsApp notification
    const result = await sendNotification(
      transfer.customer_details.contact_number,
      message,
      'whatsapp'
    );

    if (result.success) {
      await transfer.addNotificationRecord(
        'whatsapp',
        message,
        transfer.customer_details.contact_number
      );

      res.json({
        success: true,
        message: 'Pickup reminder sent successfully',
        data: {
          type: 'whatsapp',
          recipient: transfer.customer_details.contact_number,
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send pickup reminder',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending pickup reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send pickup reminder',
      error: error.message
    });
  }
};

// Send driver dispatch reminder to vendor
const sendDriverDispatchReminder = async (req, res) => {
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

    const message = MESSAGE_TEMPLATES.vendorDriverDispatch(
      transfer.vendor_details.vendor_name,
      transfer.customer_details.name,
      transfer.flight_details.flight_no,
      moment(transfer.flight_details.arrival_time).format('MMMM Do YYYY, h:mm A'),
      transfer.transfer_details.pickup_location
    );

    const result = await sendNotification(
      transfer.vendor_details.contact_number,
      message,
      'whatsapp'
    );

    if (result.success) {
      await transfer.addNotificationRecord(
        'whatsapp',
        message,
        transfer.vendor_details.contact_number
      );

      res.json({
        success: true,
        message: 'Driver dispatch reminder sent successfully',
        data: {
          type: 'whatsapp',
          recipient: transfer.vendor_details.contact_number,
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send driver dispatch reminder',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending driver dispatch reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send driver dispatch reminder',
      error: error.message
    });
  }
};

// Get notification history for a transfer
const getNotificationHistory = async (req, res) => {
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

    const history = transfer.notifications.notification_history || [];
    
    // Sort by most recent first
    history.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

    res.json({
      success: true,
      data: {
        transferId: id,
        totalNotifications: history.length,
        lastNotificationSent: transfer.notifications.last_notification_sent,
        nextScheduledNotification: transfer.notifications.next_scheduled_notification,
        history
      }
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification history',
      error: error.message
    });
  }
};

// Update notification preferences
const updateNotificationPreferences = async (req, res) => {
  try {
    const { id } = req.params;
    const { day, night } = req.body;
    
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found',
        apexId: id
      });
    }

    // Update notification preferences
    if (day) {
      transfer.notifications.notification_preferences.day = day;
    }
    
    if (night && Array.isArray(night)) {
      transfer.notifications.notification_preferences.night = night;
    }

    await transfer.save();

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        preferences: transfer.notifications.notification_preferences
      }
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences',
      error: error.message
    });
  }
};

// Send bulk notifications
const sendBulkNotifications = async (req, res) => {
  try {
    const { transfer_ids, type, message, template } = req.body;
    
    if (!Array.isArray(transfer_ids) || transfer_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'transfer_ids must be a non-empty array'
      });
    }

    if (!message && !template) {
      return res.status(400).json({
        success: false,
        message: 'Either message or template must be provided'
      });
    }

    const results = [];
    
    for (const transferId of transfer_ids) {
      try {
        const transfer = await Transfer.findById(transferId);
        if (!transfer) {
          results.push({
            transferId,
            success: false,
            error: 'Transfer not found'
          });
          continue;
        }

        let notificationMessage = message;
        
        // Use template if provided
        if (template && MESSAGE_TEMPLATES[template]) {
          notificationMessage = MESSAGE_TEMPLATES[template](
            transfer.customer_details.name,
            transfer.flight_details.flight_no,
            transfer.assigned_driver_details?.name || 'TBD',
            transfer.assigned_driver_details?.vehicle_type || 'TBD'
          );
        }

        const result = await sendNotification(
          transfer.customer_details.contact_number,
          notificationMessage,
          type
        );

        if (result.success) {
          await transfer.addNotificationRecord(
            type,
            notificationMessage,
            transfer.customer_details.contact_number
          );
        }

        results.push({
          transferId,
          success: result.success,
          messageId: result.messageId,
          error: result.error
        });

      } catch (error) {
        results.push({
          transferId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: 'Bulk notification completed',
      data: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        results
      }
    });
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk notifications',
      error: error.message
    });
  }
};

// Get notification statistics
const getNotificationStats = async (req, res) => {
  try {
    const { period = '7' } = req.query; // days
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const stats = await Transfer.aggregate([
      {
        $match: {
          'notifications.notification_history.sent_at': { $gte: startDate }
        }
      },
      {
        $unwind: '$notifications.notification_history'
      },
      {
        $match: {
          'notifications.notification_history.sent_at': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            type: '$notifications.notification_history.type',
            status: '$notifications.notification_history.status'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = stats.reduce((acc, stat) => {
      const key = `${stat._id.type}_${stat._id.status}`;
      acc[key] = stat.count;
      return acc;
    }, {});

    // Get total notifications sent
    const totalNotifications = await Transfer.aggregate([
      {
        $match: {
          'notifications.notification_history.sent_at': { $gte: startDate }
        }
      },
      {
        $project: {
          notificationCount: { $size: '$notifications.notification_history' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$notificationCount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: `${period} days`,
        totalNotifications: totalNotifications[0]?.total || 0,
        byTypeAndStatus: formattedStats
      }
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics',
      error: error.message
    });
  }
};

module.exports = {
  sendManualNotification,
  sendPickupReminder,
  sendDriverDispatchReminder,
  getNotificationHistory,
  updateNotificationPreferences,
  sendBulkNotifications,
  getNotificationStats
};
