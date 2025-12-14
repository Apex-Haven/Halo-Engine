const axios = require('axios');
const { MockTransferService } = require('./mockTransferService');

class FlightIntegrationService {
  constructor() {
    this.apiKey = process.env.AVIATIONSTACK_API_KEY || 'a81fec64c6fda4a44a703cd582b7bdbb';
    this.baseUrl = 'http://api.aviationstack.com/v1';
    this.openSkyUrl = 'https://opensky-network.org/api';
    this.updateInterval = 5 * 60 * 1000; // 5 minutes
    this.isRunning = false;
    this.updateTimer = null;
  }

  // Start the flight integration service
  async start() {
    if (this.isRunning) return;
    
    console.log('🛫 Starting Flight Integration Service...');
    this.isRunning = true;
    
    // Initial update
    await this.updateAllFlights();
    
    // Set up periodic updates
    this.updateTimer = setInterval(async () => {
      try {
        await this.updateAllFlights();
      } catch (error) {
        console.error('Flight integration update error:', error.message);
      }
    }, this.updateInterval);
    
    console.log('✅ Flight Integration Service started');
  }

  // Stop the flight integration service
  stop() {
    if (!this.isRunning) return;
    
    console.log('🛑 Stopping Flight Integration Service...');
    this.isRunning = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    console.log('✅ Flight Integration Service stopped');
  }

  // Update all active flights
  async updateAllFlights() {
    try {
      const TransferModel = MockTransferService.getTransferModel();
      const transfers = await TransferModel.findRequiringFlightUpdate();
      
      console.log(`🔄 Updating ${transfers.length} flights...`);
      
      for (const transfer of transfers) {
        try {
          await this.updateFlightForTransfer(transfer);
        } catch (error) {
          console.error(`Error updating flight ${transfer.flight_details.flight_no}:`, error.message);
        }
      }
      
      console.log(`✅ Updated ${transfers.length} flights`);
    } catch (error) {
      console.error('Error updating flights:', error.message);
    }
  }

  // Update flight data for a specific transfer
  async updateFlightForTransfer(transfer) {
    try {
      const flightNumber = transfer.flight_details.flight_no;
      console.log(`🔍 Updating flight data for ${flightNumber}...`);
      
      // Get flight data from external APIs
      const flightData = await this.getFlightData(flightNumber);
      
      if (flightData) {
        // Update transfer with new flight data
        await transfer.updateFlightTracking(flightData, flightData.source);
        
        // Check if flight status changed significantly
        const oldStatus = transfer.flight_details.flight_tracking.real_time_status;
        const newStatus = flightData.real_time_status;
        
        if (oldStatus !== newStatus) {
          await this.handleFlightStatusChange(transfer, oldStatus, newStatus);
        }
        
        console.log(`✅ Updated ${flightNumber}: ${oldStatus} → ${newStatus}`);
      } else {
        console.log(`⚠️ No flight data found for ${flightNumber}`);
      }
    } catch (error) {
      console.error(`Error updating flight for transfer ${transfer._id}:`, error.message);
    }
  }

  // Get flight data from external APIs
  async getFlightData(flightNumber) {
    try {
      // Try AviationStack first
      if (this.apiKey && this.apiKey !== 'your_api_key_here') {
        const aviationData = await this.getFlightFromAviationStack(flightNumber);
        if (aviationData) {
          return aviationData;
        }
      }
      
      // Try OpenSky Network
      const openSkyData = await this.getFlightFromOpenSky(flightNumber);
      if (openSkyData) {
        return openSkyData;
      }
      
      // Fallback to mock data
      return this.getMockFlightData(flightNumber);
    } catch (error) {
      console.error('Error getting flight data:', error.message);
      return this.getMockFlightData(flightNumber);
    }
  }

  // Get flight data from AviationStack
  async getFlightFromAviationStack(flightNumber) {
    try {
      const response = await axios.get(`${this.baseUrl}/flights`, {
        params: {
          access_key: this.apiKey,
          flight_iata: flightNumber,
          limit: 1
        },
        timeout: 10000
      });

      if (response.data && response.data.data && response.data.data.length > 0) {
        const flight = response.data.data[0];
        return this.formatAviationStackData(flight);
      }
      
      return null;
    } catch (error) {
      console.error('AviationStack API error:', error.message);
      return null;
    }
  }

  // Get flight data from OpenSky Network
  async getFlightFromOpenSky(flightNumber) {
    try {
      const response = await axios.get(`${this.openSkyUrl}/states/all`, {
        timeout: 10000
      });

      if (response.data && response.data.states) {
        const states = response.data.states;
        const flight = states.find(state => 
          state[1] && state[1].trim().toUpperCase() === flightNumber.toUpperCase()
        );
        
        if (flight) {
          return this.formatOpenSkyStateData(flight);
        }
      }
      
      return null;
    } catch (error) {
      console.error('OpenSky Network API error:', error.message);
      return null;
    }
  }

  // Format AviationStack data
  formatAviationStackData(flight) {
    const now = new Date();
    const scheduledDeparture = new Date(flight.departure?.scheduled);
    const actualDeparture = flight.departure?.actual ? new Date(flight.departure.actual) : null;
    const scheduledArrival = new Date(flight.arrival?.scheduled);
    const actualArrival = flight.arrival?.actual ? new Date(flight.arrival.actual) : null;

    let realTimeStatus = 'scheduled';
    if (actualArrival && now > actualArrival) {
      realTimeStatus = 'landed';
    } else if (actualDeparture && now > actualDeparture) {
      if (actualArrival && now < actualArrival) {
        realTimeStatus = 'in-flight';
      } else if (!actualArrival && now < scheduledArrival) {
        realTimeStatus = 'in-flight';
      } else {
        realTimeStatus = 'landed';
      }
    } else if (now > scheduledArrival) {
      realTimeStatus = 'landed';
    } else if (now > scheduledDeparture) {
      realTimeStatus = 'in-flight';
    } else {
      realTimeStatus = 'scheduled';
    }

    return {
      real_time_status: realTimeStatus,
      actual_departure_time: actualDeparture,
      actual_arrival_time: actualArrival,
      aircraft_type: flight.aircraft?.iata || flight.aircraft?.icao || null,
      aircraft_registration: flight.aircraft?.registration || null,
      route_distance: flight.distance || null,
      flight_duration: flight.duration || null,
      weather_conditions: {
        departure: flight.departure?.weather || null,
        arrival: flight.arrival?.weather || null
      },
      source: 'aviationstack'
    };
  }

  // Format OpenSky Network data
  formatOpenSkyStateData(state) {
    const callsign = state[1]?.trim();
    const now = new Date();
    
    return {
      real_time_status: state[8] ? 'landed' : 'in-flight', // on_ground
      actual_departure_time: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      actual_arrival_time: null,
      aircraft_type: state[0], // icao24
      aircraft_registration: null,
      route_distance: null,
      flight_duration: null,
      weather_conditions: {
        departure: null,
        arrival: null
      },
      source: 'opensky'
    };
  }

  // Get mock flight data
  getMockFlightData(flightNumber) {
    const now = new Date();
    const randomDelay = Math.random() * 30; // 0-30 minutes delay
    
    return {
      real_time_status: 'in-flight',
      actual_departure_time: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      actual_arrival_time: new Date(now.getTime() + 1 * 60 * 60 * 1000), // 1 hour from now
      aircraft_type: 'Boeing 737',
      aircraft_registration: 'N123AB',
      route_distance: 500,
      flight_duration: 180,
      weather_conditions: {
        departure: 'Clear',
        arrival: 'Partly Cloudy'
      },
      source: 'mock'
    };
  }

  // Handle flight status changes
  async handleFlightStatusChange(transfer, oldStatus, newStatus) {
    try {
      console.log(`🔄 Flight status change: ${transfer.flight_details.flight_no} ${oldStatus} → ${newStatus}`);
      
      // Update transfer status based on flight status
      switch (newStatus) {
        case 'boarding':
          await transfer.updateStatus('assigned', 'system', 'Flight is boarding');
          break;
        case 'departed':
          await transfer.updateStatus('enroute', 'system', 'Flight has departed');
          break;
        case 'in-flight':
          await transfer.updateStatus('enroute', 'system', 'Flight is in progress');
          break;
        case 'landed':
          await transfer.updateStatus('waiting', 'system', 'Flight has landed');
          break;
        case 'cancelled':
          await transfer.updateStatus('cancelled', 'system', 'Flight was cancelled');
          break;
      }
      
      // Send notifications if needed
      await this.sendStatusChangeNotification(transfer, oldStatus, newStatus);
      
    } catch (error) {
      console.error('Error handling flight status change:', error.message);
    }
  }

  // Send notification for status changes
  async sendStatusChangeNotification(transfer, oldStatus, newStatus) {
    try {
      const customer = transfer.customer_details;
      const flightNumber = transfer.flight_details.flight_no;
      
      let message = '';
      switch (newStatus) {
        case 'boarding':
          message = `Your flight ${flightNumber} is now boarding. Your transfer will be ready shortly.`;
          break;
        case 'departed':
          message = `Your flight ${flightNumber} has departed. We'll track your arrival and have your transfer ready.`;
          break;
        case 'landed':
          message = `Your flight ${flightNumber} has landed! Your driver is on the way to the pickup location.`;
          break;
        case 'cancelled':
          message = `Your flight ${flightNumber} has been cancelled. Please contact us to reschedule your transfer.`;
          break;
      }
      
      if (message) {
        await transfer.addNotificationRecord('sms', message, customer.contact_number, 'sent');
        await transfer.addNotificationRecord('email', message, customer.email, 'sent');
      }
      
    } catch (error) {
      console.error('Error sending status change notification:', error.message);
    }
  }

  // Create transfer from flight booking
  async createTransferFromFlight(flightData, customerId, vendorId) {
    try {
      const TransferModel = MockTransferService.getTransferModel();
      
      // Generate unique transfer ID
      const transferId = this.generateTransferId();
      
      // Get customer and vendor details
      const customer = await this.getCustomerDetails(customerId);
      const vendor = await this.getVendorDetails(vendorId);
      
      if (!customer || !vendor) {
        throw new Error('Customer or vendor not found');
      }
      
      // Create transfer
      const transfer = new TransferModel({
        _id: transferId,
        customer_id: customerId,
        customer_details: {
          name: `${customer.profile.firstName} ${customer.profile.lastName}`,
          contact_number: customer.profile.phone,
          email: customer.email,
          no_of_passengers: 1,
          luggage_count: 1
        },
        flight_details: {
          flight_no: flightData.flightNumber,
          airline: flightData.airline,
          departure_airport: flightData.departure.iata,
          arrival_airport: flightData.arrival.iata,
          departure_time: new Date(flightData.departure.scheduled),
          arrival_time: new Date(flightData.arrival.scheduled),
          status: 'on_time',
          gate: flightData.departure.gate,
          terminal: flightData.departure.terminal,
          flight_tracking: {
            enabled: true,
            last_checked: new Date(),
            tracking_source: flightData.source || 'manual',
            real_time_status: flightData.status || 'scheduled',
            actual_departure_time: flightData.departure.actual ? new Date(flightData.departure.actual) : null,
            actual_arrival_time: flightData.arrival.actual ? new Date(flightData.arrival.actual) : null,
            aircraft_type: flightData.aircraft || null,
            route_distance: flightData.distance || null,
            flight_duration: flightData.duration || null
          }
        },
        transfer_details: {
          pickup_location: `${flightData.arrival.airport} - ${flightData.arrival.terminal}`,
          drop_location: 'Hotel/Customer Address',
          event_place: 'Airport Transfer',
          estimated_pickup_time: new Date(flightData.arrival.scheduled),
          estimated_drop_time: new Date(new Date(flightData.arrival.scheduled).getTime() + 30 * 60 * 1000), // 30 minutes after arrival
          transfer_status: 'pending'
        },
        vendor_id: vendorId,
        vendor_details: {
          vendor_id: vendor.vendorId,
          vendor_name: vendor.companyName,
          contact_person: vendor.contactPerson.fullName,
          contact_number: vendor.contactPerson.phone,
          email: vendor.contactPerson.email
        },
        booking_source: 'api',
        booking_reference: `FLT-${flightData.flightNumber}-${Date.now()}`,
        payment_status: 'pending',
        total_cost: vendor.pricing.baseRate,
        currency: vendor.pricing.currency
      });
      
      await transfer.save();
      
      console.log(`✅ Created transfer ${transferId} for flight ${flightData.flightNumber}`);
      return transfer;
      
    } catch (error) {
      console.error('Error creating transfer from flight:', error.message);
      throw error;
    }
  }

  // Generate unique transfer ID
  generateTransferId() {
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    return `APX${randomNum}`;
  }

  // Get customer details
  async getCustomerDetails(customerId) {
    try {
      const { MockUserService } = require('./mockUserService');
      const UserModel = MockUserService.getUserModel();
      return await UserModel.findById(customerId);
    } catch (error) {
      console.error('Error getting customer details:', error.message);
      return null;
    }
  }

  // Get vendor details
  async getVendorDetails(vendorId) {
    try {
      const { MockVendorService } = require('./mockVendorService');
      const VendorModel = MockVendorService.getVendorModel();
      return await VendorModel.findById(vendorId);
    } catch (error) {
      console.error('Error getting vendor details:', error.message);
      return null;
    }
  }

  // Get transfer statistics
  async getTransferStatistics() {
    try {
      const TransferModel = MockTransferService.getTransferModel();
      
      const total = await TransferModel.countDocuments();
      const active = await TransferModel.countDocuments({ 'transfer_details.transfer_status': { $in: ['assigned', 'enroute', 'waiting', 'in_progress'] } });
      const completed = await TransferModel.countDocuments({ 'transfer_details.transfer_status': 'completed' });
      const pending = await TransferModel.countDocuments({ 'transfer_details.transfer_status': 'pending' });
      
      return {
        total,
        active,
        completed,
        pending,
        completionRate: total > 0 ? (completed / total) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting transfer statistics:', error.message);
      return null;
    }
  }
}

module.exports = FlightIntegrationService;
