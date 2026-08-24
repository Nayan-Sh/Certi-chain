const mongoose = require("mongoose");

// ── ContractConfig ─────────────────────────────────────────────────────────
// Singleton document storing the currently-deployed smart-contract addresses.
// Written by the admin via POST /api/contract/register (deploy-from-dApp flow)
// and read by blockchainService on every chain call, with backend/.env as a
// fallback. Because the document `_id` is fixed, upserting keeps exactly one row.
const contractConfigSchema = new mongoose.Schema({
    _id: { type: String, default: "singleton" },
    certAddress: { type: String, required: true },
    sbtAddress: { type: String, required: true },
    certTxHash: String,
    sbtTxHash: String,
    deployedBy: String,   // admin email that deployed
    deployedAt: { type: Date, default: Date.now },
    chainId: Number
});

module.exports = mongoose.model("ContractConfig", contractConfigSchema);
