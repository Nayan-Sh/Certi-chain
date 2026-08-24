const Counter = require("../models/IdCounter");

// Mint `count` sequential, human-friendly certificate IDs using an atomic
// upsert `$inc` on a shared counter document. Reserving N in one call keeps a
// batch's IDs contiguous (no gaps from interleaved requests). Format:
//
//     CERT-<year>-<6-digit sequence>   e.g. CERT-2026-000042
//
// Because the sequence comes from a single monotonic counter, IDs never
// collide — even across concurrent bulk uploads.
async function generateCertificateIds(count = 1) {
    const n = Math.max(1, Math.floor(count));
    const counter = await Counter.findByIdAndUpdate(
        "cert",
        { $inc: { seq: n } },
        { new: true, upsert: true }
    );
    const start = counter.seq - n + 1;
    const year = new Date().getUTCFullYear();
    return Array.from(
        { length: n },
        (_, i) => `CERT-${year}-${String(start + i).padStart(6, "0")}`
    );
}

module.exports = { generateCertificateIds };