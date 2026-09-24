const express = require("express");
const router = express.Router();
const multer = require("multer");
const { upload } = require("../middleware/uploadMiddleware");
const certificateController = require("../controllers/certificateController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/authMiddleware");

// Protect every /api/certificates route — a valid JWT is required.
// Role-based checks (requireRole) are applied per-route below.
// EXCEPTION: GET /stats is public for homepage statistics display
router.use((req, res, next) => {
    if (req.method === 'GET' && req.path === '/stats') {
        return next();
    }
    return authMiddleware(req, res, next);
});

// Wrap multer so file-type / size errors return a clean 400 JSON instead of a 500 crash
const uploadSingle = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            const status = err.code === "INVALID_FILE_TYPE" || err instanceof multer.MulterError ? 400 : 500;
            return res.status(status).json({
                success: false,
                error: err.code || "UPLOAD_ERROR",
                message: err.message || "File upload failed."
            });
        }
        next();
    });
};

// Multi-file upload wrapper (accepts up to 50 PDFs)
const uploadMultiple = (req, res, next) => {
    upload.array("files", 50)(req, res, (err) => {
        if (err) {
            const status = err.code === "INVALID_FILE_TYPE" || err instanceof multer.MulterError ? 400 : 500;
            return res.status(status).json({
                success: false,
                error: err.code || "UPLOAD_ERROR",
                message: err.message || "File upload failed."
            });
        }
        next();
    });
};

// ── Admin-only: certificate issuance / bulk upload / revocation ──────────
// Blockchain signing happens in the browser (MetaMask). The backend only
// performs AI analysis, IPFS pinning, ID generation, and tx-receipt validation.
router.post("/analyze-batch",    requireRole("admin"), uploadMultiple,   certificateController.analyzeBatch);
router.post("/prepare-single",   requireRole("admin"), uploadSingle,     certificateController.prepareSingle);
router.post("/prepare-batch-mint", requireRole("admin"),                 certificateController.prepareBatchMint);
router.post("/record-mint",      requireRole("admin"),                   certificateController.recordMint);
router.post("/record-revoke",    requireRole("admin"),                   certificateController.recordRevoke);
router.delete("/clear",          requireRole("admin"),                   certificateController.clearAll);

// ── Any authenticated role (admin or student): dashboard / SBT claim ─────
// SBT claim is student-initiated — their own MetaMask signs the issueSBT tx
// and pays the gas (the SBT contract also allows the admin/owner to mint on
// their behalf).
router.post("/record-claim-sbt", requireRole("student"), certificateController.recordClaimSBT);
router.get("/stats",                                                       certificateController.getStats);

// ── Per-user dashboard stats ─────────────────────────────────────────────
// Admin sees only their issued certificates; student sees only their owned certificates.
router.get("/admin-stats", requireRole("admin"), certificateController.getAdminStats);
router.get("/student-stats", requireRole("student"), certificateController.getStudentStats);

// NOTE: GET /verify/:id is served publicly by publicRoutes.js (no JWT) so QR
// links work for anyone. It is intentionally not listed here.

module.exports = router;
