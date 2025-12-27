const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'created',
      'updated',
      'driver_assigned',
      'driver_updated',
      'status_changed',
      'notification_sent',
      'flight_updated',
      'cancelled',
      'completed'
    ]
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  by: {
    type: String,
    required: true
  },
  details: {
    type: String,
    default: ''
  }
}, { _id: false });

const customerDetailsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  contact_number: {
    type: String,
    required: true,
    match: /^\+[1-9]\d{1,14}$/ // E.164 format
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  no_of_passengers: {
    type: Number,
    required: true,
    min: 1,
    max: 20
  },
  luggage_count: {
    type: Number,
    required: true,
    min: 0,
    max: 50
  }
}, { _id: false });

const flightDetailsSchema = new mongoose.Schema({
  flight_no: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 10
  },
  airline: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  departure_airport: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 3
  },
  arrival_airport: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 3
  },
  departure_time: {
    type: Date,
    required: true
  },
  arrival_time: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['on_time', 'delayed', 'landed', 'cancelled', 'boarding', 'departed'],
    default: 'on_time'
  },
  delay_minutes: {
    type: Number,
    default: 0,
    min: 0
  },
  gate: {
    type: String,
    trim: true,
    maxlength: 10
  },
  terminal: {
    type: String,
    trim: true,
    maxlength: 10
  }
}, { _id: false });

const transferDetailsSchema = new mongoose.Schema({
  pickup_location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  drop_location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  event_place: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  estimated_pickup_time: {
    type: Date,
    required: true
  },
  actual_pickup_time: {
    type: Date,
    default: null
  },
  estimated_drop_time: {
    type: Date,
    default: null
  },
  actual_drop_time: {
    type: Date,
    default: null
  },
  special_notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  transfer_status: {
    type: String,
    enum: ['pending', 'assigned', 'enroute', 'waiting', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  }
}, { _id: false });

const vendorDetailsSchema = new mongoose.Schema({
  vendor_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20
  },
  vendor_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  contact_person: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  contact_number: {
    type: String,
    required: true,
    match: /^\+[1-9]\d{1,14}$/
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
}, { _id: false });

const assignedDriverDetailsSchema = new mongoose.Schema({
  driver_id: {
    type: String,
    trim: true,
    maxlength: 20
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  contact_number: {
    type: String,
    match: /^\+[1-9]\d{1,14}$/
  },
  vehicle_type: {
    type: String,
    trim: true,
    maxlength: 50
  },
  vehicle_number: {
    type: String,
    trim: true,
    maxlength: 20
  },
  status: {
    type: String,
    enum: ['assigned', 'enroute', 'waiting', 'completed', 'cancelled'],
    default: 'assigned'
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  assigned_at: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const notificationsSchema = new mongoose.Schema({
  last_notification_sent: {
    type: Date,
    default: null
  },
  next_scheduled_notification: {
    type: Date,
    default: null
  },
  notification_preferences: {
    day: {
      type: String,
      enum: ['30_min_before', '15_min_before', 'on_arrival'],
      default: '30_min_before'
    },
    night: {
      type: [String],
      enum: ['60_min_before', '30_min_before', '15_min_before', 'on_arrival'],
      default: ['60_min_before', '30_min_before']
    }
  },
  notification_history: [{
    type: {
      type: String,
      enum: ['whatsapp', 'sms', 'email', 'push'],
      required: true
    },
    sent_at: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed'],
      default: 'sent'
    },
    message: String,
    recipient: String
  }]
}, { _id: false });

const transferSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    match: /^APX\d{6}$/ // APX followed by 6 digits
  },
  customer_details: {
    type: customerDetailsSchema,
    required: true
  },
  flight_details: {
    type: flightDetailsSchema,
    required: true
  },
  transfer_details: {
    type: transferDetailsSchema,
    required: true
  },
  vendor_details: {
    type: vendorDetailsSchema,
    required: true
  },
  assigned_driver_details: {
    type: assignedDriverDetailsSchema,
    default: null
  },
  notifications: {
    type: notificationsSchema,
    default: () => ({})
  },
  audit_log: {
    type: [auditLogSchema],
    default: []
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'vip'],
    default: 'normal'
  },
  internal_notes: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: {
    createdAt: 'create_time',
    updatedAt: 'update_time'
  },
  collection: 'transfers'
});

// Indexes for performance
// Note: _id is automatically indexed by MongoDB, cannot override it
transferSchema.index({ 'flight_details.flight_no': 1 });
transferSchema.index({ 'vendor_details.vendor_id': 1 });
transferSchema.index({ 'assigned_driver_details.driver_id': 1 });
transferSchema.index({ 'flight_details.arrival_time': 1 });
transferSchema.index({ 'transfer_details.transfer_status': 1 });
transferSchema.index({ 'flight_details.status': 1 });
transferSchema.index({ 'notifications.next_scheduled_notification': 1 });
transferSchema.index({ 'customer_details.email': 1 });
transferSchema.index({ 'customer_details.contact_number': 1 });

// Compound indexes for common queries
transferSchema.index({ 'flight_details.arrival_time': 1, 'flight_details.status': 1 });
transferSchema.index({ 'vendor_details.vendor_id': 1, 'transfer_details.transfer_status': 1 });

// Virtual for calculating time until arrival
transferSchema.virtual('time_until_arrival').get(function() {
  if (!this.flight_details.arrival_time) return null;
  const now = new Date();
  const arrival = new Date(this.flight_details.arrival_time);
  return Math.max(0, arrival - now);
});

// Virtual for determining if it's night time (for notification preferences)
transferSchema.virtual('is_night_time').get(function() {
  const hour = new Date().getHours();
  return hour >= 22 || hour <= 6; // 10 PM to 6 AM
});

// Pre-save middleware to add audit log entry
transferSchema.pre('save', function(next) {
  if (this.isNew) {
    this.audit_log.push({
      action: 'created',
      timestamp: new Date(),
      by: 'system',
      details: 'Transfer record created'
    });
  } else if (this.isModified()) {
    const modifiedFields = Object.keys(this.getChanges().$set || {});
    this.audit_log.push({
      action: 'updated',
      timestamp: new Date(),
      by: 'system',
      details: `Fields updated: ${modifiedFields.join(', ')}`
    });
  }
  next();
});

// Instance methods
transferSchema.methods.addAuditLog = function(action, by, details = '') {
  this.audit_log.push({
    action,
    timestamp: new Date(),
    by,
    details
  });
  return this.save();
};

transferSchema.methods.updateFlightStatus = function(status, delayMinutes = 0) {
  this.flight_details.status = status;
  if (delayMinutes > 0) {
    this.flight_details.delay_minutes = delayMinutes;
    // Adjust arrival time based on delay
    const originalArrival = new Date(this.flight_details.arrival_time);
    this.flight_details.arrival_time = new Date(originalArrival.getTime() + (delayMinutes * 60000));
  }
  this.addAuditLog('flight_updated', 'system', `Status changed to ${status}${delayMinutes ? ` with ${delayMinutes} min delay` : ''}`);
  return this.save();
};

transferSchema.methods.assignDriver = function(driverDetails, assignedBy) {
  this.assigned_driver_details = {
    ...driverDetails,
    assigned_at: new Date()
  };
  this.transfer_details.transfer_status = 'assigned';
  this.addAuditLog('driver_assigned', assignedBy, `Driver ${driverDetails.name} (${driverDetails.driver_id}) assigned`);
  return this.save();
};

transferSchema.methods.updateDriverStatus = function(status, updatedBy) {
  if (this.assigned_driver_details) {
    this.assigned_driver_details.status = status;
    this.addAuditLog('driver_updated', updatedBy, `Driver status changed to ${status}`);
  }
  return this.save();
};

transferSchema.methods.addNotificationRecord = function(type, message, recipient, status = 'sent') {
  this.notifications.notification_history.push({
    type,
    sent_at: new Date(),
    status,
    message,
    recipient
  });
  this.notifications.last_notification_sent = new Date();
  return this.save();
};

// Static methods
transferSchema.statics.findByFlightNumber = function(flightNo) {
  return this.find({ 'flight_details.flight_no': flightNo.toUpperCase() });
};

transferSchema.statics.findByVendor = function(vendorId) {
  return this.find({ 'vendor_details.vendor_id': vendorId });
};

transferSchema.statics.findByDriver = function(driverId) {
  return this.find({ 'assigned_driver_details.driver_id': driverId });
};

transferSchema.statics.findUpcomingTransfers = function(hours = 24) {
  const futureTime = new Date(Date.now() + (hours * 60 * 60 * 1000));
  return this.find({
    'flight_details.arrival_time': { $lte: futureTime },
    'transfer_details.transfer_status': { $in: ['pending', 'assigned', 'enroute'] }
  });
};

transferSchema.statics.findRequiringNotification = function() {
  const now = new Date();
  return this.find({
    'notifications.next_scheduled_notification': { $lte: now },
    'flight_details.status': { $in: ['on_time', 'delayed'] },
    'transfer_details.transfer_status': { $in: ['pending', 'assigned', 'enroute'] }
  });
};

// Ensure virtual fields are included in JSON output
transferSchema.set('toJSON', { virtuals: true });
transferSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Transfer', transferSchema);
