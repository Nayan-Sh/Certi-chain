const mongoose = require("mongoose");

// ── ConsumedTxHash ────────────────────────────────────────────────────────────
// Tracks transaction hashes that have already been processed to prevent
// replay attacks. A malicious client cannot re-submit the same txHash to
// create duplicate records.
const consumedTxHashSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // The transaction hash (lowercase)
    chainId: { type: Number, required: true, index: true },
    processedAt: { type: Date, default: Date.now },
    processedBy: String, // admin email that submitted
    eventType: String, // "CertificateIssued" or "CertificateRevoked" or "CertificateClaimed"
    certificateId: String, // optional: the certificate ID associated
});

consumedTxHashSchema.index({ _id: 1, chainId: 1 }, { unique: true });

module.exports = mongoose.model("ConsumedTxHash", consumedTxHashSchema);