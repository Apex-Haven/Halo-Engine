const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { list, getUnreadCount, markRead, markAllRead } = require('../controllers/inAppNotificationController');

router.use(authenticate);

router.get('/', list);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
