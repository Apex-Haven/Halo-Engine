const express = require('express');
const router = express.Router();

// Import controllers
const {
  createTransfer,
  getTransfer,
  getTransfers,
  updateTransfer,
  assignDriver,
  updateDriverStatus,
  deleteTransfer,
  getTransferStats
} = require('../controllers/transferController');

// Import validation middleware
const {
  validateTransfer,
  validateDriverAssignment,
  validateDriverStatusUpdate,
  validateQueryParams,
  validateApexId
} = require('../middleware/validation');

// Import authentication middleware
const { 
  authenticate, 
  authorize, 
  requirePermission, 
  authorizeResource 
} = require('../middleware/auth');

/**
 * @route   POST /api/transfers
 * @desc    Create new transfer
 * @access  Private (Admin, Operations Manager)
 */
router.post('/', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'), validateTransfer, createTransfer);

/**
 * @route   GET /api/transfers
 * @desc    Get all transfers with filtering and pagination
 * @access  Private (Role-based access)
 */
router.get('/', authenticate, validateQueryParams, getTransfers);

/**
 * @route   GET /api/transfers/stats
 * @desc    Get transfer statistics
 * @access  Private (Admin, Operations Manager, Vendor Manager)
 */
router.get('/stats', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER'), getTransferStats);

/**
 * @route   GET /api/transfers/:id
 * @desc    Get transfer by Apex ID
 * @access  Private (Resource-based access)
 */
router.get('/:id', authenticate, validateApexId, authorizeResource('transfer'), getTransfer);

/**
 * @route   PUT /api/transfers/:id
 * @desc    Update transfer
 * @access  Private (Admin, Operations Manager, Vendor Manager)
 */
router.put('/:id', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER'), authorizeResource('transfer'), validateTransfer, updateTransfer);

/**
 * @route   PUT /api/transfers/:id/driver
 * @desc    Assign or update driver for transfer
 * @access  Private (Admin, Operations Manager, Vendor Manager)
 */
router.put('/:id/driver', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER'), authorizeResource('transfer'), validateDriverAssignment, assignDriver);

/**
 * @route   PUT /api/transfers/:id/driver/status
 * @desc    Update driver status
 * @access  Private (Driver, Vendor Manager, Admin)
 */
router.put('/:id/driver/status', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'DRIVER'), authorizeResource('transfer'), validateDriverStatusUpdate, updateDriverStatus);

/**
 * @route   DELETE /api/transfers/:id
 * @desc    Delete transfer
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN'), authorizeResource('transfer'), deleteTransfer);

module.exports = router;
