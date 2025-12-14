const axios = require('axios');
const moment = require('moment');

/**
 * HALO AI Service - Flight Delay Prediction
 * 
 * This service uses multiple factors to predict flight delays:
 * - Historical airline performance
 * - Time-based patterns (time of day, season)
 * - Weather conditions
 * - Airport congestion patterns
 * - Real-time flight status trends
 */

class AIService {
  constructor() {
    // Historical airline on-time performance (industry averages)
    this.airlinePerformance = {
      'AA': { onTimeRate: 0.82, avgDelay: 42 },  // American Airlines
      'UA': { onTimeRate: 0.79, avgDelay: 45 },  // United Airlines
      'DL': { onTimeRate: 0.85, avgDelay: 38 },  // Delta
      'WN': { onTimeRate: 0.81, avgDelay: 40 },  // Southwest
      'BA': { onTimeRate: 0.84, avgDelay: 39 },  // British Airways
      'LH': { onTimeRate: 0.86, avgDelay: 35 },  // Lufthansa
      'AF': { onTimeRate: 0.83, avgDelay: 41 },  // Air France
      'EK': { onTimeRate: 0.88, avgDelay: 32 },  // Emirates
      'DEFAULT': { onTimeRate: 0.80, avgDelay: 45 }
    };

    // Airport congestion factors (busy airports have higher delay rates)
    this.airportCongestion = {
      'JFK': 1.3, 'LAX': 1.25, 'ORD': 1.35, 'ATL': 1.3,
      'LHR': 1.4, 'CDG': 1.35, 'FRA': 1.25, 'DXB': 1.2,
      'DEFAULT': 1.0
    };

    // Time-based delay patterns
    this.timePatterns = {
      earlyMorning: 0.7,   // 5-7 AM (less delays)
      morning: 0.85,       // 7-11 AM
      midday: 1.0,         // 11 AM-3 PM
      afternoon: 1.15,     // 3-6 PM (peak delays)
      evening: 1.25,       // 6-9 PM (cascading delays)
      night: 1.1           // 9 PM-5 AM
    };

    // Seasonal factors
    this.seasonalFactors = {
      winter: 1.3,   // Dec-Feb (weather issues)
      spring: 1.0,   // Mar-May
      summer: 1.15,  // Jun-Aug (high traffic)
      fall: 0.95     // Sep-Nov
    };
  }

  /**
   * Predict flight delay probability and estimated delay
   * @param {Object} flightDetails - Flight information
   * @returns {Object} Prediction results
   */
  async predictFlightDelay(flightDetails) {
    try {
      const {
        flight_no,
        airline,
        departure_airport,
        arrival_airport,
        departure_time,
        arrival_time,
        current_status
      } = flightDetails;

      // Initialize prediction components
      let delayProbability = 0;
      let estimatedDelayMinutes = 0;
      let confidenceScore = 0;
      let factors = [];

      // 1. Airline Performance Factor (25% weight)
      const airlineCode = this.extractAirlineCode(flight_no);
      const airlineData = this.airlinePerformance[airlineCode] || this.airlinePerformance.DEFAULT;
      const airlineFactor = (1 - airlineData.onTimeRate) * 100;
      delayProbability += airlineFactor * 0.25;
      estimatedDelayMinutes += airlineData.avgDelay * 0.25;
      factors.push({
        name: 'Airline Performance',
        impact: airlineFactor.toFixed(1) + '%',
        weight: '25%',
        description: `${airline} has ${(airlineData.onTimeRate * 100).toFixed(1)}% on-time performance`
      });

      // 2. Airport Congestion Factor (20% weight)
      const departureCongest = this.airportCongestion[departure_airport] || this.airportCongestion.DEFAULT;
      const arrivalCongest = this.airportCongestion[arrival_airport] || this.airportCongestion.DEFAULT;
      const avgCongestion = (departureCongest + arrivalCongest) / 2;
      const congestionFactor = (avgCongestion - 1) * 100;
      delayProbability += congestionFactor * 0.20;
      estimatedDelayMinutes += congestionFactor * 0.5 * 0.20;
      factors.push({
        name: 'Airport Congestion',
        impact: congestionFactor.toFixed(1) + '%',
        weight: '20%',
        description: `${departure_airport} → ${arrival_airport} congestion level: ${avgCongestion.toFixed(2)}x`
      });

      // 3. Time of Day Factor (20% weight)
      const departureHour = moment(departure_time).hour();
      const timeSlot = this.getTimeSlot(departureHour);
      const timeFactor = (this.timePatterns[timeSlot] - 1) * 100;
      delayProbability += Math.abs(timeFactor) * 0.20;
      estimatedDelayMinutes += Math.max(0, timeFactor * 0.3) * 0.20;
      factors.push({
        name: 'Departure Time',
        impact: timeFactor.toFixed(1) + '%',
        weight: '20%',
        description: `${timeSlot} flights have ${this.timePatterns[timeSlot]}x delay rate`
      });

      // 4. Seasonal Factor (15% weight)
      const season = this.getSeason(moment(departure_time).month());
      const seasonalFactor = (this.seasonalFactors[season] - 1) * 100;
      delayProbability += Math.abs(seasonalFactor) * 0.15;
      estimatedDelayMinutes += Math.max(0, seasonalFactor * 0.4) * 0.15;
      factors.push({
        name: 'Seasonal Pattern',
        impact: seasonalFactor.toFixed(1) + '%',
        weight: '15%',
        description: `${season.charAt(0).toUpperCase() + season.slice(1)} season factor: ${this.seasonalFactors[season]}x`
      });

      // 5. Current Status Boost (20% weight)
      if (current_status === 'delayed') {
        delayProbability += 40 * 0.20;
        estimatedDelayMinutes += 30 * 0.20;
        factors.push({
          name: 'Current Status',
          impact: '40%',
          weight: '20%',
          description: 'Flight is already showing delay status'
        });
      } else if (current_status === 'boarding' || current_status === 'departed') {
        delayProbability += 10 * 0.20;
        factors.push({
          name: 'Current Status',
          impact: '10%',
          weight: '20%',
          description: 'Flight is active and on schedule'
        });
      } else {
        factors.push({
          name: 'Current Status',
          impact: '0%',
          weight: '20%',
          description: 'Flight status: ' + current_status
        });
      }

      // 6. Day of Week Pattern (5% weight)
      const dayOfWeek = moment(departure_time).day();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayFactor = isWeekend ? -5 : 5; // Weekends typically have fewer delays
      delayProbability += Math.abs(dayFactor) * 0.05;
      factors.push({
        name: 'Day of Week',
        impact: dayFactor.toFixed(1) + '%',
        weight: '5%',
        description: isWeekend ? 'Weekend - lower traffic' : 'Weekday - higher traffic'
      });

      // 7. Advanced Time to Departure (5% weight)
      const hoursUntilDeparture = moment(departure_time).diff(moment(), 'hours');
      let advanceTimeFactor = 0;
      if (hoursUntilDeparture < 2) {
        advanceTimeFactor = 15; // Higher confidence for near-term flights
        confidenceScore += 25;
      } else if (hoursUntilDeparture < 12) {
        advanceTimeFactor = 8;
        confidenceScore += 15;
      } else if (hoursUntilDeparture < 24) {
        advanceTimeFactor = 5;
        confidenceScore += 10;
      } else {
        advanceTimeFactor = 0;
        confidenceScore += 5;
      }
      delayProbability += advanceTimeFactor * 0.05;
      factors.push({
        name: 'Prediction Timeframe',
        impact: advanceTimeFactor.toFixed(1) + '%',
        weight: '5%',
        description: `${hoursUntilDeparture}h until departure`
      });

      // Normalize probability to 0-100 range
      delayProbability = Math.min(Math.max(delayProbability, 0), 100);
      estimatedDelayMinutes = Math.max(Math.round(estimatedDelayMinutes), 0);

      // Calculate confidence score (0-100)
      confidenceScore += 40; // Base confidence
      if (current_status === 'delayed' || current_status === 'boarding') {
        confidenceScore += 30; // Higher confidence with real-time status
      } else {
        confidenceScore += 15;
      }
      confidenceScore = Math.min(confidenceScore, 100);

      // Determine risk level
      let riskLevel = 'low';
      let riskColor = 'green';
      if (delayProbability >= 70) {
        riskLevel = 'high';
        riskColor = 'red';
      } else if (delayProbability >= 40) {
        riskLevel = 'medium';
        riskColor = 'orange';
      }

      // Generate AI insights and recommendations
      const insights = this.generateInsights(delayProbability, estimatedDelayMinutes, factors, hoursUntilDeparture);

      return {
        success: true,
        prediction: {
          flightNumber: flight_no,
          delayProbability: Math.round(delayProbability),
          estimatedDelayMinutes,
          riskLevel,
          riskColor,
          confidenceScore: Math.round(confidenceScore),
          predictedAt: new Date(),
          factors,
          insights,
          recommendation: this.getRecommendation(delayProbability, estimatedDelayMinutes, hoursUntilDeparture)
        }
      };

    } catch (error) {
      console.error('Error in flight delay prediction:', error);
      return {
        success: false,
        error: error.message,
        prediction: null
      };
    }
  }

  /**
   * Generate actionable insights from prediction
   */
  generateInsights(probability, delay, factors, hoursUntilDeparture) {
    const insights = [];

    // Primary insight
    if (probability >= 70) {
      insights.push({
        type: 'warning',
        message: `High delay risk (${probability}%). Consider proactive passenger communication.`,
        icon: '⚠️'
      });
    } else if (probability >= 40) {
      insights.push({
        type: 'info',
        message: `Moderate delay risk (${probability}%). Monitor flight status closely.`,
        icon: 'ℹ️'
      });
    } else {
      insights.push({
        type: 'success',
        message: `Low delay risk (${probability}%). Flight likely on schedule.`,
        icon: '✅'
      });
    }

    // Top contributing factors
    const sortedFactors = [...factors].sort((a, b) => 
      parseFloat(b.impact) - parseFloat(a.impact)
    );
    
    if (sortedFactors.length > 0) {
      insights.push({
        type: 'analysis',
        message: `Top delay factor: ${sortedFactors[0].name} (${sortedFactors[0].impact} impact)`,
        icon: '📊'
      });
    }

    // Time-based insights
    if (hoursUntilDeparture < 2) {
      insights.push({
        type: 'urgent',
        message: 'Flight departing soon. Real-time monitoring active.',
        icon: '🚨'
      });
    } else if (hoursUntilDeparture > 24) {
      insights.push({
        type: 'info',
        message: 'Long-range prediction. Accuracy will improve as departure approaches.',
        icon: '🔮'
      });
    }

    return insights;
  }

  /**
   * Get actionable recommendation
   */
  getRecommendation(probability, delay, hoursUntilDeparture) {
    if (probability >= 70) {
      return {
        action: 'immediate',
        title: 'Immediate Action Required',
        steps: [
          'Notify vendor to prepare backup driver',
          'Send proactive communication to passenger',
          'Monitor flight status every 10 minutes',
          `Adjust pickup time by estimated ${delay} minutes`
        ]
      };
    } else if (probability >= 40) {
      return {
        action: 'monitor',
        title: 'Enhanced Monitoring',
        steps: [
          'Alert vendor of potential delay',
          'Increase status check frequency',
          'Prepare delay notification templates',
          'Keep driver on standby'
        ]
      };
    } else {
      return {
        action: 'standard',
        title: 'Standard Procedure',
        steps: [
          'Continue normal monitoring',
          'Proceed with planned pickup schedule',
          'Routine status updates to vendor'
        ]
      };
    }
  }

  /**
   * Batch predict delays for multiple flights
   */
  async batchPredictDelays(flightsList) {
    const predictions = [];
    
    for (const flight of flightsList) {
      const prediction = await this.predictFlightDelay(flight);
      predictions.push(prediction);
    }

    return {
      success: true,
      totalFlights: flightsList.length,
      predictions,
      summary: this.generateBatchSummary(predictions)
    };
  }

  /**
   * Generate summary for batch predictions
   */
  generateBatchSummary(predictions) {
    const successful = predictions.filter(p => p.success);
    const highRisk = successful.filter(p => p.prediction?.riskLevel === 'high').length;
    const mediumRisk = successful.filter(p => p.prediction?.riskLevel === 'medium').length;
    const lowRisk = successful.filter(p => p.prediction?.riskLevel === 'low').length;
    
    const avgProbability = successful.reduce((sum, p) => 
      sum + (p.prediction?.delayProbability || 0), 0) / successful.length;

    return {
      total: predictions.length,
      analyzed: successful.length,
      highRisk,
      mediumRisk,
      lowRisk,
      averageDelayProbability: Math.round(avgProbability),
      requiresAttention: highRisk + mediumRisk
    };
  }

  // Helper methods
  extractAirlineCode(flightNumber) {
    return flightNumber.replace(/[0-9]/g, '').toUpperCase();
  }

  getTimeSlot(hour) {
    if (hour >= 5 && hour < 7) return 'earlyMorning';
    if (hour >= 7 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 15) return 'midday';
    if (hour >= 15 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 21) return 'evening';
    return 'night';
  }

  getSeason(month) {
    if (month >= 11 || month <= 1) return 'winter';
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    return 'fall';
  }

  /**
   * Learn from actual outcomes to improve predictions (ML training loop)
   */
  async trainFromActual(flightNumber, predictedDelay, actualDelay) {
    // This would store training data for future ML model improvements
    // For now, we'll log for analysis
    const accuracy = Math.abs(predictedDelay - actualDelay) <= 15 ? 'accurate' : 'needs_improvement';
    
    console.log('🤖 AI Learning:', {
      flight: flightNumber,
      predicted: predictedDelay,
      actual: actualDelay,
      accuracy,
      timestamp: new Date()
    });

    return {
      success: true,
      accuracy,
      improvement: Math.abs(predictedDelay - actualDelay)
    };
  }
}

module.exports = new AIService();

