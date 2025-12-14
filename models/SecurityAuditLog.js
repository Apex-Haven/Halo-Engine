const mongoose = require('mongoose');

const securityAuditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      'login_attempt',
      'login_success',
      'login_failure',
      'logout',
      'password_change',
      'password_reset',
      'permission_denied',
      'sensitive_data_accessed',
      'brute_force_attack',
      'rate_limit_exceeded',
      'suspicious_activity',
      'api_access',
      'data_modification',
      'account_locked',
      'account_unlocked'
    ],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  username: {
    type: String,
    default: null,
    index: true
  },
  userRole: {
    type: String,
    enum: [
      'SUPER_ADMIN',
      'ADMIN',
      'OPERATIONS_MANAGER',
      'VENDOR_MANAGER',
      'DRIVER',
      'CUSTOMER'
    ],
    default: null
  },
  ipAddress: {
    type: String,
    required: true,
    index: true
  },
  userAgent: {
    type: String,
    default: null
  },
  resourceType: {
    type: String,
    default: null
  },
  resourceId: {
    type: String,
    default: null
  },
  action: {
    type: String,
    default: null
  },
  status: {
    type: String,
    required: true,
    enum: ['success', 'failure', 'blocked', 'warning'],
    index: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'securityauditlogs'
});

// Indexes for efficient querying
securityAuditLogSchema.index({ userId: 1, timestamp: -1 });
securityAuditLogSchema.index({ eventType: 1, timestamp: -1 });
securityAuditLogSchema.index({ ipAddress: 1, timestamp: -1 });
securityAuditLogSchema.index({ severity: 1, timestamp: -1 });
securityAuditLogSchema.index({ status: 1, timestamp: -1 });

// Compound index for common queries
securityAuditLogSchema.index({ userId: 1, eventType: 1, timestamp: -1 });
securityAuditLogSchema.index({ ipAddress: 1, eventType: 1, timestamp: -1 });

/**
 * Static method to create a log entry
 */
securityAuditLogSchema.statics.createLog = async function(logData) {
  try {
    const log = new this(logData);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error creating security audit log:', error);
    throw error;
  }
};

/**
 * Static method to get logs by user
 */
securityAuditLogSchema.statics.getLogsByUser = async function(userId, limit = 100) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to get logs by IP
 */
securityAuditLogSchema.statics.getLogsByIP = async function(ipAddress, limit = 100) {
  return this.find({ ipAddress })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to get logs by event type
 */
securityAuditLogSchema.statics.getLogsByEventType = async function(eventType, limit = 100) {
  return this.find({ eventType })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to get high severity logs
 */
securityAuditLogSchema.statics.getHighSeverityLogs = async function(limit = 100) {
  return this.find({ 
    severity: { $in: ['high', 'critical'] } 
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Static method to get recent failed login attempts
 */
securityAuditLogSchema.statics.getRecentFailedLogins = async function(ipAddress, minutes = 15) {
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  return this.find({
    eventType: 'login_failure',
    ipAddress,
    timestamp: { $gte: cutoffTime }
  })
    .sort({ timestamp: -1 })
    .lean();
};

/**
 * Static method to clean old logs (for maintenance)
 */
securityAuditLogSchema.statics.cleanOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const result = await this.deleteMany({
    timestamp: { $lt: cutoffDate },
    severity: { $ne: 'critical' } // Keep critical logs longer
  });
  return result;
};

const SecurityAuditLog = mongoose.model('SecurityAuditLog', securityAuditLogSchema);

module.exports = SecurityAuditLog;

