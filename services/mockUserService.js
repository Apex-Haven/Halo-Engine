const bcrypt = require('bcryptjs');
const { getJWTSecret } = require('../config/env');

// Mock User class for demo mode
class MockUser {
  constructor(data) {
    this._id = data._id || `mock_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.username = data.username;
    this.email = data.email;
    this.password = data.password;
    this.role = data.role || 'CUSTOMER';
    this.profile = data.profile || {};
    this.preferences = data.preferences || {};
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.isLocked = data.isLocked || false;
    this.loginAttempts = data.loginAttempts || 0;
    this.lockUntil = data.lockUntil || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.customerTransfers = data.customerTransfers || [];
  }

  async save() {
    // In a real implementation, this would save to database
    // For now, we'll store in memory
    MockUserService.users.set(this._id, this);
    return this;
  }

  async comparePassword(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  generateAuthToken() {
    const jwt = require('jsonwebtoken');
    const payload = {
      userId: this._id,
      username: this.username,
      email: this.email,
      role: this.role
    };
    
    const jwtSecret = getJWTSecret();
    return jwt.sign(payload, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
  }

  async incrementLoginAttempts() {
    this.loginAttempts += 1;
    if (this.loginAttempts >= 5) {
      this.isLocked = true;
      this.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    }
    await this.save();
  }

  async resetLoginAttempts() {
    this.loginAttempts = 0;
    this.isLocked = false;
    this.lockUntil = null;
    await this.save();
  }

  select(fields) {
    // Return the user object with selected fields
    if (!fields) return this;
    
    const selectedData = { ...this };
    const fieldList = fields.replace(/\s/g, '').split(' ');
    
    for (const field of fieldList) {
      if (field.startsWith('-')) {
        // Exclude field
        const fieldName = field.substring(1);
        delete selectedData[fieldName];
      }
      // + prefix means include field (default behavior)
    }
    
    return selectedData;
  }

  static findById(id) {
    const user = MockUserService.users.get(id);
    return user || null;
  }

  static async findOne(query) {
    let foundUser = null;
    
    for (const user of MockUserService.users.values()) {
      // Handle $or queries
      if (query.$or) {
        for (const orCondition of query.$or) {
          if (orCondition.email && user.email === orCondition.email) {
            foundUser = user;
            break;
          }
          if (orCondition.username && user.username === orCondition.username) {
            foundUser = user;
            break;
          }
        }
      }
      // Handle direct field queries
      if (query.email && user.email === query.email) {
        foundUser = user;
        break;
      }
      if (query.username && user.username === query.username) {
        foundUser = user;
        break;
      }
      if (query._id && user._id === query._id) {
        foundUser = user;
        break;
      }
    }
    
    if (!foundUser) return null;
    
    // Create a proxy object that handles method chaining
    const queryProxy = new Proxy(foundUser, {
      get(target, prop) {
        if (prop === 'select') {
          return (fields) => {
            if (!fields) return target;
            
            const selectedData = { ...target };
            const fieldList = fields.replace(/\s/g, '').split(' ');
            
            for (const field of fieldList) {
              if (field.startsWith('-')) {
                // Exclude field
                const fieldName = field.substring(1);
                delete selectedData[fieldName];
              }
              // + prefix means include field (default behavior)
            }
            
            return selectedData;
          };
        }
        
        // Return the original property
        return target[prop];
      }
    });
    
    return queryProxy;
  }

  static async find(query = {}) {
    const results = [];
    for (const user of MockUserService.users.values()) {
      let matches = true;
      
      if (query.role && user.role !== query.role) matches = false;
      if (query.isActive !== undefined && user.isActive !== query.isActive) matches = false;
      
      if (matches) results.push(user);
    }
    return results;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    const user = MockUserService.users.get(id);
    if (!user) return null;

    // Update user data
    Object.assign(user, updateData);
    user.updatedAt = new Date();

    // Handle password hashing if password is being updated
    if (updateData.password) {
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(updateData.password, salt);
    }

    MockUserService.users.set(id, user);
    return user;
  }

  static async findByIdAndDelete(id) {
    return MockUserService.users.delete(id);
  }

  static async countDocuments(query = {}) {
    let count = 0;
    for (const user of MockUserService.users.values()) {
      let matches = true;
      
      if (query.role && user.role !== query.role) matches = false;
      if (query.isActive !== undefined && user.isActive !== query.isActive) matches = false;
      
      if (matches) count++;
    }
    return count;
  }
}

// Mock Query class to simulate Mongoose's method chaining
class MockQuery {
  constructor(data) {
    this.data = data;
    this.selectFields = null;
  }

  select(fields) {
    this.selectFields = fields;
    return this;
  }

  async exec() {
    if (!this.data) return null;
    
    if (this.selectFields) {
      // Simulate field selection
      const selectedData = { ...this.data };
      const fields = this.selectFields.replace(/\s/g, '').split(' ');
      
      for (const field of fields) {
        if (field.startsWith('-')) {
          // Exclude field
          const fieldName = field.substring(1);
          delete selectedData[fieldName];
        }
        // Note: + prefix means include field (which is default behavior)
        // So we don't need special handling for it
      }
      
      return selectedData;
    }
    
    return this.data;
  }
}

// Add select method to MockUser static methods
MockUser.select = function(fields) {
  return new MockQuery(this);
};

class MockUserService {
  static users = new Map();

  static async initializeMockUsers() {
    // Create some default users for demo
    const defaultUsers = [
      {
        _id: 'mock_admin_user_001',
        username: 'admin',
        email: 'admin@halo.com',
        password: await bcrypt.hash('admin123', 12),
        role: 'SUPER_ADMIN',
        profile: {
          firstName: 'Admin',
          lastName: 'User',
          phone: '+1234567890'
        },
        preferences: {
          notifications: { email: true, sms: true, whatsapp: true, push: true },
          language: 'en',
          timezone: 'UTC'
        }
      },
      {
        _id: 'mock_customer_user_001',
        username: 'customer1',
        email: 'customer1@example.com',
        password: await bcrypt.hash('customer123', 12),
        role: 'CUSTOMER',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567891'
        },
        preferences: {
          notifications: { email: true, sms: false, whatsapp: true, push: true },
          language: 'en',
          timezone: 'America/New_York'
        }
      },
      {
        _id: 'mock_customer_user_002',
        username: 'customer2',
        email: 'customer2@example.com',
        password: await bcrypt.hash('customer123', 12),
        role: 'CUSTOMER',
        profile: {
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+1234567892'
        },
        preferences: {
          notifications: { email: true, sms: true, whatsapp: false, push: true },
          language: 'en',
          timezone: 'Europe/London'
        }
      }
    ];

    for (const userData of defaultUsers) {
      const user = new MockUser(userData);
      await user.save();
    }

    console.log(`✅ Initialized ${defaultUsers.length} mock users`);
  }

  static isUsingMockData() {
    return !process.env.MONGODB_URI || process.env.MONGODB_URI === '';
  }

  static getUserModel() {
    return MockUserService.isUsingMockData() ? MockUser : require('../models/User');
  }
}

module.exports = { MockUser, MockQuery, MockUserService };