const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  otp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
  verified: {
    type: Boolean,
    default: false,
  },
});

// Auto-delete expired OTPs via TTL index
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', otpSchema);
