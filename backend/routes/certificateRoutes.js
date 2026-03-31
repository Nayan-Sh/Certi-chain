const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const certificateController = require("../controllers/certificateController");

router.post("/issue", upload.single("file"), certificateController.issueCertificate);
router.post("/batch-issue", certificateController.batchIssueCertificates);
router.get("/verify/:id", certificateController.verifyCertificate);
router.post("/revoke", certificateController.revokeCertificate);
router.get("/stats", certificateController.getStats);
router.delete("/clear", certificateController.clearAll);
router.post("/claim-sbt", certificateController.claimSBT);

module.exports = router;