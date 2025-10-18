const Transfer = require('../models/Transfer');
const { sendNotification, MESSAGE_TEMPLATES } = require('../config/twilio');
const { sendTemplatedEmail } = require('../config/nodemailer');
const moment = require('moment');

class NotificationService {
  constructor() {
    this.isRunning = false;
  }

  // Send driver assignment notification
  async sendDriverAssignmentNotification(transfer, driverDetails) {
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
      const whatsappResult = await sendNotification(
        transfer.customer_details.contact_number,
        message,
        'whatsapp'
      );

      // Send email notification
      const emailResult = await sendTemplatedEmail(
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

      // Record notifications
      if (whatsappResult.success) {
        await transfer.addNotificationRecord(
          'whatsapp',
          message,
          transfer.customer_details.contact_number
        );
      }

      return {
        success: true,
        whatsapp: whatsappResult,
        email: emailResult
      };
    } catch (error) {
      console.error('Error sending driver assignment notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send flight status update notification
  async sendFlightStatusNotification(transfer, newStatus, delayMinutes = 0) {
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
          return { success: true, message: 'No notification needed for this status' };
      }

      const results = {};

      // Send WhatsApp notification
      if (message) {
        const whatsappResult = await sendNotification(
          transfer.customer_details.contact_number,
          message,
          'whatsapp'
        );
        
        results.whatsapp = whatsappResult;
        
        if (whatsappResult.success) {
          await transfer.addNotificationRecord(
            'whatsapp',
            message,
            transfer.customer_details.contact_number
          );
        }
      }

      // Send email notification
      if (emailTemplate && emailData) {
        const emailResult = await sendTemplatedEmail(
          transfer.customer_details.email,
          emailTemplate,
          emailData
        );
        results.email = emailResult;
      }

      // Notify vendor about flight status change
      if (transfer.vendor_details.contact_number && (newStatus === 'delayed' || newStatus === 'cancelled')) {
        const vendorMessage = MESSAGE_TEMPLATES.vendorFlightUpdate(
          transfer.vendor_details.vendor_name,
          transfer.customer_details.name,
          transfer.flight_details.flight_no,
          newStatus,
          delayMinutes > 0 ? `Delayed by ${delayMinutes} minutes` : 'Status updated'
        );
        
        const vendorResult = await sendNotification(
          transfer.vendor_details.contact_number,
          vendorMessage,
          'whatsapp'
        );
        results.vendor = vendorResult;
      }

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Error sending flight status notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send driver waiting notification
  async sendDriverWaitingNotification(transfer) {
    try {
      if (!transfer.assigned_driver_details) {
        return { success: false, error: 'No driver assigned' };
      }

      const message = MESSAGE_TEMPLATES.driverWaiting(
        transfer.customer_details.name,
        transfer.assigned_driver_details.name,
        transfer.assigned_driver_details.vehicle_type,
        transfer.assigned_driver_details.vehicle_number,
        transfer.transfer_details.pickup_location
      );

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
      }

      return result;
    } catch (error) {
      console.error('Error sending driver waiting notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send pickup reminder
  async sendPickupReminder(transfer) {
    try {
      const message = MESSAGE_TEMPLATES.pickupReminder(
        transfer.customer_details.name,
        transfer.flight_details.flight_no,
        moment(transfer.transfer_details.estimated_pickup_time).format('MMMM Do YYYY, h:mm A')
      );

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
      }

      return result;
    } catch (error) {
      console.error('Error sending pickup reminder:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send driver dispatch reminder to vendor
  async sendDriverDispatchReminder(transfer) {
    try {
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
      }

      return result;
    } catch (error) {
      console.error('Error sending driver dispatch reminder:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send transfer completion notification
  async sendTransferCompletionNotification(transfer) {
    try {
      const message = MESSAGE_TEMPLATES.transferCompleted(
        transfer.customer_details.name,
        transfer.transfer_details.drop_location
      );

      const whatsappResult = await sendNotification(
        transfer.customer_details.contact_number,
        message,
        'whatsapp'
      );

      const emailResult = await sendTemplatedEmail(
        transfer.customer_details.email,
        'transferCompleted',
        [
          transfer.customer_details.name,
          transfer.transfer_details.drop_location,
          transfer._id
        ]
      );

      if (whatsappResult.success) {
        await transfer.addNotificationRecord(
          'whatsapp',
          message,
          transfer.customer_details.contact_number
        );
      }

      return {
        success: true,
        whatsapp: whatsappResult,
        email: emailResult
      };
    } catch (error) {
      console.error('Error sending transfer completion notification:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate next notification time based on preferences
  calculateNextNotificationTime(transfer) {
    const arrivalTime = new Date(transfer.flight_details.arrival_time);
    const now = new Date();
    const isNightTime = this.isNightTime(now);
    
    const preferences = transfer.notifications.notification_preferences;
    const intervals = isNightTime ? preferences.night : [preferences.day];
    
    let nextNotificationTime = null;
    
    for (const interval of intervals) {
      let notificationTime;
      
      switch (interval) {
        case '60_min_before':
          notificationTime = new Date(arrivalTime.getTime() - (60 * 60 * 1000));
          break;
        case '30_min_before':
          notificationTime = new Date(arrivalTime.getTime() - (30 * 60 * 1000));
          break;
        case '15_min_before':
          notificationTime = new Date(arrivalTime.getTime() - (15 * 60 * 1000));
          break;
        case 'on_arrival':
          notificationTime = arrivalTime;
          break;
        default:
          continue;
      }
      
      // Find the next upcoming notification time
      if (notificationTime > now && (!nextNotificationTime || notificationTime < nextNotificationTime)) {
        nextNotificationTime = notificationTime;
      }
    }
    
    return nextNotificationTime;
  }

  // Check if current time is night time (10 PM to 6 AM)
  isNightTime(date = new Date()) {
    const hour = date.getHours();
    return hour >= 22 || hour <= 6;
  }

  // Process scheduled notifications
  async processScheduledNotifications() {
    try {
      console.log('🔄 Processing scheduled notifications...');
      
      const now = new Date();
      const transfers = await Transfer.findRequiringNotification();
      
      let processedCount = 0;
      let successCount = 0;
      let errorCount = 0;
      
      for (const transfer of transfers) {
        try {
          processedCount++;
          
          // Determine what type of notification to send
          const arrivalTime = new Date(transfer.flight_details.arrival_time);
          const timeUntilArrival = arrivalTime - now;
          const minutesUntilArrival = Math.floor(timeUntilArrival / (1000 * 60));
          
          let notificationResult;
          
          if (minutesUntilArrival <= 15 && minutesUntilArrival > 0) {
            // Send pickup reminder
            notificationResult = await this.sendPickupReminder(transfer);
          } else if (minutesUntilArrival <= 30 && minutesUntilArrival > 0) {
            // Send driver dispatch reminder to vendor
            notificationResult = await this.sendDriverDispatchReminder(transfer);
          } else if (transfer.flight_details.status === 'landed' && 
                     transfer.assigned_driver_details?.status !== 'waiting') {
            // Send driver waiting notification
            notificationResult = await this.sendDriverWaitingNotification(transfer);
          }
          
          if (notificationResult && notificationResult.success) {
            successCount++;
          } else if (notificationResult && !notificationResult.success) {
            errorCount++;
          }
          
          // Update next scheduled notification time
          const nextNotificationTime = this.calculateNextNotificationTime(transfer);
          transfer.notifications.next_scheduled_notification = nextNotificationTime;
          await transfer.save();
          
        } catch (error) {
          console.error(`Error processing notification for transfer ${transfer._id}:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ Notification processing completed: ${processedCount} processed, ${successCount} successful, ${errorCount} errors`);
      
      return {
        processed: processedCount,
        successful: successCount,
        errors: errorCount
      };
    } catch (error) {
      console.error('Error in processScheduledNotifications:', error);
      throw error;
    }
  }

  // Send emergency notifications for critical situations
  async sendEmergencyNotifications() {
    try {
      console.log('🚨 Processing emergency notifications...');
      
      // Find transfers that need emergency attention
      const emergencyTransfers = await Transfer.find({
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
          }
        ]
      });
      
      let processedCount = 0;
      let successCount = 0;
      
      for (const transfer of emergencyTransfers) {
        try {
          processedCount++;
          
          if (transfer.flight_details.status === 'cancelled') {
            // Send cancellation notification
            const result = await this.sendFlightStatusNotification(transfer, 'cancelled');
            if (result.success) successCount++;
          } else if (transfer.flight_details.status === 'landed') {
            // Send urgent driver dispatch reminder
            const result = await this.sendDriverDispatchReminder(transfer);
            if (result.success) successCount++;
          }
          
        } catch (error) {
          console.error(`Error sending emergency notification for transfer ${transfer._id}:`, error);
        }
      }
      
      console.log(`✅ Emergency notifications completed: ${processedCount} processed, ${successCount} successful`);
      
      return {
        processed: processedCount,
        successful: successCount
      };
    } catch (error) {
      console.error('Error in sendEmergencyNotifications:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();
