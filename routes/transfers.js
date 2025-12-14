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
  confirmTravelerPickup,
  deleteTransfer,
  getTransferStats,
  updateClientDetails,
  assignTraveler
} = require('../controllers/transferController');

// Import validation middleware
const {
  validateTransfer,
  validateDriverAssignment,
  validateDriverStatusUpdate,
  validateDriverConfirmAction,
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
 * @access  Private (Admin, Operations Manager, Vendor Manager, Vendor)
 */
router.put('/:id/driver', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'VENDOR'), authorizeResource('transfer'), validateDriverAssignment, assignDriver);

/**
 * @route   PUT /api/transfers/:id/driver/status
 * @desc    Update driver status
 * @access  Private (Driver, Vendor Manager, Admin)
 */
router.put('/:id/driver/status', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'DRIVER'), authorizeResource('transfer'), validateDriverStatusUpdate, updateDriverStatus);

/**
 * @route   PUT /api/transfers/:id/driver/confirm
 * @desc    Confirm traveler pickup or drop-off
 * @access  Private (Vendor, Vendor Manager, Admin)
 */
router.put('/:id/driver/confirm', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'VENDOR'), authorizeResource('transfer'), validateDriverConfirmAction, confirmTravelerPickup);

/**
 * @route   PUT /api/transfers/:id/client-details
 * @desc    Update client details (flight info, passengers, luggage, notes)
 * @access  Private (Client, Admin)
 */
router.put('/:id/client-details', authenticate, validateApexId, updateClientDetails);

/**
 * @route   PUT /api/transfers/:id/traveler
 * @desc    Assign traveler to transfer
 * @access  Private (Client, Admin)
 */
router.put('/:id/traveler', authenticate, validateApexId, assignTraveler);

/**
 * @route   DELETE /api/transfers/:id
 * @desc    Delete transfer
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN'), authorizeResource('transfer'), deleteTransfer);

module.exports = router;
