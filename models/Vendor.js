const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    match: /^VEN\d{6}$/,
    index: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
    index: true
  },
  contactPerson: {
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
    email: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true
    },
    phone: {
      type: String,
      match: /^\+[1-9]\d{1,14}$/
    }
  },
  businessDetails: {
    licenseNumber: {
      type: String,
      required: true,
      trim: true
    },
    taxId: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      zipCode: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true }
    },
    website: {
      type: String,
      default: null
    }
  },
  services: {
    airportTransfers: {
      enabled: { type: Boolean, default: true },
      vehicleTypes: [{
        type: String,
        enum: ['sedan', 'suv', 'van', 'bus', 'luxury', 'electric']
      }],
      capacity: {
        min: { type: Number, default: 1 },
        max: { type: Number, default: 8 }
      },
      coverage: [{
        type: String,
        uppercase: true,
        match: /^[A-Z]{3}$/
      }]
    },
    hotelTransfers: {
      enabled: { type: Boolean, default: true },
      vehicleTypes: [{
        type: String,
        enum: ['sedan', 'suv', 'van', 'bus', 'luxury', 'electric']
      }],
      coverage: [{ type: String, trim: true }]
    },
    cityTours: {
      enabled: { type: Boolean, default: false },
      vehicleTypes: [{
        type: String,
        enum: ['sedan', 'suv', 'van', 'bus', 'luxury', 'electric']
      }],
      languages: [{
        type: String,
        enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']
      }]
    }
  },
  pricing: {
    baseRate: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR']
    },
    perKmRate: {
      type: Number,
      default: 0,
      min: 0
    },
    waitingTimeRate: {
      type: Number,
      default: 0,
      min: 0
    },
    nightSurcharge: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  performance: {
    totalTransfers: { type: Number, default: 0 },
    completedTransfers: { type: Number, default: 0 },
    cancelledTransfers: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    onTimePercentage: { type: Number, default: 0, min: 0, max: 100 },
    responseTime: { type: Number, default: 0 } // in minutes
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'active',
    index: true
  },
  assignedCustomers: [{
    customerId: { type: String, required: true },
    assignedDate: { type: Date, default: Date.now }
  }],
  preferences: {
    workingHours: {
      start: { type: String, default: '00:00' },
      end: { type: String, default: '23:59' }
    },
    maxConcurrentTransfers: { type: Number, default: 10 },
    preferredRegions: [{ type: String }]
  },
  documents: [{
    type: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'vendors'
});

// Indexes
vendorSchema.index({ status: 1, companyName: 1 });
vendorSchema.index({ 'contactPerson.email': 1 });
vendorSchema.index({ 'assignedCustomers.customerId': 1 });

// Pre-save hook to generate vendorId if not provided
vendorSchema.pre('save', async function(next) {
  if (!this.vendorId) {
    const count = await mongoose.model('Vendor').countDocuments();
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    this.vendorId = `VEN${randomNum}`;
  }
  next();
});

// Virtual for full contact name
vendorSchema.virtual('contactPerson.fullName').get(function() {
  return `${this.contactPerson.firstName} ${this.contactPerson.lastName}`;
});

// Instance methods
vendorSchema.methods.updatePerformance = function(transferStatus, rating = null, onTime = false) {
  this.performance.totalTransfers += 1;
  
  if (transferStatus === 'completed') {
    this.performance.completedTransfers += 1;
    if (onTime) {
      const total = this.performance.completedTransfers;
      const currentOnTime = this.performance.onTimePercentage * (total - 1) / 100;
      this.performance.onTimePercentage = ((currentOnTime + 1) / total) * 100;
    }
  } else if (transferStatus === 'cancelled') {
    this.performance.cancelledTransfers += 1;
  }
  
  if (rating !== null) {
    const totalRatings = this.performance.completedTransfers;
    const currentAvg = this.performance.averageRating;
    this.performance.averageRating = ((currentAvg * (totalRatings - 1)) + rating) / totalRatings;
  }
};

// Static methods
vendorSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

vendorSchema.statics.findByCustomer = function(customerId) {
  return this.find({ 'assignedCustomers.customerId': customerId, status: 'active' });
};

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;

