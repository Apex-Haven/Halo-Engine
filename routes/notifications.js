const express = require('express');
const router = express.Router();

// Import controllers
const {
  sendManualNotification,
  sendPickupReminder,
  sendDriverDispatchReminder,
  getNotificationHistory,
  updateNotificationPreferences,
  sendBulkNotifications,
  getNotificationStats
} = require('../controllers/notificationController');

// Import validation middleware
const {
  validateNotification,
  validateApexId,
  validateQueryParams
} = require('../middleware/validation');

/**
 * @route   POST /api/notifications/:id/send
 * @desc    Send manual notification to transfer customer
 * @access  Public (should be protected in production)
 */
router.post('/:id/send', validateApexId, validateNotification, sendManualNotification);

/**
 * @route   POST /api/notifications/:id/pickup-reminder
 * @desc    Send pickup reminder to transfer customer
 * @access  Public (should be protected in production)
 */
router.post('/:id/pickup-reminder', validateApexId, sendPickupReminder);

/**
 * @route   POST /api/notifications/:id/driver-dispatch-reminder
 * @desc    Send driver dispatch reminder to vendor
 * @access  Public (should be protected in production)
 */
router.post('/:id/driver-dispatch-reminder', validateApexId, sendDriverDispatchReminder);

/**
 * @route   GET /api/notifications/:id/history
 * @desc    Get notification history for a transfer
 * @access  Public (should be protected in production)
 */
router.get('/:id/history', validateApexId, getNotificationHistory);

/**
 * @route   PUT /api/notifications/:id/preferences
 * @desc    Update notification preferences for a transfer
 * @access  Public (should be protected in production)
 */
router.put('/:id/preferences', validateApexId, updateNotificationPreferences);

/**
 * @route   POST /api/notifications/bulk/send
 * @desc    Send bulk notifications to multiple transfers
 * @access  Public (should be protected in production)
 */
router.post('/bulk/send', sendBulkNotifications);

/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics
 * @access  Public (should be protected in production)
 */
router.get('/stats', validateQueryParams, getNotificationStats);

module.exports = router;
