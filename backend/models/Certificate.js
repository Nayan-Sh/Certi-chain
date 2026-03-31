const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema({
    id: String,
    studentName: String,
    course: String,
    orgName: String,
    hash: String,
    ipfsHash: String,
    txHash: String,
    aiScore: Number,
    aiDetails: mongoose.Schema.Types.Mixed,
    revoked: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Certificate", certificateSchema);