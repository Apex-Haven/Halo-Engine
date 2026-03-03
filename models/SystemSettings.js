const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  aviationstack_api_key: {
    type: String,
    default: '',
    trim: true
  },
  api_provider: {
    type: String,
    enum: ['aviationstack', 'none'],
    default: 'aviationstack'
  },
  api_plan: {
    type: String,
    enum: ['free', 'paid'],
    default: 'free'
  },
  last_updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'systemsettings'
});

// Single document - use findOneAndUpdate
systemSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
