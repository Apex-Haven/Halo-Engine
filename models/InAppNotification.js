const mongoose = require('mongoose');

const inAppNotificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'transfer_created',   // admin: new transfer created by client
      'vendor_assigned',    // client: vendor assigned to your transfer; vendor: you were assigned to a transfer
      'driver_assigned'     // client: driver assigned to your transfer
    ]
  },
  transfer_id: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  read: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'in_app_notifications'
});

inAppNotificationSchema.index({ user_id: 1, read: 1, created_at: -1 });

module.exports = mongoose.model('InAppNotification', inAppNotificationSchema);
