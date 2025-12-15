const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    required: true,
    enum: [
      'SUPER_ADMIN',
      'ADMIN', 
      'OPERATIONS_MANAGER',
      'VENDOR_MANAGER',
      'DRIVER',
      'CUSTOMER'
    ],
    default: 'CUSTOMER'
  },
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    phone: {
      type: String,
      match: /^\+[1-9]\d{1,14}$/
    },
    avatar: {
      type: String,
      default: null
    }
  },
  // Role-specific data
  vendorId: {
    type: String,
    required: function() {
      return this.role === 'VENDOR_MANAGER' || this.role === 'DRIVER';
    }
  },
  driverId: {
    type: String,
    required: function() {
      return this.role === 'DRIVER';
    }
  },
  // Customer-specific data
  customerTransfers: [{
    type: String,
    ref: 'Transfer'
  }],
  assignedVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Vendor-specific data
  assignedClients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Vendor-specific data
  vendorDetails: {
    companyName: String,
    contactPerson: String,
    address: String,
    licenseNumber: String,
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    }
  },
  assignedClients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Driver-specific data
  driverDetails: {
    licenseNumber: String,
    vehicleType: String,
    vehicleNumber: String,
    experience: Number, // years
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'hi', 'es', 'fr']
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    }
  }
}, {
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  },
  collection: 'users'
});

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ vendorId: 1 });
userSchema.index({ driverId: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ 'assignedVendors': 1 });
userSchema.index({ 'assignedClients': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function() {
  const payload = {
    userId: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    vendorId: this.vendorId,
    driverId: this.driverId
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'halo_secret_key', {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

// Static methods
userSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

userSchema.statics.findByVendor = function(vendorId) {
  return this.find({ vendorId, isActive: true });
};

userSchema.statics.findByDriver = function(driverId) {
  return this.find({ driverId, isActive: true });
};

// Role-based permission methods
userSchema.methods.canAccessTransfer = function(transferId) {
  switch (this.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'OPERATIONS_MANAGER':
      return true;
    case 'VENDOR_MANAGER':
    case 'DRIVER':
      // Can only access transfers assigned to their vendor
      return true; // Will be checked in middleware
    case 'CUSTOMER':
      // Can only access their own transfers
      return this.customerTransfers.includes(transferId);
    default:
      return false;
  }
};

userSchema.methods.canManageUsers = function() {
  return ['SUPER_ADMIN', 'ADMIN'].includes(this.role);
};

userSchema.methods.canManageVendors = function() {
  return ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(this.role);
};

userSchema.methods.canManageDrivers = function() {
  return ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER'].includes(this.role);
};

userSchema.methods.canSendNotifications = function() {
  return ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(this.role);
};

userSchema.methods.canViewReports = function() {
  return ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'VENDOR_MANAGER'].includes(this.role);
};

userSchema.methods.canManageSettings = function() {
  return ['SUPER_ADMIN', 'ADMIN'].includes(this.role);
};

module.exports = mongoose.model('User', userSchema);
