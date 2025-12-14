const aiService = require('../services/aiService');
const Transfer = require('../models/Transfer');
const { MockTransfer } = require('../services/mockDataService');

// Check if we're using mock data
const isUsingMockData = () => {
  return !process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/halo';
};

// Get the appropriate Transfer model
const getTransferModel = () => {
  if (isUsingMockData()) {
    return MockTransfer;
  }
  return Transfer;
};

/**
 * Predict delay for a specific transfer
 */
const predictTransferDelay = async (req, res) => {
  try {
    const { transferId } = req.params;
    const TransferModel = getTransferModel();
    
    // Find the transfer
    const transfer = await TransferModel.findById(transferId);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }

    // Get AI prediction
    const prediction = await aiService.predictFlightDelay(transfer.flight_details);

    // Store prediction in transfer (optional - for tracking accuracy later)
    if (!isUsingMockData()) {
      transfer.ai_prediction = {
        delayProbability: prediction.prediction.delayProbability,
        estimatedDelayMinutes: prediction.prediction.estimatedDelayMinutes,
        riskLevel: prediction.prediction.riskLevel,
        predictedAt: new Date()
      };
      await transfer.save();
    }

    res.json({
      success: true,
      transferId,
      flightNumber: transfer.flight_details.flight_no,
      ...prediction
    });

  } catch (error) {
    console.error('Error predicting transfer delay:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to predict delay',
      error: error.message
    });
  }
};

/**
 * Get delay predictions for all active transfers
 */
const predictAllActiveDelays = async (req, res) => {
  try {
    const TransferModel = getTransferModel();
    
    // Get all active transfers (flights that haven't landed yet)
    const activeTransfers = await TransferModel.find({
      'flight_details.status': { $in: ['on_time', 'delayed', 'boarding', 'departed'] },
      'flight_details.arrival_time': { $gte: new Date() }
    }).limit(50);

    if (activeTransfers.length === 0) {
      return res.json({
        success: true,
        message: 'No active transfers to analyze',
        predictions: [],
        summary: {
          total: 0,
          analyzed: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0
        }
      });
    }

    // Get predictions for all flights
    const flightDetails = activeTransfers.map(t => ({
      ...t.flight_details,
      transferId: t._id
    }));

    const batchResults = await aiService.batchPredictDelays(flightDetails);

    // Enhance results with transfer IDs
    const enhancedPredictions = batchResults.predictions.map((pred, index) => ({
      ...pred,
      transferId: activeTransfers[index]._id,
      customerName: activeTransfers[index].customer_details.name,
      vendor: activeTransfers[index].vendor_details.vendor_name
    }));

    res.json({
      success: true,
      ...batchResults,
      predictions: enhancedPredictions
    });

  } catch (error) {
    console.error('Error predicting all delays:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to predict delays',
      error: error.message
    });
  }
};

/**
 * Get high-risk flights dashboard
 */
const getHighRiskFlights = async (req, res) => {
  try {
    const TransferModel = getTransferModel();
    
    // Get active transfers
    const activeTransfers = await TransferModel.find({
      'flight_details.status': { $in: ['on_time', 'delayed', 'boarding', 'departed'] },
      'flight_details.arrival_time': { $gte: new Date() }
    }).limit(100);

    // Get predictions
    const flightDetails = activeTransfers.map(t => t.flight_details);
    const batchResults = await aiService.batchPredictDelays(flightDetails);

    // Filter high-risk flights
    const highRiskFlights = batchResults.predictions
      .map((pred, index) => ({
        transfer: activeTransfers[index],
        prediction: pred.prediction
      }))
      .filter(item => item.prediction?.riskLevel === 'high')
      .sort((a, b) => b.prediction.delayProbability - a.prediction.delayProbability);

    res.json({
      success: true,
      totalAnalyzed: activeTransfers.length,
      highRiskCount: highRiskFlights.length,
      flights: highRiskFlights.map(item => ({
        transferId: item.transfer._id,
        flightNumber: item.transfer.flight_details.flight_no,
        airline: item.transfer.flight_details.airline,
        customerName: item.transfer.customer_details.name,
        vendor: item.transfer.vendor_details.vendor_name,
        arrivalTime: item.transfer.flight_details.arrival_time,
        currentStatus: item.transfer.flight_details.status,
        prediction: item.prediction
      }))
    });

  } catch (error) {
    console.error('Error getting high-risk flights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get high-risk flights',
      error: error.message
    });
  }
};

/**
 * Get AI analytics dashboard data
 */
const getAIDashboard = async (req, res) => {
  try {
    const TransferModel = getTransferModel();
    
    // Get stats for different time windows
    const now = new Date();
    const next6Hours = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    const next24Hours = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    // Get transfers by time window
    const next6HTransfers = await TransferModel.find({
      'flight_details.arrival_time': { $gte: now, $lte: next6Hours },
      'flight_details.status': { $in: ['on_time', 'delayed', 'boarding', 'departed'] }
    });

    const next24HTransfers = await TransferModel.find({
      'flight_details.arrival_time': { $gte: now, $lte: next24Hours },
      'flight_details.status': { $in: ['on_time', 'delayed', 'boarding', 'departed'] }
    });

    // Get predictions for 6-hour window
    let predictions6h = { predictions: [], summary: {} };
    if (next6HTransfers.length > 0) {
      const flights6h = next6HTransfers.map(t => t.flight_details);
      predictions6h = await aiService.batchPredictDelays(flights6h);
    }

    // Get predictions for 24-hour window
    let predictions24h = { predictions: [], summary: {} };
    if (next24HTransfers.length > 0) {
      const flights24h = next24HTransfers.map(t => t.flight_details);
      predictions24h = await aiService.batchPredictDelays(flights24h);
    }

    res.json({
      success: true,
      dashboard: {
        overview: {
          totalFlightsNext6h: next6HTransfers.length,
          totalFlightsNext24h: next24HTransfers.length,
          highRiskNext6h: predictions6h.summary.highRisk || 0,
          highRiskNext24h: predictions24h.summary.highRisk || 0,
          mediumRiskNext6h: predictions6h.summary.mediumRisk || 0,
          mediumRiskNext24h: predictions24h.summary.mediumRisk || 0,
          avgDelayProbability6h: predictions6h.summary.averageDelayProbability || 0,
          avgDelayProbability24h: predictions24h.summary.averageDelayProbability || 0
        },
        next6Hours: {
          transfers: next6HTransfers.length,
          predictions: predictions6h.summary,
          requiresAttention: predictions6h.summary.requiresAttention || 0
        },
        next24Hours: {
          transfers: next24HTransfers.length,
          predictions: predictions24h.summary,
          requiresAttention: predictions24h.summary.requiresAttention || 0
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error generating AI dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI dashboard',
      error: error.message
    });
  }
};

/**
 * Record actual delay for ML training
 */
const recordActualDelay = async (req, res) => {
  try {
    const { transferId } = req.params;
    const { actualDelayMinutes } = req.body;
    
    const TransferModel = getTransferModel();
    const transfer = await TransferModel.findById(transferId);
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: 'Transfer not found'
      });
    }

    // If we had a prediction, use it for training
    if (transfer.ai_prediction) {
      const trainResult = await aiService.trainFromActual(
        transfer.flight_details.flight_no,
        transfer.ai_prediction.estimatedDelayMinutes,
        actualDelayMinutes
      );

      return res.json({
        success: true,
        message: 'Actual delay recorded for ML training',
        training: trainResult
      });
    }

    res.json({
      success: true,
      message: 'No prediction available for training'
    });

  } catch (error) {
    console.error('Error recording actual delay:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record actual delay',
      error: error.message
    });
  }
};

module.exports = {
  predictTransferDelay,
  predictAllActiveDelays,
  getHighRiskFlights,
  getAIDashboard,
  recordActualDelay
};

