const bcrypt = require('bcryptjs');

// Mock Vendor class for demo mode
class MockVendor {
  constructor(data) {
    this._id = data._id || `mock_vendor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.vendorId = data.vendorId || this.generateVendorId();
    this.companyName = data.companyName;
    this.contactPerson = data.contactPerson || {};
    this.businessDetails = data.businessDetails || {};
    this.services = data.services || {};
    this.pricing = data.pricing || {};
    this.performance = data.performance || {};
    this.status = data.status || 'active';
    this.assignedCustomers = data.assignedCustomers || [];
    this.preferences = data.preferences || {};
    this.documents = data.documents || [];
    this.notes = data.notes || '';
    this.createdBy = data.createdBy;
    this.updatedBy = data.updatedBy;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  generateVendorId() {
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    return `VEN${randomNum}`;
  }

  async save() {
    MockVendorService.vendors.set(this._id, this);
    return this;
  }

  static findById(id) {
    const vendor = MockVendorService.vendors.get(id);
    return vendor || null;
  }

  static findOne(query) {
    for (const vendor of MockVendorService.vendors.values()) {
      // Handle $or queries
      if (query.$or) {
        for (const orCondition of query.$or) {
          if (orCondition.vendorId && vendor.vendorId === orCondition.vendorId) return vendor;
          if (orCondition['contactPerson.email'] && vendor.contactPerson.email === orCondition['contactPerson.email']) return vendor;
        }
      }
      // Handle direct field queries
      if (query.vendorId && vendor.vendorId === query.vendorId) return vendor;
      if (query['contactPerson.email'] && vendor.contactPerson.email === query['contactPerson.email']) return vendor;
      if (query._id && vendor._id === query._id) return vendor;
    }
    return null;
  }

  static async find(query = {}) {
    const results = [];
    for (const vendor of MockVendorService.vendors.values()) {
      let matches = true;
      
      if (query.status && vendor.status !== query.status) matches = false;
      if (query['assignedCustomers.customerId'] && !vendor.assignedCustomers.some(ac => ac.customerId === query['assignedCustomers.customerId'])) matches = false;
      
      if (matches) results.push(vendor);
    }
    return results;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    const vendor = MockVendorService.vendors.get(id);
    if (!vendor) return null;

    // Update vendor data
    Object.assign(vendor, updateData);
    vendor.updatedAt = new Date();

    MockVendorService.vendors.set(id, vendor);
    return vendor;
  }

  static async findByIdAndDelete(id) {
    return MockVendorService.vendors.delete(id);
  }

  static async countDocuments(query = {}) {
    let count = 0;
    for (const vendor of MockVendorService.vendors.values()) {
      let matches = true;
      
      if (query.status && vendor.status !== query.status) matches = false;
      if (query['assignedCustomers.customerId'] && !vendor.assignedCustomers.some(ac => ac.customerId === query['assignedCustomers.customerId'])) matches = false;
      
      if (matches) count++;
    }
    return count;
  }
}

class MockVendorService {
  static vendors = new Map();

  static async initializeMockVendors() {
    // Create some default vendors for demo
    const defaultVendors = [
      {
        _id: 'mock_vendor_001',
        vendorId: 'VEN123456',
        companyName: 'Elite Airport Transfers',
        contactPerson: {
          firstName: 'Michael',
          lastName: 'Johnson',
          email: 'michael@elitetransfers.com',
          phone: '+1234567890'
        },
        businessDetails: {
          licenseNumber: 'ELT-2024-001',
          taxId: 'TAX-ELT-123456',
          address: {
            street: '123 Airport Blvd',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA'
          },
          website: 'https://elitetransfers.com'
        },
        services: {
          airportTransfers: {
            enabled: true,
            vehicleTypes: ['sedan', 'suv', 'luxury'],
            capacity: { min: 1, max: 6 },
            coverage: ['JFK', 'LGA', 'EWR']
          },
          hotelTransfers: {
            enabled: true,
            vehicleTypes: ['sedan', 'suv'],
            coverage: ['Manhattan', 'Brooklyn', 'Queens']
          },
          cityTours: {
            enabled: true,
            vehicleTypes: ['sedan', 'suv'],
            languages: ['en', 'es']
          }
        },
        pricing: {
          baseRate: 50,
          currency: 'USD',
          perKmRate: 2.5,
          waitingTimeRate: 15,
          nightSurcharge: 10
        },
        performance: {
          rating: 4.8,
          totalBookings: 150,
          completedBookings: 145,
          cancelledBookings: 5,
          averageResponseTime: 5,
          lastActive: new Date()
        },
        status: 'active',
        assignedCustomers: [
          {
            customerId: 'mock_customer_user_001',
            assignedAt: new Date(),
            assignedBy: 'mock_admin_user_001',
            notes: 'Preferred vendor for John Doe'
          }
        ],
        preferences: {
          workingHours: { start: '06:00', end: '22:00', timezone: 'America/New_York' },
          notificationSettings: { email: true, sms: true, whatsapp: true, push: true },
          autoAcceptBookings: false,
          maxAdvanceBookingDays: 30
        },
        notes: 'Reliable vendor with excellent service quality',
        createdBy: 'mock_admin_user_001'
      },
      {
        _id: 'mock_vendor_002',
        vendorId: 'VEN789012',
        companyName: 'City Express Services',
        contactPerson: {
          firstName: 'Sarah',
          lastName: 'Williams',
          email: 'sarah@cityexpress.com',
          phone: '+1234567891'
        },
        businessDetails: {
          licenseNumber: 'CES-2024-002',
          taxId: 'TAX-CES-789012',
          address: {
            street: '456 Business Ave',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90210',
            country: 'USA'
          },
          website: 'https://cityexpress.com'
        },
        services: {
          airportTransfers: {
            enabled: true,
            vehicleTypes: ['sedan', 'van', 'bus'],
            capacity: { min: 1, max: 20 },
            coverage: ['LAX', 'BUR', 'SNA']
          },
          hotelTransfers: {
            enabled: true,
            vehicleTypes: ['sedan', 'van'],
            coverage: ['Hollywood', 'Beverly Hills', 'Downtown LA']
          },
          cityTours: {
            enabled: false,
            vehicleTypes: [],
            languages: []
          }
        },
        pricing: {
          baseRate: 45,
          currency: 'USD',
          perKmRate: 2.0,
          waitingTimeRate: 12,
          nightSurcharge: 8
        },
        performance: {
          rating: 4.5,
          totalBookings: 200,
          completedBookings: 190,
          cancelledBookings: 10,
          averageResponseTime: 8,
          lastActive: new Date()
        },
        status: 'active',
        assignedCustomers: [
          {
            customerId: 'mock_customer_user_002',
            assignedAt: new Date(),
            assignedBy: 'mock_admin_user_001',
            notes: 'Preferred vendor for Jane Smith'
          }
        ],
        preferences: {
          workingHours: { start: '05:00', end: '23:00', timezone: 'America/Los_Angeles' },
          notificationSettings: { email: true, sms: true, whatsapp: false, push: true },
          autoAcceptBookings: true,
          maxAdvanceBookingDays: 60
        },
        notes: 'High-volume vendor with competitive pricing',
        createdBy: 'mock_admin_user_001'
      },
      {
        _id: 'mock_vendor_003',
        vendorId: 'VEN345678',
        companyName: 'Premium Transport Solutions',
        contactPerson: {
          firstName: 'David',
          lastName: 'Brown',
          email: 'david@premiumtransport.com',
          phone: '+1234567892'
        },
        businessDetails: {
          licenseNumber: 'PTS-2024-003',
          taxId: 'TAX-PTS-345678',
          address: {
            street: '789 Luxury Lane',
            city: 'Miami',
            state: 'FL',
            zipCode: '33101',
            country: 'USA'
          },
          website: 'https://premiumtransport.com'
        },
        services: {
          airportTransfers: {
            enabled: true,
            vehicleTypes: ['luxury', 'electric'],
            capacity: { min: 1, max: 4 },
            coverage: ['MIA', 'FLL']
          },
          hotelTransfers: {
            enabled: true,
            vehicleTypes: ['luxury', 'electric'],
            coverage: ['South Beach', 'Downtown Miami', 'Brickell']
          },
          cityTours: {
            enabled: true,
            vehicleTypes: ['luxury'],
            languages: ['en', 'es']
          }
        },
        pricing: {
          baseRate: 80,
          currency: 'USD',
          perKmRate: 4.0,
          waitingTimeRate: 25,
          nightSurcharge: 15
        },
        performance: {
          rating: 4.9,
          totalBookings: 75,
          completedBookings: 74,
          cancelledBookings: 1,
          averageResponseTime: 3,
          lastActive: new Date()
        },
        status: 'active',
        assignedCustomers: [],
        preferences: {
          workingHours: { start: '07:00', end: '21:00', timezone: 'America/New_York' },
          notificationSettings: { email: true, sms: false, whatsapp: true, push: true },
          autoAcceptBookings: false,
          maxAdvanceBookingDays: 14
        },
        notes: 'Luxury service provider for VIP clients',
        createdBy: 'mock_admin_user_001'
      }
    ];

    for (const vendorData of defaultVendors) {
      const vendor = new MockVendor(vendorData);
      await vendor.save();
    }

    console.log(`✅ Initialized ${defaultVendors.length} mock vendors`);
  }

  static isUsingMockData() {
    const mongoose = require('mongoose');
    // Use mock data only if MongoDB is not connected
    return mongoose.connection.readyState !== 1; // 1 = connected
  }

  static getVendorModel() {
    return MockVendorService.isUsingMockData() ? MockVendor : require('../models/Vendor');
  }
}

module.exports = { MockVendor, MockVendorService };
