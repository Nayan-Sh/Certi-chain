const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['admin', 'student'],
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: false,
    trim: true,
    default: null,
  },
  password: {
    type: String,
    required: false, // null for Google OAuth users
    default: null,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  // Google OAuth fields
  googleId: {
    type: String,
    default: null,
    sparse: true, // Allows multiple null values but unique non-null
  },
  // Admin-specific
  adminId: {
    type: String,
    default: null,
  },
  // Student-specific
  fullName: {
    type: String,
    default: null,
  },
  rollNumber: {
    type: String,
    default: null,
  },
  institution: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
