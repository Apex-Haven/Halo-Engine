const mongoose = require('mongoose');

const flightStatsCacheSchema = new mongoose.Schema({
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
  normalized_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  cached_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'flightstatscache'
});

flightStatsCacheSchema.index({ flight_number: 1, flight_date: 1 }, { unique: true });
flightStatsCacheSchema.index({ cached_at: 1 }, { expireAfterSeconds: 86400 * 7 }); // TTL 7 days

module.exports = mongoose.model('FlightStatsCache', flightStatsCacheSchema);
