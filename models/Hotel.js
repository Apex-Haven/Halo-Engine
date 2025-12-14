const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema({
  hotelId: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },
  city: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  state: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    default: 'India',
    trim: true
  },
  location: {
    address: {
      type: String,
      trim: true
    },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180
      }
    }
  },
  starRating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
    index: true
  },
  rating: {
    score: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    reviews: {
      type: Number,
      default: 0
    },
    platform: {
      type: String,
      default: 'system'
    }
  },
  pricing: {
    basePrice: {
      type: Number,
      min: 0,
      default: 0
    },
    currency: {
      type: String,
      uppercase: true,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR', 'GBP']
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    taxIncluded: {
      type: Boolean,
      default: false
    }
  },
  amenities: {
    wifi: { type: Boolean, default: false },
    parking: { type: Boolean, default: false },
    pool: { type: Boolean, default: false },
    gym: { type: Boolean, default: false },
    restaurant: { type: Boolean, default: false },
    spa: { type: Boolean, default: false },
    airportShuttle: { type: Boolean, default: false },
    conferenceRoom: { type: Boolean, default: false },
    businessCenter: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
    other: [String]
  },
  roomTypes: [{
    type: {
      type: String,
      trim: true
    },
    capacity: {
      adults: { type: Number, default: 2 },
      children: { type: Number, default: 0 }
    },
    price: {
      type: Number,
      min: 0
    }
  }],
  contact: {
    phone: {
      type: String,
      match: /^\+[1-9]\d{1,14}$/
    },
    email: {
      type: String,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    website: {
      type: String
    }
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    source: {
      type: String,
      default: 'system'
    },
    caption: {
      type: String
    }
  }],
  bookingDetails: {
    instantBooking: {
      type: Boolean,
      default: false
    },
    cancellationPolicy: {
      type: String,
      default: ''
    },
    checkInTime: {
      type: String,
      default: '14:00'
    },
    checkOutTime: {
      type: String,
      default: '11:00'
    }
  },
  sources: [{
    platform: {
      type: String,
      required: true
    },
    url: {
      type: String
    },
    lastChecked: {
      type: Date,
      default: Date.now
    },
    price: {
      type: Number
    },
    available: {
      type: Boolean,
      default: true
    }
  }],
  bookingLinks: {
    type: Map,
    of: String,
    default: {}
  },
  prices: {
    type: Map,
    of: {
      amount: Number,
      currency: String
    },
    default: {}
  },
  description: {
    type: String,
    default: ''
  },
  policies: {
    type: String,
    default: ''
  },
  nearby: [{
    name: String,
    type: String,
    distance: Number
  }],
  isAvailable: {
    type: Boolean,
    default: true,
    index: true
  },
  availability: {
    checkIn: {
      type: Date
    },
    checkOut: {
      type: Date
    },
    roomsAvailable: {
      type: Number,
      default: 0
    }
  },
  assignedToCustomers: [{
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    checkIn: {
      type: Date,
      required: true
    },
    checkOut: {
      type: Date,
      required: true
    },
    guests: {
      adults: { type: Number, default: 2 },
      children: { type: Number, default: 0 }
    },
    roomType: {
      type: String,
      default: 'Standard Room'
    },
    bookingStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed'],
      default: 'pending'
    },
    bookingReference: {
      type: String
    },
    notes: {
      type: String,
      default: ''
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  performance: {
    totalBookings: {
      type: Number,
      default: 0
    },
    cancellationRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    avgGuestRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    lastBooked: {
      type: Date
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'active',
    index: true
  },
  verified: {
    type: Boolean,
    default: false,
    index: true
  },
  notes: {
    type: String,
    default: ''
  },
  // External API IDs
  xoteloId: {
    type: String
  },
  cozyCozyId: {
    type: String
  },
  // Metadata
  isRealApiData: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    default: 'system'
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed
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
  collection: 'hotels'
});

// Indexes
hotelSchema.index({ city: 1, starRating: 1 });
hotelSchema.index({ status: 1, isAvailable: 1 });
hotelSchema.index({ 'assignedToCustomers.customerId': 1 });
hotelSchema.index({ verified: 1, status: 1 });
hotelSchema.index({ xoteloId: 1 }, { sparse: true });
hotelSchema.index({ cozyCozyId: 1 }, { sparse: true });

// Pre-save hook to generate hotelId if not provided
hotelSchema.pre('save', async function(next) {
  if (!this.hotelId) {
    const count = await mongoose.model('Hotel').countDocuments();
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    this.hotelId = `HTL${randomNum}`;
  }
  next();
});

// Instance methods
hotelSchema.methods.updatePerformance = function(bookingStatus, rating = null) {
  if (bookingStatus === 'confirmed') {
    this.performance.totalBookings += 1;
    this.performance.lastBooked = new Date();
  } else if (bookingStatus === 'cancelled' && this.performance.totalBookings > 0) {
    this.performance.cancellationRate = 
      ((this.performance.totalBookings - 1) / this.performance.totalBookings) * 100;
  }
  
  if (rating !== null) {
    const totalRatings = this.performance.totalBookings;
    const currentAvg = this.performance.avgGuestRating;
    this.performance.avgGuestRating = ((currentAvg * (totalRatings - 1)) + rating) / totalRatings;
  }
};

// Static methods
hotelSchema.statics.findByCity = function(city) {
  return this.find({ city: city.toUpperCase(), status: 'active', isAvailable: true });
};

hotelSchema.statics.findByCustomer = function(customerId) {
  return this.find({ 'assignedToCustomers.customerId': customerId });
};

hotelSchema.statics.findByStarRating = function(minStars) {
  return this.find({ starRating: { $gte: minStars }, status: 'active' });
};

const Hotel = mongoose.model('Hotel', hotelSchema);

module.exports = Hotel;

