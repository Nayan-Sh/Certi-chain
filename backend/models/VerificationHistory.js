const mongoose = require('mongoose');

const verificationHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  certificateId: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['verified', 'invalid', 'error'],
    required: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('VerificationHistory', verificationHistorySchema);
