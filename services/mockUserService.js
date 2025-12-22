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
    if (!user) return null;
    
    // Return a proxy that supports method chaining like Mongoose
    return new Proxy(user, {
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
              } else if (field.startsWith('+')) {
                // Include field (already included by default)
                // No action needed
              }
            }
            
            // Return a proxy that also supports populate
            return new Proxy(selectedData, {
              get(obj, propName) {
                if (propName === 'populate') {
                  return () => obj; // Mock populate - just return the object
                }
                return obj[propName];
              }
            });
          };
        }
        if (prop === 'populate') {
          return () => target; // Mock populate - just return the object
        }
        return target[prop];
      }
    });
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

  static find(query = {}) {
    let results = [];
    for (const user of MockUserService.users.values()) {
      let matches = true;
      
      // Handle role query (single value or $in array)
      if (query.role) {
        if (query.role.$in) {
          matches = query.role.$in.includes(user.role);
        } else if (user.role !== query.role) {
          matches = false;
        }
      }
      
      if (query.isActive !== undefined && user.isActive !== query.isActive) matches = false;
      if (query._id && user._id !== query._id) matches = false;
      if (query.email && user.email !== query.email) matches = false;
      if (query.username && user.username !== query.username) matches = false;
      
      // Handle $or queries
      if (query.$or) {
        matches = query.$or.some(condition => {
          if (condition.email && user.email === condition.email) return true;
          if (condition.username && user.username === condition.username) return true;
          if (condition._id && user._id === condition._id) return true;
          return false;
        });
      }
      
      if (matches) results.push(user);
    }
    
    // Return chainable query object
    return new MockUserQuery(results);
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

// Chainable query class for MockUser to mimic Mongoose query behavior
class MockUserQuery {
  constructor(results) {
    this._results = results;
    this._selectFields = null;
    this._populatePaths = [];
    this._sortField = null;
    this._sortOrder = 1;
    this._limitValue = null;
    this._skipValue = 0;
    this._lean = false;
  }

  select(fields) {
    this._selectFields = fields;
    return this;
  }

  populate(path, select) {
    // Handle both string and object syntax
    if (typeof path === 'string') {
      this._populatePaths.push({ path, select });
    } else if (typeof path === 'object') {
      // Object syntax: { path: 'field', select: 'fields' }
      this._populatePaths.push({ path: path.path, select: path.select });
    }
    return this;
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

    // Apply populate - resolve ObjectId references
    for (const result of results) {
      for (const populate of this._populatePaths) {
        const path = populate.path;
        const select = populate.select;
        
        if (result[path]) {
          if (Array.isArray(result[path])) {
            // Populate array of references
            result[path] = result[path].map(refId => {
              const refUser = MockUserService.users.get(refId.toString());
              if (!refUser) return null;
              
              // Apply select if specified
              if (select) {
                const selectedData = { ...refUser };
                const fields = select.replace(/\s/g, '').split(' ');
                for (const field of fields) {
                  if (field.startsWith('-')) {
                    const fieldName = field.substring(1);
                    delete selectedData[fieldName];
                  }
                }
                return selectedData;
              }
              return refUser;
            }).filter(Boolean);
          } else {
            // Populate single reference
            const refId = result[path];
            const refUser = MockUserService.users.get(refId.toString());
            if (refUser) {
              // Apply select if specified
              if (select) {
                const selectedData = { ...refUser };
                const fields = select.replace(/\s/g, '').split(' ');
                for (const field of fields) {
                  if (field.startsWith('-')) {
                    const fieldName = field.substring(1);
                    delete selectedData[fieldName];
                  }
                }
                result[path] = selectedData;
              } else {
                result[path] = refUser;
              }
            }
          }
        }
      }
    }

    // Apply select
    if (this._selectFields) {
      results = results.map(user => {
        const selectedData = { ...user };
        const fields = this._selectFields.replace(/\s/g, '').split(' ');
        
        for (const field of fields) {
          if (field.startsWith('-')) {
            // Exclude field
            const fieldName = field.substring(1);
            delete selectedData[fieldName];
          }
        }
        
        return selectedData;
      });
    }

    // Return as plain objects if lean, otherwise as MockUser instances
    if (this._lean) {
      return results.map(u => ({ ...u }));
    }
    return results;
  }

  _getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value == null) return null;
      value = value[key];
    }
    return value;
  }

  // Make it thenable (Promise-like) for async/await
  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }
}

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

module.exports = { MockUser, MockUserQuery, MockUserService };