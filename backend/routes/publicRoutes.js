const express = require("express");
const router = express.Router();
const certificateController = require("../controllers/certificateController");

// ── Public, read-only verification ─────────────────────────────────────────
// No JWT required here on purpose: the QR code printed on every certificate
// links to /api/certificates/verify/:id so employers / recruiters / anyone can
// confirm authenticity without an account. Certificate issuance, revocation and
// batch uploads remain admin-only (see certificateRoutes.js).
router.get("/verify/:id", certificateController.verifyCertificate);

module.exports = router;
