const express = require('express');
const router = express.Router();
const FlightIntegrationService = require('../services/flightIntegrationService');
const { MockTransferService } = require('../services/mockTransferService');
const { authenticate, authorize } = require('../middleware/auth');

// Initialize flight integration service
const flightIntegrationService = new FlightIntegrationService();

// Start flight integration service
router.post('/start', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    await flightIntegrationService.start();
    res.json({
      success: true,
      message: 'Flight integration service started successfully'
    });
  } catch (error) {
    console.error('Start flight integration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start flight integration service',
      error: error.message
    });
  }
});

// Stop flight integration service
router.post('/stop', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    flightIntegrationService.stop();
    res.json({
      success: true,
      message: 'Flight integration service stopped successfully'
    });
  } catch (error) {
    console.error('Stop flight integration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop flight integration service',
      error: error.message
    });
  }
});

// Get flight integration status
router.get('/status', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const status = {
      isRunning: flightIntegrationService.isRunning,
      updateInterval: flightIntegrationService.updateInterval,
      lastUpdate: new Date(),
      apiKey: flightIntegrationService.apiKey ? 'configured' : 'not configured'
    };
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get flight integration status',
      error: error.message
    });
  }
});

// Update all flights manually
router.post('/update-flights', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    await flightIntegrationService.updateAllFlights();
    res.json({
      success: true,
      message: 'Flight updates completed successfully'
    });
  } catch (error) {
    console.error('Update flights error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update flights',
      error: error.message
    });
  }
});

// Update specific flight
router.post('/update-flight/:flightNumber', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { flightNumber } = req.params;
    const TransferModel = MockTransferService.getTransferModel();
    
    const transfers = await TransferModel.find({ 'flight_details.flight_no': flightNumber.toUpperCase() });
    
    if (transfers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No transfers found for this flight'
      });
    }
    
    for (const transfer of transfers) {
      await flightIntegrationService.updateFlightForTransfer(transfer);
    }
    
    res.json({
      success: true,
      message: `Updated ${transfers.length} transfers for flight ${flightNumber}`,
      transfers: transfers.length
    });
  } catch (error) {
    console.error('Update specific flight error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update specific flight',
      error: error.message
    });
  }
});

// Create transfer from flight booking
router.post('/create-transfer', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const { flightData, customerId, vendorId } = req.body;
    
    if (!flightData || !customerId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Flight data, customer ID, and vendor ID are required'
      });
    }
    
    const transfer = await flightIntegrationService.createTransferFromFlight(flightData, customerId, vendorId);
    
    res.status(201).json({
      success: true,
      message: 'Transfer created successfully from flight booking',
      transfer
    });
  } catch (error) {
    console.error('Create transfer from flight error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transfer from flight',
      error: error.message
    });
  }
});

// Get transfer statistics
router.get('/statistics', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const statistics = await flightIntegrationService.getTransferStatistics();
    
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transfer statistics',
      error: error.message
    });
  }
});

// Get active transfers
router.get('/active-transfers', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER']), async (req, res) => {
  try {
    const TransferModel = MockTransferService.getTransferModel();
    const activeTransfers = await TransferModel.findActiveTransfers();
    
    res.json({
      success: true,
      transfers: activeTransfers,
      count: activeTransfers.length
    });
  } catch (error) {
    console.error('Get active transfers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active transfers',
      error: error.message
    });
  }
});

// Get transfers requiring location update
router.get('/location-updates', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']), async (req, res) => {
  try {
    const TransferModel = MockTransferService.getTransferModel();
    const transfers = await TransferModel.findRequiringLocationUpdate();
    
    res.json({
      success: true,
      transfers: transfers.map(transfer => ({
        _id: transfer._id,
        flight_no: transfer.flight_details.flight_no,
        transfer_status: transfer.transfer_details.transfer_status,
        last_location: transfer.location_tracking.last_location,
        driver_details: transfer.assigned_driver_details
      })),
      count: transfers.length
    });
  } catch (error) {
    console.error('Get location updates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transfers requiring location updates',
      error: error.message
    });
  }
});

// Update transfer location
router.post('/update-location/:transferId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'DRIVER']), async (req, res) => {
  try {
    const { transferId } = req.params;
    const { latitude, longitude, address, speed, heading } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const TransferModel = MockTransferService.getTransferModel();
    const transfer = await TransferModel.findById(transferId);
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }
    
    await transfer.updateLocation(latitude, longitude, address, speed, heading);
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      transfer: {
        _id: transfer._id,
        last_location: transfer.location_tracking.last_location
      }
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
});

// Get flight tracking data for a specific flight
router.get('/flight/:flightNumber', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'CUSTOMER']), async (req, res) => {
  try {
    const { flightNumber } = req.params;
    
    const flightData = await flightIntegrationService.getFlightData(flightNumber);
    
    if (!flightData) {
      return res.status(404).json({
        success: false,
        message: 'Flight data not found'
      });
    }
    
    res.json({
      success: true,
      flightData
    });
  } catch (error) {
    console.error('Get flight data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get flight data',
      error: error.message
    });
  }
});

// Get transfers by customer
router.get('/customer/:customerId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER']), async (req, res) => {
  try {
    const { customerId } = req.params;
    const TransferModel = MockTransferService.getTransferModel();
    
    const transfers = await TransferModel.find({ customer_id: customerId });
    
    res.json({
      success: true,
      transfers,
      count: transfers.length
    });
  } catch (error) {
    console.error('Get customer transfers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get customer transfers',
      error: error.message
    });
  }
});

// Get transfers by vendor
router.get('/vendor/:vendorId', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER']), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const TransferModel = MockTransferService.getTransferModel();
    
    const transfers = await TransferModel.find({ vendor_id: vendorId });
    
    res.json({
      success: true,
      transfers,
      count: transfers.length
    });
  } catch (error) {
    console.error('Get vendor transfers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vendor transfers',
      error: error.message
    });
  }
});

// Update transfer status
router.patch('/transfer/:transferId/status', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'DRIVER']), async (req, res) => {
  try {
    const { transferId } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const TransferModel = MockTransferService.getTransferModel();
    const transfer = await TransferModel.findById(transferId);
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }
    
    await transfer.updateStatus(status, req.user.username, notes);
    
    res.json({
      success: true,
      message: 'Transfer status updated successfully',
      transfer: {
        _id: transfer._id,
        transfer_status: transfer.transfer_details.transfer_status,
        status_history: transfer.status_history
      }
    });
  } catch (error) {
    console.error('Update transfer status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transfer status',
      error: error.message
    });
  }
});

module.exports = router;
