const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    default: null
  },
  hotelIdString: {
    type: String,
    trim: true
  },
  hotelData: {
    type: Object,
    default: null
  },
  relevanceScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  distanceFromConference: {
    type: Number,
    default: null
  },
  pricePerNight: {
    type: Number,
    default: null
  },
  totalPrice: {
    type: Number,
    default: null
  },
  bookingLink: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: ''
  }
}, { _id: false });

const clientTravelPreferencesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  country: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  targetAreas: [{
    type: String,
    trim: true
  }],
  checkInDate: {
    type: Date,
    required: true
  },
  checkOutDate: {
    type: Date,
    required: true
  },
  budgetMin: {
    type: Number,
    required: true,
    min: 0
  },
  budgetMax: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    enum: ['INR', 'USD', 'EUR', 'GBP'],
    default: 'INR'
  },
  preferredStarRating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  requiredAmenities: [{
    type: String,
    trim: true
  }],
  conferenceLocation: {
    name: {
      type: String,
      trim: true
    },
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
  maxDistanceFromConference: {
    type: Number,
    default: 10,
    min: 0
  },
  specialRequirements: {
    type: String,
    default: ''
  },
  transferId: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'recommendations_generated', 'hotel_selected', 'cancelled'],
    default: 'draft',
    index: true
  },
  recommendations: [recommendationSchema],
  selectedHotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    default: null
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
  collection: 'clienttravelpreferences'
});

// Pre-save hook to auto-generate name if not provided
clientTravelPreferencesSchema.pre('save', function(next) {
  if (!this.name || !this.name.trim()) {
    const country = this.country || 'Travel';
    const date = this.checkInDate ? new Date(this.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString();
    this.name = `${country} - ${date}`;
  }
  next();
});

// Indexes
clientTravelPreferencesSchema.index({ clientId: 1, createdAt: -1 });
clientTravelPreferencesSchema.index({ status: 1, country: 1 });
clientTravelPreferencesSchema.index({ checkInDate: 1, checkOutDate: 1 });
clientTravelPreferencesSchema.index({ name: 1 }); // Index for search

// Instance methods
clientTravelPreferencesSchema.methods.markRecommendationsGenerated = function() {
  if (this.recommendations && this.recommendations.length > 0) {
    this.status = 'recommendations_generated';
  }
  return this;
};

const ClientTravelPreferences = mongoose.model('ClientTravelPreferences', clientTravelPreferencesSchema);

module.exports = ClientTravelPreferences;

