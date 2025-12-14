// Mock data service for demo purposes when MongoDB is not available
// Generate dynamic dates relative to now
const now = new Date();
const in2Hours = new Date(now.getTime() + (2 * 60 * 60 * 1000));
const in4Hours = new Date(now.getTime() + (4 * 60 * 60 * 1000));
const in8Hours = new Date(now.getTime() + (8 * 60 * 60 * 1000));
const in12Hours = new Date(now.getTime() + (12 * 60 * 60 * 1000));
const in20Hours = new Date(now.getTime() + (20 * 60 * 60 * 1000));
const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));

const mockTransfers = [
  {
    _id: 'APX123456',
    customer_details: {
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      contact_number: '+1234567890',
      no_of_passengers: 2,
      luggage_count: 3
    },
    flight_details: {
      flight_no: 'AI202',
      airline: 'Air India',
      departure_airport: 'DXB',
      arrival_airport: 'BOM',
      departure_time: yesterday,
      arrival_time: in2Hours,
      status: 'on_time',
      delay_minutes: 0,
      gate: 'B12',
      terminal: 'T2'
    },
    transfer_details: {
      pickup_location: 'Mumbai Airport T2',
      drop_location: 'Grand Hyatt Hotel',
      event_place: 'Grand Hyatt Convention Center',
      transfer_status: 'assigned',
      estimated_pickup_time: new Date(in2Hours.getTime() + (30 * 60 * 1000)),
      actual_pickup_time: null,
      estimated_drop_time: new Date(in2Hours.getTime() + (90 * 60 * 1000)),
      actual_drop_time: null,
      special_notes: 'VIP guest, priority handling required'
    },
    vendor_details: {
      vendor_id: 'V001',
      vendor_name: 'Mumbai Transfers Ltd',
      contact_person: 'Raj Kumar',
      contact_number: '+919876543210',
      email: 'contact@mumbaitransfers.com'
    },
    assigned_driver_details: {
      driver_id: 'D001',
      name: 'John Doe',
      contact_number: '+919876543211',
      vehicle_type: 'Toyota Innova',
      vehicle_number: 'MH01AB1234',
      status: 'assigned',
      location: {
        latitude: 19.0896,
        longitude: 72.8656,
        address: 'Mumbai Airport Area'
      },
      assigned_at: now
    },
    notifications: {
      sent: [
        {
          type: 'whatsapp',
          message: 'Your driver John Doe in Toyota Innova (MH01AB1234) is assigned for your airport transfer.',
          sent_at: new Date('2024-01-15T13:00:00Z'),
          status: 'sent'
        }
      ],
      pending: []
    },
    audit_log: [
      {
        action: 'created',
        timestamp: new Date('2024-01-15T12:00:00Z'),
        user: 'system',
        details: 'Transfer created'
      },
      {
        action: 'driver_assigned',
        timestamp: new Date('2024-01-15T13:00:00Z'),
        user: 'admin',
        details: 'Driver John Doe assigned'
      },
      {
        action: 'completed',
        timestamp: new Date('2024-01-15T16:10:00Z'),
        user: 'driver',
        details: 'Transfer completed successfully'
      }
    ],
    created_at: new Date('2024-01-15T12:00:00Z'),
    updated_at: new Date('2024-01-15T16:10:00Z')
  },
  {
    _id: 'APX123457',
    customer_details: {
      name: 'Mike Johnson',
      email: 'mike.johnson@example.com',
      contact_number: '+1234567891',
      no_of_passengers: 1,
      luggage_count: 2
    },
    flight_details: {
      flight_no: 'EK501',
      airline: 'Emirates',
      departure_airport: 'DXB',
      arrival_airport: 'BOM',
      departure_time: new Date(in4Hours.getTime() - (4 * 60 * 60 * 1000)),
      arrival_time: in4Hours,
      status: 'delayed',
      delay_minutes: 45,
      gate: 'A5',
      terminal: 'T2'
    },
    transfer_details: {
      pickup_location: 'Mumbai Airport T2',
      drop_location: 'Taj Mahal Palace',
      event_place: 'Taj Business Center',
      transfer_status: 'assigned',
      estimated_pickup_time: new Date(in4Hours.getTime() + (45 * 60 * 1000)),
      actual_pickup_time: null,
      estimated_drop_time: new Date(in4Hours.getTime() + (105 * 60 * 1000)),
      actual_drop_time: null,
      special_notes: 'Flight delayed, driver notified'
    },
    vendor_details: {
      vendor_id: 'V002',
      vendor_name: 'Luxury Transfers Mumbai',
      contact_person: 'Priya Sharma',
      contact_number: '+919876543212',
      email: 'luxury@mumbaitransfers.com'
    },
    assigned_driver_details: {
      driver_id: 'D002',
      name: 'Sarah Wilson',
      contact_number: '+919876543213',
      vehicle_type: 'Mercedes E-Class',
      vehicle_number: 'MH02CD5678',
      status: 'enroute',
      location: {
        latitude: 19.0965,
        longitude: 72.8721,
        address: 'Approaching Mumbai Airport'
      },
      assigned_at: new Date(now.getTime() - (30 * 60 * 1000))
    },
    notifications: {
      sent: [
        {
          type: 'whatsapp',
          message: 'Your flight EK501 has been delayed by 45 minutes. We will adjust your pickup time accordingly.',
          sent_at: new Date('2024-01-15T15:30:00Z'),
          status: 'sent'
        }
      ],
      pending: []
    },
    audit_log: [
      {
        action: 'created',
        timestamp: new Date('2024-01-15T13:30:00Z'),
        user: 'system',
        details: 'Transfer created'
      },
      {
        action: 'driver_assigned',
        timestamp: new Date('2024-01-15T14:00:00Z'),
        user: 'admin',
        details: 'Driver Sarah Wilson assigned'
      },
      {
        action: 'flight_delayed',
        timestamp: new Date('2024-01-15T15:30:00Z'),
        user: 'system',
        details: 'Flight delayed by 45 minutes'
      }
    ],
    created_at: new Date('2024-01-15T13:30:00Z'),
    updated_at: new Date('2024-01-15T15:30:00Z')
  },
  {
    _id: 'APX123458',
    customer_details: {
      name: 'David Brown',
      email: 'david.brown@example.com',
      contact_number: '+1234567892',
      no_of_passengers: 3,
      luggage_count: 4
    },
    flight_details: {
      flight_no: 'BA123',
      airline: 'British Airways',
      departure_airport: 'LHR',
      arrival_airport: 'BOM',
      departure_time: new Date(in20Hours.getTime() - (8 * 60 * 60 * 1000)),
      arrival_time: in20Hours,
      status: 'on_time',
      delay_minutes: 0,
      gate: 'C7',
      terminal: 'T2'
    },
    transfer_details: {
      pickup_location: 'Mumbai Airport T2',
      drop_location: 'ITC Maratha',
      event_place: 'ITC Grand Central',
      transfer_status: 'pending',
      estimated_pickup_time: new Date(in20Hours.getTime() + (30 * 60 * 1000)),
      actual_pickup_time: null,
      estimated_drop_time: new Date(in20Hours.getTime() + (90 * 60 * 1000)),
      actual_drop_time: null,
      special_notes: 'Family with children, need larger vehicle'
    },
    vendor_details: {
      vendor_id: 'V001',
      vendor_name: 'Mumbai Transfers Ltd',
      contact_person: 'Raj Kumar',
      contact_number: '+919876543210',
      email: 'contact@mumbaitransfers.com'
    },
    assigned_driver_details: null,
    notifications: {
      sent: [
        {
          type: 'whatsapp',
          message: 'Your driver Raj Kumar in Toyota Innova (MH03EF9012) is assigned for your airport transfer.',
          sent_at: new Date('2024-01-15T17:00:00Z'),
          status: 'sent'
        }
      ],
      pending: []
    },
    audit_log: [
      {
        action: 'created',
        timestamp: new Date('2024-01-15T16:00:00Z'),
        user: 'system',
        details: 'Transfer created'
      },
      {
        action: 'driver_assigned',
        timestamp: new Date('2024-01-15T17:00:00Z'),
        user: 'admin',
        details: 'Driver Raj Kumar assigned'
      }
    ],
    created_at: new Date('2024-01-15T16:00:00Z'),
    updated_at: new Date('2024-01-15T17:00:00Z')
  }
];

let nextId = 123459;

// Mock Transfer model for demo purposes
class MockTransfer {
  constructor(data) {
    Object.assign(this, data);
  }

  static async find(query = {}) {
    let results = [...mockTransfers];
    
    // Simple query filtering
    if (query.status) {
      results = results.filter(t => t.transfer_details.status === query.status);
    }
    if (query.vendor_id) {
      results = results.filter(t => t.vendor_details.vendor_id === query.vendor_id);
    }
    if (query._id) {
      results = results.filter(t => t._id === query._id);
    }
    
    return results.map(t => new MockTransfer(t));
  }

  static async findById(id) {
    const transfer = mockTransfers.find(t => t._id === id);
    return transfer ? new MockTransfer(transfer) : null;
  }

  static async findOne(query) {
    const transfer = mockTransfers.find(t => {
      if (query._id) return t._id === query._id;
      if (query['customer_details.email']) return t.customer_details.email === query['customer_details.email'];
      return false;
    });
    return transfer ? new MockTransfer(transfer) : null;
  }

  async save() {
    if (!this._id) {
      this._id = `APX${nextId++}`;
      this.created_at = new Date();
      mockTransfers.push({...this});
    } else {
      this.updated_at = new Date();
      const index = mockTransfers.findIndex(t => t._id === this._id);
      if (index !== -1) {
        mockTransfers[index] = {...this};
      }
    }
    return this;
  }

  async deleteOne() {
    const index = mockTransfers.findIndex(t => t._id === this._id);
    if (index !== -1) {
      mockTransfers.splice(index, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  static async deleteOne(query) {
    const index = mockTransfers.findIndex(t => t._id === query._id);
    if (index !== -1) {
      mockTransfers.splice(index, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return { ...this };
  }
}

// Mock vendor data
const mockVendors = [
  {
    vendor_id: 'V001',
    vendor_name: 'Mumbai Transfers Ltd',
    contact_person: 'Raj Kumar',
    phone: '+919876543210',
    email: 'raj@mumbaitransfers.com',
    active_transfers: 2,
    total_transfers: 156
  },
  {
    vendor_id: 'V002',
    vendor_name: 'Luxury Transfers Mumbai',
    contact_person: 'Priya Sharma',
    phone: '+919876543212',
    email: 'priya@luxurytransfers.com',
    active_transfers: 1,
    total_transfers: 89
  }
];

// Mock flight data
const mockFlights = [
  {
    flight_number: 'AI202',
    airline: 'Air India',
    status: 'landed',
    arrival_time: new Date('2024-01-15T14:45:00Z'),
    terminal: 'T2'
  },
  {
    flight_number: 'EK501',
    airline: 'Emirates',
    status: 'delayed',
    arrival_time: new Date('2024-01-15T16:45:00Z'),
    terminal: 'T2',
    delay_minutes: 45
  },
  {
    flight_number: 'SG123',
    airline: 'SpiceJet',
    status: 'landed',
    arrival_time: new Date('2024-01-15T17:55:00Z'),
    terminal: 'T2'
  }
];

module.exports = {
  MockTransfer,
  mockTransfers,
  mockVendors,
  mockFlights
};
