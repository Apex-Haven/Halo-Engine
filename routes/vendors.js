const express = require('express');
const router = express.Router();

// Import controllers
const {
  getVendorTransfers,
  getVendorDashboard,
  assignDriverToVendorTransfer,
  updateVendorDriverStatus,
  getVendorPerformance
} = require('../controllers/vendorController');

// Import validation middleware
const {
  validateDriverAssignment,
  validateDriverStatusUpdate,
  validateQueryParams,
  validateVendorId,
  validateApexId
} = require('../middleware/validation');

/**
 * @route   GET /api/vendors/:vendorId/transfers
 * @desc    Get transfers for a specific vendor
 * @access  Public (should be protected in production)
 */
router.get('/:vendorId/transfers', validateVendorId, validateQueryParams, getVendorTransfers);

/**
 * @route   GET /api/vendors/:vendorId/dashboard
 * @desc    Get vendor dashboard data
 * @access  Public (should be protected in production)
 */
router.get('/:vendorId/dashboard', validateVendorId, getVendorDashboard);

/**
 * @route   GET /api/vendors/:vendorId/performance
 * @desc    Get vendor performance metrics
 * @access  Public (should be protected in production)
 */
router.get('/:vendorId/performance', validateVendorId, validateQueryParams, getVendorPerformance);

/**
 * @route   PUT /api/vendors/:vendorId/transfers/:transferId/driver
 * @desc    Assign driver to vendor transfer
 * @access  Public (should be protected in production)
 */
router.put('/:vendorId/transfers/:transferId/driver', 
  validateVendorId, 
  validateApexId, 
  validateDriverAssignment, 
  assignDriverToVendorTransfer
);

/**
 * @route   PUT /api/vendors/:vendorId/transfers/:transferId/driver/status
 * @desc    Update driver status for vendor transfer
 * @access  Public (should be protected in production)
 */
router.put('/:vendorId/transfers/:transferId/driver/status', 
  validateVendorId, 
  validateApexId, 
  validateDriverStatusUpdate, 
  updateVendorDriverStatus
);

module.exports = router;
