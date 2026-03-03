const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');

/**
 * @route   POST /api/chat
 * @desc    Intent-based chat - transfer status lookup
 * @access  Public (no auth required, same as tracking)
 */
router.post('/', handleChat);

module.exports = router;
