const express = require('express');
const router = express.Router();

// Import controllers
const {
  createTransfer,
  getTransfer,
  getTransfers,
  updateTransfer,
  updateFlightDetails,
  assignVendor,
  assignDriver,
  assignReturnDriver,
  updateDriverStatus,
  confirmTravelerPickup,
  deleteTransfer,
  getTransferStats,
  updateClientDetails,
  assignTraveler,
  syncTransfersFromRegistrationSheet
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
  authorizeResource 
} = require('../middleware/auth');

/**
 * @route   POST /api/transfers/sync-from-registration-sheet
 * @desc    Sync transfers from event registration Google Sheet
 * @access  Private (Client for self, Admin/Operations for specified customer)
 */
router.post(
  '/sync-from-registration-sheet',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CLIENT'),
  syncTransfersFromRegistrationSheet
);

/**
 * @route   POST /api/transfers
 * @desc    Create new transfer (Client: no vendor; Admin: optional vendor)
 * @access  Private (Client, Admin, Operations Manager)
 */
router.post('/', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CLIENT'), validateTransfer, createTransfer);

/**
 * @route   GET /api/transfers
 * @desc    Get all transfers with filtering and pagination
 * @access  Private (Role-based access)
 */
router.get('/', authenticate, validateQueryParams, getTransfers);

/**
 * @route   GET /api/transfers/stats
 * @desc    Get transfer statistics (admin: all; client: own only)
 * @access  Private (Admin, Operations Manager, Vendor Manager, Client)
 */
router.get('/stats', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'CLIENT'), getTransferStats);

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
 * @route   PUT /api/transfers/:id/vendor
 * @desc    Assign vendor to transfer (admin only; makes transfer visible to vendor)
 * @access  Private (Super Admin, Admin, Operations Manager)
 */
router.put('/:id/vendor', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'), assignVendor);

/**
 * @route   PUT /api/transfers/:id/driver
 * @desc    Assign or update driver for transfer
 * @access  Private (Admin, Operations Manager, Vendor Manager, Vendor)
 */
router.put('/:id/driver', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'VENDOR'), authorizeResource('transfer'), validateDriverAssignment, assignDriver);

/**
 * @route   PUT /api/transfers/:id/return-driver
 * @desc    Assign driver for return leg (round-trip only; onward must be completed first)
 * @access  Private (Admin, Operations Manager, Vendor Manager, Vendor)
 */
router.put('/:id/return-driver', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'VENDOR'), authorizeResource('transfer'), validateDriverAssignment, assignReturnDriver);

/**
 * @route   PUT /api/transfers/:id/driver/status
 * @desc    Update driver/transfer status (Admin and Vendor only - driver cannot self-update)
 * @access  Private (Vendor Manager, Admin, Vendor)
 */
router.put('/:id/driver/status', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'VENDOR'), authorizeResource('transfer'), validateDriverStatusUpdate, updateDriverStatus);

/**
 * @route   PUT /api/transfers/:id/driver/confirm
 * @desc    Confirm traveler pickup or drop-off
 * @access  Private (Vendor, Vendor Manager, Admin)
 */
router.put('/:id/driver/confirm', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'VENDOR'), authorizeResource('transfer'), validateDriverConfirmAction, confirmTravelerPickup);

/**
 * @route   PUT /api/transfers/:id/flight-details
 * @desc    Update flight details only (partial update, no full transfer validation)
 * @access  Private (Admin, Operations Manager, Client for own transfer)
 */
router.put('/:id/flight-details', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CLIENT'), authorizeResource('transfer'), updateFlightDetails);

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
 * @desc    Delete transfer (Admin/Operations: any; Client: own only)
 * @access  Private (Super Admin, Admin, Operations Manager, Client for own)
 */
router.delete('/:id', authenticate, validateApexId, authorize('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CLIENT'), authorizeResource('transfer'), deleteTransfer);

module.exports = router;
