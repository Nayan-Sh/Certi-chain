const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    studentName: String,
    studentEmail: String,
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // Reference to student user
    course: String,
    orgName: String,
    hash: String,
    ipfsHash: String,
    txHash: String,
    sbtTxHash: String,
    chainId: { type: Number, default: 11155111 },
    aiScore: Number,
    aiDetails: mongoose.Schema.Types.Mixed,
    revoked: {
        type: Boolean,
        default: false
    },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // Reference to admin who issued
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Certificate", certificateSchema);