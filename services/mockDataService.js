// Mock data service for demo purposes when MongoDB is not available
const mockTransfers = [
  {
    _id: 'APX123456',
    customer_details: {
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '+1234567890',
      whatsapp: '+1234567890'
    },
    flight_details: {
      flight_number: 'AI202',
      airline: 'Air India',
      departure_airport: 'DXB',
      arrival_airport: 'BOM',
      scheduled_arrival: new Date('2024-01-15T14:30:00Z'),
      actual_arrival: new Date('2024-01-15T14:45:00Z'),
      status: 'landed',
      terminal: 'T2'
    },
    transfer_details: {
      pickup_location: 'Mumbai Airport T2',
      drop_location: 'Grand Hyatt Hotel',
      transfer_type: 'arrival',
      status: 'completed',
      estimated_pickup_time: new Date('2024-01-15T15:00:00Z'),
      actual_pickup_time: new Date('2024-01-15T15:05:00Z'),
      estimated_drop_time: new Date('2024-01-15T16:00:00Z'),
      actual_drop_time: new Date('2024-01-15T16:10:00Z')
    },
    vendor_details: {
      vendor_id: 'V001',
      vendor_name: 'Mumbai Transfers Ltd',
      contact_person: 'Raj Kumar',
      phone: '+919876543210'
    },
    assigned_driver_details: {
      driver_id: 'D001',
      driver_name: 'John Doe',
      phone: '+919876543211',
      vehicle_type: 'Toyota Innova',
      vehicle_number: 'MH01AB1234',
      license_number: 'DL123456789'
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
      phone: '+1234567891',
      whatsapp: '+1234567891'
    },
    flight_details: {
      flight_number: 'EK501',
      airline: 'Emirates',
      departure_airport: 'DXB',
      arrival_airport: 'BOM',
      scheduled_arrival: new Date('2024-01-15T16:00:00Z'),
      actual_arrival: null,
      status: 'delayed',
      terminal: 'T2',
      delay_minutes: 45
    },
    transfer_details: {
      pickup_location: 'Mumbai Airport T2',
      drop_location: 'Taj Mahal Palace',
      transfer_type: 'arrival',
      status: 'in_progress',
      estimated_pickup_time: new Date('2024-01-15T16:30:00Z'),
      actual_pickup_time: null,
      estimated_drop_time: new Date('2024-01-15T17:30:00Z'),
      actual_drop_time: null
    },
    vendor_details: {
      vendor_id: 'V002',
      vendor_name: 'Luxury Transfers Mumbai',
      contact_person: 'Priya Sharma',
      phone: '+919876543212'
    },
    assigned_driver_details: {
      driver_id: 'D002',
      driver_name: 'Sarah Wilson',
      phone: '+919876543213',
      vehicle_type: 'Mercedes E-Class',
      vehicle_number: 'MH02CD5678',
      license_number: 'DL987654321'
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
      phone: '+1234567892',
      whatsapp: '+1234567892'
    },
    flight_details: {
      flight_number: 'SG123',
      airline: 'SpiceJet',
      departure_airport: 'DEL',
      arrival_airport: 'BOM',
      scheduled_arrival: new Date('2024-01-15T18:00:00Z'),
      actual_arrival: new Date('2024-01-15T17:55:00Z'),
      status: 'landed',
      terminal: 'T2'
    },
    transfer_details: {
      pickup_location: 'Mumbai Airport T2',
      drop_location: 'ITC Maratha',
      transfer_type: 'arrival',
      status: 'assigned',
      estimated_pickup_time: new Date('2024-01-15T18:30:00Z'),
      actual_pickup_time: null,
      estimated_drop_time: new Date('2024-01-15T19:30:00Z'),
      actual_drop_time: null
    },
    vendor_details: {
      vendor_id: 'V001',
      vendor_name: 'Mumbai Transfers Ltd',
      contact_person: 'Raj Kumar',
      phone: '+919876543210'
    },
    assigned_driver_details: {
      driver_id: 'D003',
      driver_name: 'Raj Kumar',
      phone: '+919876543214',
      vehicle_type: 'Toyota Innova',
      vehicle_number: 'MH03EF9012',
      license_number: 'DL456789123'
    },
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
