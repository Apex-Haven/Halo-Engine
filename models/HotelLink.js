const mongoose = require('mongoose');

const hotelLinkSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    index: true
  },
  hotelIdString: {
    type: String,
    trim: true,
    index: true
  },
  cozyCozyId: {
    type: String,
    trim: true,
    sparse: true,
    index: true
  },
  xoteloId: {
    type: String,
    trim: true,
    sparse: true,
    index: true
  },
  hotelName: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    uppercase: true,
    trim: true,
    index: true
  },
  country: {
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
  },
  bookingUrls: {
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
  cardData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  cardHtml: {
    type: String,
    default: ''
  },
  lastChecked: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    default: 'system',
    enum: ['cozycozy', 'xotelo', 'system', 'manual']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'hotellinks'
});

// Indexes
hotelLinkSchema.index({ hotelId: 1, lastChecked: -1 });
hotelLinkSchema.index({ cozyCozyId: 1 }, { sparse: true });
hotelLinkSchema.index({ xoteloId: 1 }, { sparse: true });
hotelLinkSchema.index({ city: 1, lastChecked: -1 });

// Instance methods
hotelLinkSchema.methods.addBookingLink = function(platform, url) {
  if (!this.bookingUrls) {
    this.bookingUrls = new Map();
  }
  this.bookingUrls.set(platform, url);
  this.lastChecked = new Date();
};

hotelLinkSchema.methods.addPrice = function(platform, amount, currency) {
  if (!this.prices) {
    this.prices = new Map();
  }
  this.prices.set(platform, { amount, currency });
  this.lastChecked = new Date();
};

hotelLinkSchema.methods.getBestPrice = function() {
  if (!this.prices || this.prices.size === 0) {
    return null;
  }
  
  let bestPrice = null;
  let bestPlatform = null;
  
  for (const [platform, priceData] of this.prices.entries()) {
    if (!bestPrice || priceData.amount < bestPrice.amount) {
      bestPrice = priceData;
      bestPlatform = platform;
    }
  }
  
  return {
    platform: bestPlatform,
    ...bestPrice
  };
};

// Static methods
hotelLinkSchema.statics.findByHotelId = async function(hotelId) {
  if (mongoose.Types.ObjectId.isValid(hotelId)) {
    return this.find({ hotelId });
  } else {
    return this.find({ hotelIdString: hotelId });
  }
};

hotelLinkSchema.statics.findByCozyCozyId = async function(cozyCozyId) {
  return this.findOne({ cozyCozyId });
};

hotelLinkSchema.statics.findByXoteloId = async function(xoteloId) {
  return this.findOne({ xoteloId });
};

hotelLinkSchema.statics.findByCity = async function(city) {
  return this.find({ city: city.toUpperCase() }).sort({ lastChecked: -1 });
};

hotelLinkSchema.statics.updateOrCreate = async function(query, data) {
  return this.findOneAndUpdate(
    query,
    { ...data, lastChecked: new Date() },
    { upsert: true, new: true }
  );
};

const HotelLink = mongoose.model('HotelLink', hotelLinkSchema);

module.exports = HotelLink;

