const bcrypt = require('bcryptjs');

// Mock Transfer class for demo mode
class MockTransfer {
  constructor(data) {
    this._id = data._id || this.generateTransferId();
    this.customer_id = data.customer_id;
    this.customer_details = data.customer_details || {};
    this.flight_details = data.flight_details || {};
    this.transfer_details = data.transfer_details || {};
    this.vendor_id = data.vendor_id;
    this.vendor_details = data.vendor_details || {};
    this.assigned_driver_details = data.assigned_driver_details || null;
    this.notifications = data.notifications || {};
    this.audit_log = data.audit_log || [];
    this.priority = data.priority || 'normal';
    this.internal_notes = data.internal_notes || '';
    this.ai_prediction = data.ai_prediction || {};
    this.booking_source = data.booking_source || 'manual';
    this.booking_reference = data.booking_reference || '';
    this.payment_status = data.payment_status || 'pending';
    this.payment_method = data.payment_method || 'credit_card';
    this.total_cost = data.total_cost || 0;
    this.currency = data.currency || 'USD';
    this.status_history = data.status_history || [];
    this.location_tracking = data.location_tracking || { enabled: true, last_location: null, route_history: [] };
    this.sla = data.sla || { pickup_window: 15, max_waiting_time: 30, response_time: 5 };
    this.create_time = data.create_time || new Date();
    this.update_time = data.update_time || new Date();
  }

  generateTransferId() {
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    return `APX${randomNum}`;
  }

  async save() {
    MockTransferService.transfers.set(this._id, this);
    return this;
  }

  async addAuditLog(action, by, details = '') {
    this.audit_log.push({
      action,
      timestamp: new Date(),
      by,
      details
    });
    this.update_time = new Date();
    await this.save();
    return this;
  }

  async updateFlightStatus(status, delayMinutes = 0) {
    this.flight_details.status = status;
    if (delayMinutes > 0) {
      this.flight_details.delay_minutes = delayMinutes;
      const originalArrival = new Date(this.flight_details.arrival_time);
      this.flight_details.arrival_time = new Date(originalArrival.getTime() + (delayMinutes * 60000));
    }
    await this.addAuditLog('flight_updated', 'system', `Status changed to ${status}${delayMinutes ? ` with ${delayMinutes} min delay` : ''}`);
    return this;
  }

  async assignDriver(driverDetails, assignedBy) {
    this.assigned_driver_details = {
      ...driverDetails,
      assigned_at: new Date()
    };
    this.transfer_details.transfer_status = 'assigned';
    await this.addAuditLog('driver_assigned', assignedBy, `Driver ${driverDetails.name} (${driverDetails.driver_id}) assigned`);
    return this;
  }

  async updateDriverStatus(status, updatedBy) {
    if (this.assigned_driver_details) {
      this.assigned_driver_details.status = status;
      await this.addAuditLog('driver_updated', updatedBy, `Driver status changed to ${status}`);
    }
    return this;
  }

  async addNotificationRecord(type, message, recipient, status = 'sent') {
    if (!this.notifications.notification_history) {
      this.notifications.notification_history = [];
    }
    this.notifications.notification_history.push({
      type,
      sent_at: new Date(),
      status,
      message,
      recipient
    });
    this.notifications.last_notification_sent = new Date();
    this.update_time = new Date();
    await this.save();
    return this;
  }

  async updateFlightTracking(flightData, source = 'manual') {
    if (!this.flight_details.flight_tracking) {
      this.flight_details.flight_tracking = {};
    }
    
    this.flight_details.flight_tracking.last_checked = new Date();
    this.flight_details.flight_tracking.tracking_source = source;
    
    if (flightData.real_time_status) {
      this.flight_details.flight_tracking.real_time_status = flightData.real_time_status;
    }
    if (flightData.actual_departure_time) {
      this.flight_details.flight_tracking.actual_departure_time = flightData.actual_departure_time;
    }
    if (flightData.actual_arrival_time) {
      this.flight_details.flight_tracking.actual_arrival_time = flightData.actual_arrival_time;
    }
    if (flightData.aircraft_type) {
      this.flight_details.flight_tracking.aircraft_type = flightData.aircraft_type;
    }
    if (flightData.aircraft_registration) {
      this.flight_details.flight_tracking.aircraft_registration = flightData.aircraft_registration;
    }
    if (flightData.route_distance) {
      this.flight_details.flight_tracking.route_distance = flightData.route_distance;
    }
    if (flightData.flight_duration) {
      this.flight_details.flight_tracking.flight_duration = flightData.flight_duration;
    }
    if (flightData.weather_conditions) {
      this.flight_details.flight_tracking.weather_conditions = flightData.weather_conditions;
    }
    
    await this.addAuditLog('flight_updated', 'system', `Flight tracking updated from ${source}`);
    return this;
  }

  async updateStatus(newStatus, updatedBy, notes = '') {
    const oldStatus = this.transfer_details.transfer_status;
    this.transfer_details.transfer_status = newStatus;
    
    this.status_history.push({
      status: newStatus,
      timestamp: new Date(),
      updated_by: updatedBy,
      notes: notes
    });
    
    await this.addAuditLog('status_changed', updatedBy, `Status changed from ${oldStatus} to ${newStatus}`);
    return this;
  }

  async updateLocation(latitude, longitude, address, speed = null, heading = null) {
    this.location_tracking.last_location = {
      latitude,
      longitude,
      address,
      timestamp: new Date()
    };
    
    this.location_tracking.route_history.push({
      latitude,
      longitude,
      timestamp: new Date(),
      speed: speed || 0,
      heading: heading || 0
    });
    
    if (this.location_tracking.route_history.length > 100) {
      this.location_tracking.route_history = this.location_tracking.route_history.slice(-100);
    }
    
    this.update_time = new Date();
    await this.save();
    return this;
  }

  async updatePaymentStatus(status, updatedBy) {
    this.payment_status = status;
    await this.addAuditLog('payment_updated', updatedBy, `Payment status changed to ${status}`);
    return this;
  }

  async calculateCost() {
    let cost = this.vendor_details.base_rate || 0;
    
    if (this.flight_details.flight_tracking?.route_distance && this.vendor_details.per_km_rate) {
      cost += (this.flight_details.flight_tracking.route_distance * this.vendor_details.per_km_rate);
    }
    
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 6) {
      cost += (this.vendor_details.night_surcharge || 0);
    }
    
    this.total_cost = cost;
    this.update_time = new Date();
    await this.save();
    return this;
  }

  static findById(id) {
    const transfer = MockTransferService.transfers.get(id);
    return transfer || null;
  }

  static find(query = {}) {
    // Return a query builder object that supports method chaining
    return new MockTransferQuery(query);
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    const transfer = MockTransferService.transfers.get(id);
    if (!transfer) return null;

    Object.assign(transfer, updateData);
    transfer.update_time = new Date();

    MockTransferService.transfers.set(id, transfer);
    return transfer;
  }

  static async findByIdAndDelete(id) {
    return MockTransferService.transfers.delete(id);
  }

  static async countDocuments(query = {}) {
    let count = 0;
    for (const transfer of MockTransferService.transfers.values()) {
      let matches = true;
      
      if (query.customer_id && transfer.customer_id !== query.customer_id) matches = false;
      if (query.vendor_id && transfer.vendor_id !== query.vendor_id) matches = false;
      if (query['transfer_details.transfer_status'] && transfer.transfer_details.transfer_status !== query['transfer_details.transfer_status']) matches = false;
      if (query.payment_status && transfer.payment_status !== query.payment_status) matches = false;
      
      if (matches) count++;
    }
    return count;
  }

  static async findRequiringFlightUpdate() {
    const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000));
    const results = [];
    
    for (const transfer of MockTransferService.transfers.values()) {
      if (transfer.flight_details.flight_tracking?.enabled &&
          transfer.flight_details.flight_tracking.last_checked <= fiveMinutesAgo &&
          ['scheduled', 'boarding', 'departed', 'in-flight'].includes(transfer.flight_details.flight_tracking.real_time_status) &&
          ['pending', 'assigned', 'enroute', 'waiting'].includes(transfer.transfer_details.transfer_status)) {
        results.push(transfer);
      }
    }
    return results;
  }

  static async findActiveTransfers() {
    const results = [];
    for (const transfer of MockTransferService.transfers.values()) {
      if (['assigned', 'enroute', 'waiting', 'in_progress'].includes(transfer.transfer_details.transfer_status)) {
        results.push(transfer);
      }
    }
    return results;
  }

  static async findRequiringLocationUpdate() {
    const tenMinutesAgo = new Date(Date.now() - (10 * 60 * 1000));
    const results = [];
    
    for (const transfer of MockTransferService.transfers.values()) {
      if (transfer.location_tracking?.enabled &&
          ['assigned', 'enroute', 'waiting', 'in_progress'].includes(transfer.transfer_details.transfer_status) &&
          (!transfer.location_tracking.last_location?.timestamp || transfer.location_tracking.last_location.timestamp <= tenMinutesAgo)) {
        results.push(transfer);
      }
    }
    return results;
  }
}

class MockTransferService {
  static transfers = new Map();

  static async initializeMockTransfers() {
    // Create some default transfers for demo
    const defaultTransfers = [
      {
        _id: 'APX123456',
        customer_id: 'mock_customer_user_001',
        customer_details: {
          name: 'John Doe',
          contact_number: '+1234567890',
          email: 'john@example.com',
          no_of_passengers: 2,
          luggage_count: 3
        },
        flight_details: {
          flight_no: 'BA123',
          airline: 'British Airways',
          departure_airport: 'LHR',
          arrival_airport: 'JFK',
          departure_time: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          arrival_time: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour from now
          status: 'on_time',
          gate: 'A12',
          terminal: '5',
          flight_tracking: {
            enabled: true,
            last_checked: new Date(),
            tracking_source: 'aviationstack',
            real_time_status: 'in-flight',
            actual_departure_time: new Date(Date.now() - 2 * 60 * 60 * 1000),
            actual_arrival_time: null,
            aircraft_type: 'Boeing 777',
            aircraft_registration: 'G-YMMM',
            route_distance: 3450,
            flight_duration: 480,
            weather_conditions: {
              departure: 'Clear',
              arrival: 'Partly Cloudy'
            }
          }
        },
        transfer_details: {
          pickup_location: 'JFK Terminal 4 - Arrivals',
          drop_location: 'Manhattan Hotel',
          event_place: 'Airport Transfer',
          estimated_pickup_time: new Date(Date.now() + 1 * 60 * 60 * 1000),
          estimated_drop_time: new Date(Date.now() + 1.5 * 60 * 60 * 1000),
          transfer_status: 'enroute'
        },
        vendor_id: 'mock_vendor_001',
        vendor_details: {
          vendor_id: 'VEN123456',
          vendor_name: 'Elite Airport Transfers',
          contact_person: 'Michael Johnson',
          contact_number: '+1234567890',
          email: 'michael@elitetransfers.com',
          base_rate: 50,
          per_km_rate: 2.5,
          night_surcharge: 10
        },
        assigned_driver_details: {
          driver_id: 'DRV001',
          name: 'Robert Smith',
          contact_number: '+1234567891',
          vehicle_type: 'Luxury Sedan',
          vehicle_number: 'ABC-123',
          status: 'enroute',
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
            address: 'Manhattan, NY'
          },
          assigned_at: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
        },
        booking_source: 'api',
        booking_reference: 'FLT-BA123-001',
        payment_status: 'paid',
        payment_method: 'credit_card',
        total_cost: 75,
        currency: 'USD',
        priority: 'normal',
        location_tracking: {
          enabled: true,
          last_location: {
            latitude: 40.7128,
            longitude: -74.0060,
            address: 'Manhattan, NY',
            timestamp: new Date()
          },
          route_history: [
            {
              latitude: 40.7589,
              longitude: -73.9851,
              timestamp: new Date(Date.now() - 20 * 60 * 1000),
              speed: 45,
              heading: 180
            },
            {
              latitude: 40.7128,
              longitude: -74.0060,
              timestamp: new Date(),
              speed: 0,
              heading: 0
            }
          ]
        }
      },
      {
        _id: 'APX789012',
        customer_id: 'mock_customer_user_002',
        customer_details: {
          name: 'Jane Smith',
          contact_number: '+1234567892',
          email: 'jane@example.com',
          no_of_passengers: 1,
          luggage_count: 2
        },
        flight_details: {
          flight_no: 'QF104',
          airline: 'Qantas',
          departure_airport: 'SYD',
          arrival_airport: 'LAX',
          departure_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
          arrival_time: new Date(Date.now() + 14 * 60 * 60 * 1000), // 14 hours from now
          status: 'on_time',
          gate: 'B8',
          terminal: '1',
          flight_tracking: {
            enabled: true,
            last_checked: new Date(),
            tracking_source: 'aviationstack',
            real_time_status: 'scheduled',
            actual_departure_time: null,
            actual_arrival_time: null,
            aircraft_type: 'Airbus A380',
            aircraft_registration: 'VH-OQA',
            route_distance: 7485,
            flight_duration: 840,
            weather_conditions: {
              departure: 'Sunny',
              arrival: 'Clear'
            }
          }
        },
        transfer_details: {
          pickup_location: 'LAX Terminal 1 - Arrivals',
          drop_location: 'Beverly Hills Hotel',
          event_place: 'Airport Transfer',
          estimated_pickup_time: new Date(Date.now() + 14 * 60 * 60 * 1000),
          estimated_drop_time: new Date(Date.now() + 14.5 * 60 * 60 * 1000),
          transfer_status: 'pending'
        },
        vendor_id: 'mock_vendor_002',
        vendor_details: {
          vendor_id: 'VEN789012',
          vendor_name: 'City Express Services',
          contact_person: 'Sarah Williams',
          contact_number: '+1234567891',
          email: 'sarah@cityexpress.com',
          base_rate: 45,
          per_km_rate: 2.0,
          night_surcharge: 8
        },
        booking_source: 'website',
        booking_reference: 'FLT-QF104-002',
        payment_status: 'pending',
        payment_method: 'credit_card',
        total_cost: 60,
        currency: 'USD',
        priority: 'normal',
        location_tracking: {
          enabled: true,
          last_location: null,
          route_history: []
        }
      }
    ];

    for (const transferData of defaultTransfers) {
      const transfer = new MockTransfer(transferData);
      await transfer.save();
    }

    console.log(`✅ Initialized ${defaultTransfers.length} mock transfers`);
  }

  static isUsingMockData() {
    return !process.env.MONGODB_URI || process.env.MONGODB_URI === '';
  }

  static getTransferModel() {
    return MockTransferService.isUsingMockData() ? MockTransfer : require('../models/Transfer');
  }
}

module.exports = { MockTransfer, MockTransferService };
