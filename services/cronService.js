const cron = require('node-cron');
const Transfer = require('../models/Transfer');
const { getFlightByNumber, batchUpdateFlights } = require('../config/flightApi');
const notificationService = require('./notificationService');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  // Start all cron jobs
  startAllJobs() {
    if (this.isRunning) {
      console.log('⚠️ Cron jobs are already running');
      return;
    }

    console.log('🚀 Starting HALO cron jobs...');
    
    // Flight status sync - every 10 minutes
    this.startJob('flight-sync', '*/10 * * * *', this.syncFlightStatuses.bind(this));
    
    // Notification processing - every 5 minutes
    this.startJob('notifications', '*/5 * * * *', this.processNotifications.bind(this));
    
    // Emergency notifications - every 2 minutes
    this.startJob('emergency', '*/2 * * * *', this.processEmergencyNotifications.bind(this));
    
    // Vendor dispatch reminders - every 15 minutes
    this.startJob('vendor-reminders', '*/15 * * * *', this.sendVendorDispatchReminders.bind(this));
    
    // Cleanup old notifications - daily at 2 AM
    this.startJob('cleanup', '0 2 * * *', this.cleanupOldData.bind(this));
    
    // Health check - every hour
    this.startJob('health-check', '0 * * * *', this.healthCheck.bind(this));
    
    this.isRunning = true;
    console.log('✅ All cron jobs started successfully');
  }

  // Stop all cron jobs
  stopAllJobs() {
    console.log('🛑 Stopping all cron jobs...');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    }
    
    this.jobs.clear();
    this.isRunning = false;
    console.log('✅ All cron jobs stopped');
  }

  // Start a single cron job
  startJob(name, schedule, task) {
    try {
      const job = cron.schedule(schedule, task, {
        scheduled: false,
        timezone: 'UTC'
      });
      
      job.start();
      this.jobs.set(name, job);
      
      console.log(`✅ Started cron job: ${name} (${schedule})`);
    } catch (error) {
      console.error(`❌ Failed to start cron job ${name}:`, error);
    }
  }

  // Sync flight statuses from external API
  async syncFlightStatuses() {
    try {
      console.log('🔄 Syncing flight statuses...');
      
      // Get all active transfers (flights that haven't landed or been cancelled)
      const activeTransfers = await Transfer.find({
        'flight_details.status': { $in: ['on_time', 'delayed', 'boarding', 'departed'] },
        'flight_details.arrival_time': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).limit(50); // Limit to avoid API rate limits
      
      if (activeTransfers.length === 0) {
        console.log('📭 No active transfers to sync');
        return;
      }
      
      const flightNumbers = [...new Set(activeTransfers.map(t => t.flight_details.flight_no))];
      console.log(`✈️ Syncing ${flightNumbers.length} unique flights`);
      
      // Batch update flights
      const results = await batchUpdateFlights(flightNumbers);
      
      let updatedCount = 0;
      let errorCount = 0;
      
      for (const transfer of activeTransfers) {
        try {
          const flightResult = results.find(r => 
            r.success && r.data && r.data.flight_no === transfer.flight_details.flight_no
          );
          
          if (flightResult && flightResult.data) {
            const oldStatus = transfer.flight_details.status;
            const newStatus = flightResult.data.status;
            
            if (oldStatus !== newStatus) {
              // Update flight status
              await transfer.updateFlightStatus(newStatus, flightResult.data.delay_minutes || 0);
              
              // Update additional details
              if (flightResult.data.gate) transfer.flight_details.gate = flightResult.data.gate;
              if (flightResult.data.terminal) transfer.flight_details.terminal = flightResult.data.terminal;
              
              await transfer.save();
              
              console.log(`✅ Updated ${transfer.flight_details.flight_no}: ${oldStatus} → ${newStatus}`);
              updatedCount++;
              
              // Send notification if status changed significantly
              if (['landed', 'cancelled', 'delayed'].includes(newStatus)) {
                await notificationService.sendFlightStatusNotification(
                  transfer, 
                  newStatus, 
                  flightResult.data.delay_minutes || 0
                );
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error updating transfer ${transfer._id}:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ Flight sync completed: ${updatedCount} updated, ${errorCount} errors`);
      
    } catch (error) {
      console.error('❌ Error in flight status sync:', error);
    }
  }

  // Process scheduled notifications
  async processNotifications() {
    try {
      console.log('📱 Processing scheduled notifications...');
      
      const result = await notificationService.processScheduledNotifications();
      console.log(`✅ Notifications processed: ${result.processed} total, ${result.successful} successful, ${result.errors} errors`);
      
    } catch (error) {
      console.error('❌ Error processing notifications:', error);
    }
  }

  // Process emergency notifications
  async processEmergencyNotifications() {
    try {
      console.log('🚨 Processing emergency notifications...');
      
      const result = await notificationService.sendEmergencyNotifications();
      console.log(`✅ Emergency notifications: ${result.processed} processed, ${result.successful} successful`);
      
    } catch (error) {
      console.error('❌ Error processing emergency notifications:', error);
    }
  }

  // Send vendor dispatch reminders
  async sendVendorDispatchReminders() {
    try {
      console.log('🚗 Sending vendor dispatch reminders...');
      
      // Find transfers that need driver dispatch reminders
      const now = new Date();
      const reminderTime = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutes from now
      
      const transfersNeedingReminders = await Transfer.find({
        'flight_details.arrival_time': { $lte: reminderTime },
        'flight_details.arrival_time': { $gte: now },
        'transfer_details.transfer_status': 'pending',
        'flight_details.status': { $in: ['on_time', 'delayed'] },
        'notifications.last_notification_sent': {
          $lt: new Date(now.getTime() - (15 * 60 * 1000)) // Not sent in last 15 minutes
        }
      });
      
      let sentCount = 0;
      let errorCount = 0;
      
      for (const transfer of transfersNeedingReminders) {
        try {
          const result = await notificationService.sendDriverDispatchReminder(transfer);
          if (result.success) {
            sentCount++;
            console.log(`✅ Sent dispatch reminder for ${transfer._id}`);
          } else {
            errorCount++;
            console.error(`❌ Failed to send dispatch reminder for ${transfer._id}:`, result.error);
          }
        } catch (error) {
          console.error(`❌ Error sending dispatch reminder for ${transfer._id}:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ Vendor reminders completed: ${sentCount} sent, ${errorCount} errors`);
      
    } catch (error) {
      console.error('❌ Error sending vendor dispatch reminders:', error);
    }
  }

  // Cleanup old data
  async cleanupOldData() {
    try {
      console.log('🧹 Starting data cleanup...');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Clean up old notification history (keep last 50 notifications per transfer)
      const transfers = await Transfer.find({
        'notifications.notification_history': { $exists: true, $ne: [] }
      });
      
      let cleanedCount = 0;
      
      for (const transfer of transfers) {
        const history = transfer.notifications.notification_history || [];
        if (history.length > 50) {
          // Keep only the last 50 notifications
          transfer.notifications.notification_history = history
            .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
            .slice(0, 50);
          
          await transfer.save();
          cleanedCount++;
        }
      }
      
      // Clean up old audit logs (keep last 100 entries per transfer)
      const transfersWithAuditLogs = await Transfer.find({
        'audit_log': { $exists: true, $ne: [] }
      });
      
      let auditCleanedCount = 0;
      
      for (const transfer of transfersWithAuditLogs) {
        const auditLog = transfer.audit_log || [];
        if (auditLog.length > 100) {
          // Keep only the last 100 audit entries
          transfer.audit_log = auditLog
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 100);
          
          await transfer.save();
          auditCleanedCount++;
        }
      }
      
      console.log(`✅ Data cleanup completed: ${cleanedCount} transfers cleaned (notifications), ${auditCleanedCount} transfers cleaned (audit logs)`);
      
    } catch (error) {
      console.error('❌ Error in data cleanup:', error);
    }
  }

  // Health check
  async healthCheck() {
    try {
      console.log('🏥 Running health check...');
      
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
      
      // Check for stuck transfers
      const stuckTransfers = await Transfer.find({
        'flight_details.status': 'landed',
        'flight_details.arrival_time': { $lt: oneHourAgo },
        'transfer_details.transfer_status': { $in: ['assigned', 'enroute'] },
        'assigned_driver_details.status': { $ne: 'waiting' }
      });
      
      if (stuckTransfers.length > 0) {
        console.log(`⚠️ Found ${stuckTransfers.length} stuck transfers that need attention`);
        
        // Send alerts for stuck transfers
        for (const transfer of stuckTransfers) {
          try {
            await notificationService.sendDriverDispatchReminder(transfer);
            console.log(`🚨 Sent alert for stuck transfer ${transfer._id}`);
          } catch (error) {
            console.error(`❌ Failed to send alert for stuck transfer ${transfer._id}:`, error);
          }
        }
      }
      
      // Check for transfers without drivers assigned
      const unassignedTransfers = await Transfer.find({
        'flight_details.arrival_time': { $lte: new Date(now.getTime() + (2 * 60 * 60 * 1000)) }, // Next 2 hours
        'transfer_details.transfer_status': 'pending',
        'flight_details.status': { $in: ['on_time', 'delayed'] }
      });
      
      if (unassignedTransfers.length > 0) {
        console.log(`⚠️ Found ${unassignedTransfers.length} transfers without drivers assigned`);
      }
      
      // Get system statistics
      const totalTransfers = await Transfer.countDocuments();
      const todayTransfers = await Transfer.countDocuments({
        'create_time': {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lt: new Date(now.setHours(23, 59, 59, 999))
        }
      });
      
      console.log(`📊 System stats: ${totalTransfers} total transfers, ${todayTransfers} created today`);
      console.log('✅ Health check completed');
      
    } catch (error) {
      console.error('❌ Error in health check:', error);
    }
  }

  // Get cron job status
  getJobStatus() {
    const status = {};
    
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    }
    
    return {
      isRunning: this.isRunning,
      jobs: status,
      totalJobs: this.jobs.size
    };
  }

  // Manually trigger a specific job
  async triggerJob(jobName) {
    try {
      switch (jobName) {
        case 'flight-sync':
          await this.syncFlightStatuses();
          break;
        case 'notifications':
          await this.processNotifications();
          break;
        case 'emergency':
          await this.processEmergencyNotifications();
          break;
        case 'vendor-reminders':
          await this.sendVendorDispatchReminders();
          break;
        case 'cleanup':
          await this.cleanupOldData();
          break;
        case 'health-check':
          await this.healthCheck();
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }
      
      return { success: true, message: `Job ${jobName} executed successfully` };
    } catch (error) {
      console.error(`Error triggering job ${jobName}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new CronService();
