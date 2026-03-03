const mongoose = require('mongoose');

const flightCacheSchema = new mongoose.Schema({
  flight_number: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 10
  },
  flight_date: {
    type: Date,
    required: true
  },
  departure_airport: { type: String, trim: true, maxlength: 10 },
  arrival_airport: { type: String, trim: true, maxlength: 10 },
  scheduled_departure: { type: Date },
  scheduled_arrival: { type: Date },
  terminal: { type: String, trim: true, maxlength: 20 },
  gate: { type: String, trim: true, maxlength: 20 },
  airline: { type: String, trim: true, maxlength: 100 },
  status: { type: String, trim: true, maxlength: 50 },
  cached_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'flightcache'
});

// Compound index for fast lookup
flightCacheSchema.index({ flight_number: 1, flight_date: 1 }, { unique: true });

// TTL: cache for 30 days (reduces API calls for event logistics)
flightCacheSchema.index({ cached_at: 1 }, { expireAfterSeconds: 86400 * 30 });

module.exports = mongoose.model('FlightCache', flightCacheSchema);
