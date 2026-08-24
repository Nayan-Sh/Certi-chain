const mongoose = require("mongoose");

// Monotonic server-side counter used to mint sequential, collision-free
// certificate IDs (CERT-<year>-<000001>). Using `_id` as a fixed key lets us
// atomically `$inc` in a single upsert, regardless of request concurrency.
const idCounterSchema = new mongoose.Schema({
    _id: String,                  // counter name, e.g. "cert"
    seq: { type: Number, default: 0 }
});

module.exports = mongoose.model("IdCounter", idCounterSchema);