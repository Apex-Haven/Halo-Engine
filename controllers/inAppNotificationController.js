const InAppNotification = require('../models/InAppNotification');
const mongoose = require('mongoose');

/**
 * GET /api/in-app-notifications
 * List notifications for current user (newest first, unread first).
 */
const list = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = parseInt(req.query.skip, 10) || 0;
    const unreadOnly = req.query.unread === 'true';

    const query = { user_id: userId };
    if (unreadOnly) query.read = false;

    const notifications = await InAppNotification.find(query)
      .sort({ read: 1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await InAppNotification.countDocuments(query);
    const unreadCount = await InAppNotification.countDocuments({ user_id: userId, read: false });

    res.json({
      success: true,
      data: {
        notifications,
        total,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error listing in-app notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

/**
 * GET /api/in-app-notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await InAppNotification.countDocuments({ user_id: userId, read: false });
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

/**
 * PATCH /api/in-app-notifications/:id/read
 * Mark a notification as read. Id is the notification's _id.
 */
const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }

    const notification = await InAppNotification.findOneAndUpdate(
      { _id: id, user_id: userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification',
      error: error.message
    });
  }
};

/**
 * PATCH /api/in-app-notifications/read-all
 * Mark all notifications for current user as read.
 */
const markAllRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await InAppNotification.updateMany(
      { user_id: userId, read: false },
      { $set: { read: true } }
    );
    res.json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error marking all read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notifications',
      error: error.message
    });
  }
};

module.exports = {
  list,
  getUnreadCount,
  markRead,
  markAllRead
};
