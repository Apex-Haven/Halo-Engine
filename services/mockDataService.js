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
// Chainable query class to mimic Mongoose query behavior
class MockQuery {
  constructor(results) {
    this._results = results;
    this._sortField = null;
    this._sortOrder = 1;
    this._limitValue = null;
    this._skipValue = 0;
    this._lean = false;
  }

  sort(sortObj) {
    // Handle Mongoose sort format: { field: 1 } or { field: -1 } or "field" or "-field"
    if (typeof sortObj === 'string') {
      if (sortObj.startsWith('-')) {
        this._sortField = sortObj.substring(1);
        this._sortOrder = -1;
      } else {
        this._sortField = sortObj;
        this._sortOrder = 1;
      }
    } else if (typeof sortObj === 'object') {
      const keys = Object.keys(sortObj);
      if (keys.length > 0) {
        this._sortField = keys[0];
        this._sortOrder = sortObj[keys[0]];
      }
    }
    return this;
  }

  limit(n) {
    this._limitValue = n;
    return this;
  }

  skip(n) {
    this._skipValue = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    return this._execute();
  }

  async _execute() {
    let results = [...this._results];

    // Apply sorting
    if (this._sortField) {
      results.sort((a, b) => {
        const aVal = this._getNestedValue(a, this._sortField);
        const bVal = this._getNestedValue(b, this._sortField);
        
        if (aVal === bVal) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        
        const comparison = aVal > bVal ? 1 : -1;
        return comparison * this._sortOrder;
      });
    }

    // Apply skip
    if (this._skipValue > 0) {
      results = results.slice(this._skipValue);
    }

    // Apply limit
    if (this._limitValue !== null) {
      results = results.slice(0, this._limitValue);
    }

    // Return as plain objects if lean, otherwise as MockTransfer instances
    if (this._lean) {
      return results.map(t => ({ ...t }));
    }
    return results.map(t => new MockTransfer(t));
  }

  _getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value == null) return null;
      // Handle field name aliases (createdAt -> created_at, updatedAt -> updated_at)
      if (key === 'createdAt' && value.created_at !== undefined) {
        value = value.created_at;
      } else if (key === 'updatedAt' && value.updated_at !== undefined) {
        value = value.updated_at;
      } else {
        value = value[key];
      }
    }
    return value;
  }

  // Make it thenable (Promise-like) for async/await
  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }
}

class MockTransfer {
  constructor(data) {
    Object.assign(this, data);
  }

  static find(query = {}) {
    let results = [...mockTransfers];
    
    // Apply query filters
    if (query.status) {
      results = results.filter(t => t.transfer_details?.transfer_status === query.status);
    }
    if (query.vendor_id) {
      results = results.filter(t => t.vendor_details?.vendor_id === query.vendor_id);
    }
    if (query._id) {
      results = results.filter(t => t._id === query._id);
    }
    if (query['transfer_details.transfer_status']) {
      results = results.filter(t => t.transfer_details?.transfer_status === query['transfer_details.transfer_status']);
    }
    if (query['vendor_details.vendor_id']) {
      results = results.filter(t => t.vendor_details?.vendor_id === query['vendor_details.vendor_id']);
    }
    if (query['assigned_driver_details.driver_id']) {
      results = results.filter(t => t.assigned_driver_details?.driver_id === query['assigned_driver_details.driver_id']);
    }
    if (query['flight_details.flight_no']) {
      results = results.filter(t => t.flight_details?.flight_no === query['flight_details.flight_no']);
    }
    if (query['flight_details.arrival_time']) {
      const arrivalTimeFilter = query['flight_details.arrival_time'];
      if (arrivalTimeFilter.$gte) {
        const gteDate = new Date(arrivalTimeFilter.$gte);
        results = results.filter(t => {
          const arrivalTime = t.flight_details?.arrival_time;
          return arrivalTime && new Date(arrivalTime) >= gteDate;
        });
      }
      if (arrivalTimeFilter.$lte) {
        const lteDate = new Date(arrivalTimeFilter.$lte);
        results = results.filter(t => {
          const arrivalTime = t.flight_details?.arrival_time;
          return arrivalTime && new Date(arrivalTime) <= lteDate;
        });
      }
    }
    
    // Handle $or conditions
    if (query.$or) {
      const orResults = [];
      for (const orCondition of query.$or) {
        const orMatches = results.filter(t => {
          return Object.keys(orCondition).some(key => {
            const value = this._getNestedValue(t, key);
            if (value instanceof RegExp) {
              return value.test(String(this._getNestedValue(t, key)));
            }
            return value === orCondition[key];
          });
        });
        orResults.push(...orMatches);
      }
      results = [...new Set(orResults.map(t => t._id))].map(id => 
        results.find(t => t._id === id)
      );
    }
    
    // Handle $and conditions
    if (query.$and) {
      for (const andCondition of query.$and) {
        if (andCondition.$or) {
          const orResults = [];
          for (const orCondition of andCondition.$or) {
            const orMatches = results.filter(t => {
              return Object.keys(orCondition).some(key => {
                const value = this._getNestedValue(t, key);
                if (value instanceof RegExp) {
                  return value.test(String(this._getNestedValue(t, key)));
                }
                return value === orCondition[key];
              });
            });
            orResults.push(...orMatches);
          }
          results = [...new Set(orResults.map(t => t._id))].map(id => 
            results.find(t => t._id === id)
          );
        }
      }
    }
    
    // Return chainable query object
    return new MockQuery(results);
  }

  static _getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value == null) return null;
      // Handle field name aliases (createdAt -> created_at, updatedAt -> updated_at)
      if (key === 'createdAt' && value.created_at !== undefined) {
        value = value.created_at;
      } else if (key === 'updatedAt' && value.updated_at !== undefined) {
        value = value.updated_at;
      } else {
        value = value[key];
      }
    }
    return value;
  }

  static async countDocuments(query = {}) {
    // Use the same filtering logic as find()
    let results = [...mockTransfers];
    
    // Apply query filters (same logic as find)
    if (query.status) {
      results = results.filter(t => t.transfer_details?.transfer_status === query.status);
    }
    if (query.vendor_id) {
      results = results.filter(t => t.vendor_details?.vendor_id === query.vendor_id);
    }
    if (query._id) {
      results = results.filter(t => t._id === query._id);
    }
    if (query['transfer_details.transfer_status']) {
      results = results.filter(t => t.transfer_details?.transfer_status === query['transfer_details.transfer_status']);
    }
    if (query['vendor_details.vendor_id']) {
      results = results.filter(t => t.vendor_details?.vendor_id === query['vendor_details.vendor_id']);
    }
    if (query['assigned_driver_details.driver_id']) {
      results = results.filter(t => t.assigned_driver_details?.driver_id === query['assigned_driver_details.driver_id']);
    }
    if (query['flight_details.flight_no']) {
      results = results.filter(t => t.flight_details?.flight_no === query['flight_details.flight_no']);
    }
    if (query['flight_details.arrival_time']) {
      const arrivalTimeFilter = query['flight_details.arrival_time'];
      if (arrivalTimeFilter.$gte) {
        const gteDate = new Date(arrivalTimeFilter.$gte);
        results = results.filter(t => {
          const arrivalTime = t.flight_details?.arrival_time;
          return arrivalTime && new Date(arrivalTime) >= gteDate;
        });
      }
      if (arrivalTimeFilter.$lte) {
        const lteDate = new Date(arrivalTimeFilter.$lte);
        results = results.filter(t => {
          const arrivalTime = t.flight_details?.arrival_time;
          return arrivalTime && new Date(arrivalTime) <= lteDate;
        });
      }
    }
    
    // Handle $or conditions
    if (query.$or) {
      const orResults = [];
      for (const orCondition of query.$or) {
        const orMatches = results.filter(t => {
          return Object.keys(orCondition).some(key => {
            const value = this._getNestedValue(t, key);
            if (value instanceof RegExp) {
              return value.test(String(this._getNestedValue(t, key)));
            }
            return value === orCondition[key];
          });
        });
        orResults.push(...orMatches);
      }
      results = [...new Set(orResults.map(t => t._id))].map(id => 
        results.find(t => t._id === id)
      );
    }
    
    // Handle $and conditions
    if (query.$and) {
      for (const andCondition of query.$and) {
        if (andCondition.$or) {
          const orResults = [];
          for (const orCondition of andCondition.$or) {
            const orMatches = results.filter(t => {
              return Object.keys(orCondition).some(key => {
                const value = this._getNestedValue(t, key);
                if (value instanceof RegExp) {
                  return value.test(String(this._getNestedValue(t, key)));
                }
                return value === orCondition[key];
              });
            });
            orResults.push(...orMatches);
          }
          results = [...new Set(orResults.map(t => t._id))].map(id => 
            results.find(t => t._id === id)
          );
        }
      }
    }
    
    return results.length;
  }

  static async aggregate(pipeline) {
    // Basic aggregate support for common operations
    let results = [...mockTransfers];
    
    // Apply $match stages
    for (const stage of pipeline) {
      if (stage.$match) {
        results = this._applyMatch(results, stage.$match);
      }
      if (stage.$group) {
        return this._applyGroup(results, stage.$group);
      }
    }
    
    return results;
  }

  static _applyMatch(results, matchQuery) {
    // Simplified match implementation
    return results.filter(t => {
      for (const [key, value] of Object.entries(matchQuery)) {
        const nestedValue = this._getNestedValue(t, key);
        if (nestedValue !== value) {
          return false;
        }
      }
      return true;
    });
  }

  static _applyGroup(results, groupStage) {
    // Basic group implementation
    const grouped = {};
    for (const transfer of results) {
      const id = groupStage._id;
      let groupKey;
      
      if (typeof id === 'string') {
        groupKey = this._getNestedValue(transfer, id);
      } else {
        groupKey = 'all';
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = { _id: groupKey, count: 0 };
      }
      
      if (groupStage.count) {
        grouped[groupKey].count += 1;
      }
    }
    
    return Object.values(grouped);
  }

  static async findById(id) {
    // Handle both string and ObjectId-like formats
    const transfer = mockTransfers.find(t => {
      if (typeof id === 'string') {
        return t._id === id || t._id === id.toUpperCase();
      }
      return t._id === id;
    });
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
