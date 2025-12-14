const express = require('express');
const router = express.Router();
const {
  predictTransferDelay,
  predictAllActiveDelays,
  getHighRiskFlights,
  getAIDashboard,
  recordActualDelay
} = require('../controllers/aiController');

// Import authentication middleware
const { optionalAuth } = require('../middleware/auth');

// Use optional auth for demo mode compatibility
// In production, change to 'authenticate' for required authentication

/**
 * @route   GET /api/ai/predict/:transferId
 * @desc    Get delay prediction for a specific transfer
 * @access  Public (with optional auth)
 */
router.get('/predict/:transferId', optionalAuth, predictTransferDelay);

/**
 * @route   GET /api/ai/predict-all
 * @desc    Get delay predictions for all active transfers
 * @access  Public (with optional auth)
 */
router.get('/predict-all', optionalAuth, predictAllActiveDelays);

/**
 * @route   GET /api/ai/high-risk
 * @desc    Get list of high-risk flights
 * @access  Public (with optional auth)
 */
router.get('/high-risk', optionalAuth, getHighRiskFlights);

/**
 * @route   GET /api/ai/dashboard
 * @desc    Get AI analytics dashboard data
 * @access  Public (with optional auth)
 */
router.get('/dashboard', optionalAuth, getAIDashboard);

/**
 * @route   POST /api/ai/train/:transferId
 * @desc    Record actual delay for ML training
 * @access  Public (with optional auth)
 */
router.post('/train/:transferId', optionalAuth, recordActualDelay);

module.exports = router;

