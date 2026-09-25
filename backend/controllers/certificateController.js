const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Certificate = require("../models/Certificate");
const { validateSinglePagePDF } = require("../middleware/uploadMiddleware");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const STAGING_DIR = path.join(UPLOAD_DIR, "staging");
const STAGING_MAX_AGE_MS = 2 * 60 * 60 * 1000; // abandoned analyze sessions expire after 2h

const { uploadToIPFS } = require("../services/ipfsService");
const { analyzeWithAI } = require("../services/aiServices");
const { generateCertificateIds } = require("../services/certificateIdService");
const { sendCertificateEmail } = require("../services/certificateEmailService");
const {
    verifyOnBlockchain,
    verifyTxReceipt,
    getCertificateContractInfo,
    getSBTContractInfo
} = require("../services/blockchainService");

// ─────────────────────────────────────────────
//  SHARED BATCH HELPERS
// ─────────────────────────────────────────────

/**
 * Deletes analyze-batch staging sessions older than STAGING_MAX_AGE_MS.
 * Runs opportunistically whenever a new batch is analyzed, so stale PDFs
 * never accumulate on disk even if the admin abandons a review mid-flow.
 */
function sweepStaleBatches() {
    try {
        if (!fs.existsSync(STAGING_DIR)) return;
        const now = Date.now();
        for (const entry of fs.readdirSync(STAGING_DIR)) {
            const dir = path.join(STAGING_DIR, entry);
            try {
                if (now - fs.statSync(dir).mtimeMs > STAGING_MAX_AGE_MS) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            } catch { /* already gone — ignore */ }
        }
    } catch { /* no staging dir — nothing to sweep */ }
}

/**
 * Runs the AI forensic pipeline over an array of uploaded PDFs and returns:
 *   results  — the per-file report shown in the UI (pass/reject + scores)
 *   valid    — the certificates that passed, with AI-extracted metadata
 *   rejectedCount
 * Shared by the one-step batch-issue flow and the two-step
 * analyze → review → mint flow, so both behave identically.
 */
async function analyzeFiles(files, metadata, orgName) {
    const results = [];
    const valid = [];
    let rejectedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = file.path;

        // Validate mimetype
        if (file.mimetype !== "application/pdf" && file.mimetype !== "application/x-pdf" && file.mimetype !== "application/octet-stream") {
            results.push({
                fileName: file.originalname,
                studentName: file.originalname,
                course: 'N/A',
                fileHash: 'N/A',
                status: 'INVALID_FORMAT',
                error: 'Only PDF files are allowed.',
                aiScore: 0,
                aiDetails: {},
                passed: false
            });
            rejectedCount++;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            continue;
        }

        const fileBuffer = fs.readFileSync(filePath);
        const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // Check PDF Magic Bytes (%PDF-)
        const magicBytes = fileBuffer.slice(0, 5).toString('ascii');
        if (magicBytes !== '%PDF-') {
            results.push({
                fileName: file.originalname,
                studentName: file.originalname,
                course: 'N/A',
                fileHash,
                status: 'INVALID_FORMAT',
                error: 'File is not a valid PDF document (magic bytes mismatch).',
                aiScore: 0,
                aiDetails: {},
                passed: false
            });
            rejectedCount++;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            continue;
        }

        // Validate single page and corruption
        const validation = await validateSinglePagePDF(fileBuffer);
        if (!validation.isValid) {
            results.push({
                fileName: file.originalname,
                studentName: file.originalname,
                course: 'N/A',
                fileHash,
                status: 'INVALID_FORMAT',
                error: validation.error,
                aiScore: 0,
                aiDetails: {},
                passed: false
            });
            rejectedCount++;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            continue;
        }

        // Only *user-provided* values are treated as ground truth for the AI
        // comparison. Trimmed empty strings are sent to the AI service as-is,
        // so it skips that field ("no expected value provided — skipping")
        // instead of failing a valid certificate against a placeholder like
        // 'N/A' or a filename-derived name.
        const meta = metadata[i] || {};
        const aiName = (meta.studentName || '').trim();
        const aiCourse = (meta.course || '').trim();
        const aiOrg = (meta.orgName || orgName || '').trim();

        // Values that get RECORDED (DB + on-chain). When the admin did not
        // provide metadata, these are overridden with AI-extracted fields
        // after analysis.
        let studentName = aiName || file.originalname.replace(/\.pdf$/i, '');
        let course = aiCourse || 'N/A';
        let certOrg = aiOrg || orgName || 'CertifyChain';

        let aiResult = null;
        try {
            aiResult = await analyzeWithAI(filePath, {
                studentName: aiName,
                course: aiCourse,
                orgName: aiOrg
            });
        } catch (aiErr) {
            // Hard AI rejection (document is NOT a valid certificate) or the
            // AI service was unreachable. `aiData` is only present when the
            // AI service actively returned a 400; a thrown error without it
            // is an AI-service/network failure.
            const isHardReject = !!aiErr.aiData;
            results.push({
                fileName: file.originalname,
                studentName,
                course,
                fileHash,
                status: isHardReject ? 'AI_REJECTED' : 'AI_ERROR',
                error: aiErr.message || 'AI analysis failed',
                aiScore: 0,
                aiDetails: aiErr.aiData?.details || {},
                passed: false
            });
            rejectedCount++;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            continue;
        }

        // SAFETY NET: a 200 response with a trust score of exactly 0 means the
        // AI did NOT recognize the document as a certificate at all. Reject so
        // a non-certificate can't slip through the lenient gate.
        const docType = aiResult.details?.document_type || 'unknown';
        const notCertificateForm = !['certificate', 'likely_certificate'].includes(docType);
        if (aiResult.trust_score === 0 && notCertificateForm) {
            results.push({
                fileName: file.originalname,
                studentName,
                course,
                fileHash,
                status: 'AI_REJECTED',
                aiScore: 0,
                aiMessage: aiResult.message || 'Document is not a certificate form',
                aiDetails: aiResult.details || {},
                passed: false
            });
            rejectedCount++;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            continue;
        }

        // USE AI-EXTRACTED FIELDS: when the admin did not provide per-file
        // metadata, use the values the AI extracted from the PDF itself. The
        // AI reads the certificate and populates the fields automatically.
        const extracted = aiResult.details?.extracted_fields || {};
        if (!aiName) studentName = extracted.student_name || studentName;
        if (!aiCourse) course = extracted.course || course;
        if (!aiOrg) certOrg = extracted.institution || certOrg;

        results.push({
            fileName: file.originalname,
            studentName,
            course,
            fileHash,
            status: 'AI_APPROVED',
            aiScore: aiResult.trust_score,
            aiMessage: aiResult.message || 'AI analysis completed',
            aiDetails: aiResult.details || {},
            passed: true
        });
        valid.push({ file, studentName, course, orgName: certOrg, fileHash, aiResult });
    }

    return { results, valid, rejectedCount };
}

/**
 * Loads a previously-staged batch (token), applies the review-grid corrections,
 * reserves certificate IDs and uploads each PDF to IPFS. Returns the full
 * certificate records ready to be signed in the browser — it performs NO
 * blockchain write and NO database write. The frontend signs the tx with
 * MetaMask, then calls /record-mint to persist the records.
 */
async function prepareBatchMint(req, res) {
    try {
        const { token, certificates, orgName } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, error: "NO_TOKEN", message: "Missing batch token." });
        }

        const stagingDir = path.join(STAGING_DIR, token);
        const manifestPath = path.join(stagingDir, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
            return res.status(404).json({
                success: false,
                error: "BATCH_EXPIRED",
                message: "Batch session not found or expired. Please re-analyze the files."
            });
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const corrections = Array.isArray(certificates) ? certificates : [];

        // Apply review-grid corrections; fall back to the AI-extracted values
        // recorded at analysis time for any field the admin left blank.
        const reviewed = manifest.staged.map((s, i) => {
            const c = corrections[i] || {};
            return {
                ...s,
                studentName: (c.studentName || '').trim() || s.studentName,
                course: (c.course || '').trim() || s.course,
                orgName: (c.orgName || '').trim() || manifest.orgName || 'CertifyChain'
            };
        });

        if (reviewed.length === 0) {
            return res.status(400).json({
                success: false,
                error: "ALL_REJECTED",
                message: "No certificates passed AI analysis."
            });
        }

        // Reserve sequential IDs up-front so the batch gets a contiguous,
        // human-friendly series (CERT-2026-000001, ...000002, ...).
        const certIds = await generateCertificateIds(reviewed.length);
        const records = [];

        // Parallelize IPFS uploads for speed (#2 fix)
        const ipfsResults = await Promise.all(
            reviewed.map(vc => {
                const fileBuffer = fs.readFileSync(vc.storedPath);
                return uploadToIPFS(fileBuffer);
            })
        );

        for (let i = 0; i < reviewed.length; i++) {
            const vc = reviewed[i];
            const ipfsHash = ipfsResults[i].cid;

            records.push({
                id: certIds[i],
                studentName: vc.studentName,
                course: vc.course,
                orgName: vc.orgName,
                hash: vc.fileHash,
                ipfsHash,
                aiScore: vc.aiResult.trust_score,
                aiDetails: vc.aiResult.details || vc.aiResult
            });
        }

        console.log(`[Prepare Batch] Prepared ${records.length} certificates for browser signing.`);

        // Per-file report: prepared (approved) results first, then the rejects.
        const results = reviewed.map((vc, i) => ({
            fileName: vc.originalName,
            studentName: vc.studentName,
            course: vc.course,
            fileHash: vc.fileHash,
            status: 'AI_APPROVED',
            aiScore: vc.aiResult.trust_score,
            aiDetails: vc.aiResult.details || {},
            passed: true,
            certificateId: certIds[i],
            ipfsHash: records[i].ipfsHash
        }));
        for (const r of manifest.results) {
            if (!r.passed) results.push(r);
        }

        // The staged session is spent once prepared — remove files + manifest.
        fs.rmSync(stagingDir, { recursive: true, force: true });

        res.json({
            success: true,
            totalFiles: manifest.results.length,
            approvedCount: reviewed.length,
            rejectedCount: manifest.rejectedCount || 0,
            records,
            results
        });
    } catch (err) {
        console.error("[Prepare Batch] Error:", err);
        res.status(500).json({ success: false, error: "PREPARE_ERROR", message: err.message });
    }
}

/**
 * After the admin signs the mint in MetaMask, records the on-chain mint in
 * MongoDB. Validates the reported txHash against the real chain receipt first
 * (status, target contract, signer) so a forged txHash can never produce a
 * database record. Optionally emails the certificate to the student.
 */
async function recordMint(req, res) {
    try {
        const { txHash, chainId, adminAddress, records } = req.body;

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ success: false, error: "NO_RECORDS", message: "No certificate records provided." });
        }
        if (!txHash || !chainId) {
            return res.status(400).json({ success: false, error: "INCOMPLETE", message: "txHash and chainId are required." });
        }

        // Confirm the reported tx really minted on the registered contract.
        const { address: certAddress } = await getCertificateContractInfo(chainId);
        await verifyTxReceipt(txHash, chainId, certAddress, adminAddress);

        // Pre-flight validation (Fix #4): read back the first record to ensure
        // the ID string signed via MetaMask exactly matches our DB string.
        const firstCertId = records[0].id;
        const onChainCheck = await verifyOnBlockchain(firstCertId, chainId);
        if (!onChainCheck.exists) {
            console.error(`[Record Mint] ID Mismatch: frontend minted an ID different from ${firstCertId}`);
            return res.status(400).json({ success: false, error: "ID_MISMATCH", message: "Certificate ID mismatch: The ID signed via MetaMask does not match the exact generated ID. Please try again." });
        }

        const networkId = Number(chainId);

        // Find student user IDs for records that have studentEmail
        const User = require("../models/User");
        const studentEmails = records
            .filter(r => r.studentEmail)
            .map(r => r.studentEmail.trim().toLowerCase());

        let studentMap = {};
        if (studentEmails.length > 0) {
            const students = await User.find({ email: { $in: studentEmails }, role: 'student' });
            studentMap = Object.fromEntries(students.map(s => [s.email, s._id]));
        }

        const docs = records.map(r => ({
            id: r.id,
            studentName: r.studentName,
            studentEmail: r.studentEmail || null,
            studentId: r.studentEmail ? studentMap[r.studentEmail.trim().toLowerCase()] : null,
            course: r.course,
            orgName: r.orgName,
            hash: r.hash,
            ipfsHash: r.ipfsHash,
            txHash,
            chainId: networkId,
            aiScore: r.aiScore,
            aiDetails: r.aiDetails,
            revoked: false,
            issuedBy: req.user.id // Admin who issued this certificate
        }));

        await Certificate.insertMany(docs);

        // Optional email — fire-and-forget (never blocks or fails issuance)
        for (const r of records) {
            if (r.studentEmail) {
                sendCertificateEmail({
                    to: r.studentEmail.trim(),
                    studentName: r.studentName,
                    course: r.course,
                    orgName: r.orgName,
                    certId: r.id,
                    txHash,
                }).catch(err => console.error("[CertEmail] delivery failed:", err.message));
            }
        }

        console.log(`[Record Mint] Recorded ${records.length} certificates. TX: ${txHash}`);

        res.json({ success: true, mintedCount: records.length, txHash });
    } catch (err) {
        console.error("[Record Mint] Error:", err);
        res.status(500).json({ success: false, error: "RECORD_ERROR", message: err.message });
    }
}

// ─────────────────────────────────────────────
//  PREPARE SINGLE (browser-signing step 1)
// ─────────────────────────────────────────────
exports.prepareSingle = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "NO_FILE", message: "No PDF file uploaded." });
        }
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);

        // 1️⃣ SHA-256 hash of the raw PDF bytes — this is what goes on-chain
        const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // 2️⃣ Format Validation - use shared validation function
        if (req.file.mimetype !== "application/pdf" && req.file.mimetype !== "application/x-pdf" && req.file.mimetype !== "application/octet-stream") {
            fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, error: "INVALID_FORMAT", message: "Only PDF files are allowed." });
        }

        // Check PDF Magic Bytes (%PDF-)
        const magicBytes = fileBuffer.slice(0, 5).toString('ascii');
        if (magicBytes !== '%PDF-') {
            fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, error: "INVALID_FORMAT", message: "File is not a valid PDF document (magic bytes mismatch)." });
        }

        const validation = await validateSinglePagePDF(fileBuffer);
        if (!validation.isValid) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ success: false, error: "INVALID_FORMAT", message: validation.error });
        }

        // 3️⃣ AI authenticity check — run BEFORE any signing
        const aiResult = await analyzeWithAI(filePath, {
            studentName: req.body.studentName,
            course: req.body.course,
            orgName: req.body.orgName
        });

        // 🚫 GATE: Reject outright if AI trust score is too low
        if (aiResult.trust_score < 40) {
            fs.unlinkSync(filePath);
            const rejectionMsg = aiResult.message || aiResult.details?.llm_forensic_report ||
                `Upload rejected by AI forensic analysis. Trust Score: ${aiResult.trust_score}%.`;
            return res.status(403).json({
                success: false,
                error: "AI_REJECTED",
                message: rejectionMsg,
                aiAnalysis: aiResult
            });
        }

        // 3️⃣ Upload file to IPFS (for decentralised storage / retrieval)
        const ipfsResult = await uploadToIPFS(fileBuffer);
        const ipfsHash = ipfsResult.cid; // Extract CID from {cid, isDemo}

        // 4️⃣ Reserve a sequential, human-friendly certificate ID
        const [certId] = await generateCertificateIds(1);

        // The uploaded file is spent (IPFS has the bytes) — clean it up.
        fs.unlinkSync(filePath);

        console.log(`[Prepare Single] Prepared ${certId} for browser signing.`);

        // No blockchain write here — the admin signs the mint in MetaMask, then
        // the frontend calls /record-mint with these records + the txHash.
        res.json({
            success: true,
            record: {
                id: certId,
                studentName: req.body.studentName,
                studentEmail: req.body.studentEmail || null,
                course: req.body.course,
                orgName: req.body.orgName,
                hash: fileHash,
                ipfsHash,
                aiScore: aiResult.trust_score,
                aiDetails: aiResult.details
            },
            fileHash,
            aiAnalysis: aiResult
        });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        if (err.aiData) {
            // AI service rejected the document — pass through full analysis data
            return res.status(400).json({
                success: false,
                error: err.aiData.error || "AI_VALIDATION_FAILED",
                message: err.message,
                details: err.aiData.details,
                aiAnalysis: {
                    trust_score: err.aiData.trust_score ?? 0,
                    is_safe: false,
                    message: err.aiData.message || err.message,
                    details: err.aiData.details || {},
                }
            });
        }

        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  PREPARE BATCH MINT (browser-signing step 1)
// ─────────────────────────────────────────────
exports.prepareBatchMint = prepareBatchMint;

// ─────────────────────────────────────────────
//  RECORD MINT (browser-signing step 2)
// ─────────────────────────────────────────────
exports.recordMint = recordMint;

// ─────────────────────────────────────────────
//  ANALYZE BATCH (two-step: analyze → review → mint)
// ─────────────────────────────────────────────
exports.analyzeBatch = async (req, res) => {
    const uploadedPaths = [];
    try {
        const files = req.files;
        let metadata = [];
        try {
            metadata = JSON.parse(req.body.metadata || "[]");
        } catch {
            metadata = [];
        }

        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                error: "NO_FILES",
                message: "Please upload at least one PDF certificate file."
            });
        }

        // Opportunistically clear abandoned staging sessions
        sweepStaleBatches();

        const token = crypto.randomBytes(16).toString("hex");
        const stagingDir = path.join(STAGING_DIR, token);
        fs.mkdirSync(stagingDir, { recursive: true });

        console.log(`[Analyze Batch] Analyzing ${files.length} PDF certificates...`);
        uploadedPaths.push(...files.map(f => f.path));

        const { results, valid, rejectedCount } = await analyzeFiles(files, metadata, req.body.orgName);

        // Stage the approved files for the upcoming mint step, carrying the
        // AI-extracted metadata so corrections fall back to them.
        const staged = valid.map((vc, i) => ({
            originalName: vc.file.originalname,
            storedPath: path.join(stagingDir, `${i}-${crypto.randomBytes(4).toString("hex")}.pdf`),
            fileHash: vc.fileHash,
            aiResult: vc.aiResult,
            studentName: vc.studentName,
            course: vc.course,
            orgName: vc.orgName
        }));
        for (let i = 0; i < valid.length; i++) {
            fs.copyFileSync(valid[i].file.path, staged[i].storedPath);
        }

        fs.writeFileSync(
            path.join(stagingDir, "manifest.json"),
            JSON.stringify({ orgName: req.body.orgName || '', results, staged, rejectedCount }, null, 2)
        );

        // Uploaded originals are no longer needed — staged copies exist
        for (const p of uploadedPaths) {
            if (fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch {}
            }
        }

        res.json({
            success: true,
            token,
            totalFiles: files.length,
            approvedCount: valid.length,
            rejectedCount,
            results
        });
    } catch (err) {
        console.error("[Analyze Batch] Error:", err);
        for (const p of uploadedPaths) {
            if (fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch {}
            }
        }
        res.status(500).json({
            success: false,
            error: "ANALYZE_ERROR",
            message: err.message
        });
    }
};

// ─────────────────────────────────────────────
//  VERIFY
// ─────────────────────────────────────────────
exports.verifyCertificate = async (req, res) => {
    try {
        // Normalize certId — trim whitespace and uppercase to match on-chain string exactly
        const certId = (req.params.id || '').trim().toUpperCase();
        if (!certId) {
            return res.status(400).json({ verified: false, error: "Certificate ID is required" });
        }
        const submittedFileHash = req.query.fileHash || null;

        // The DB record knows which network this cert was minted on; fall back
        // to Sepolia when no record exists.
        const dbCert = await Certificate.findOne({ id: certId });
        const chainId = (dbCert && dbCert.chainId) || 11155111;

        // 1️⃣ Fetch from blockchain (on the cert's network)
        const data = await verifyOnBlockchain(certId, chainId);

        if (!data.exists) {
            return res.status(404).json({
                verified: false,
                error: "Certificate not found on blockchain ledger",
                certId,
                chainId,
                hint: dbCert
                    ? `Certificate exists in DB but not found on contract at chainId=${chainId}. The contract may have been redeployed.`
                    : `No database record found for this ID either. Confirm the ID is correct.`
            });
        }

        // 2️⃣ Compare file hashes
        let hashMatch = null;
        if (submittedFileHash) {
            hashMatch = (submittedFileHash.toLowerCase() === data.fileHash.toLowerCase());
        }

        // 3️⃣ Overall verdict. Revocation is authoritative from the chain — a
        //    revoked cert shows red regardless of the DB flag.
        const verified = hashMatch !== false && !data.revoked;

        res.json({
            verified,
            hashMatch,
            id:                certId,
            chainId,           // the network this cert was minted on — used by the SBT claim + explorer links
            storedFileHash:    data.fileHash,
            submittedFileHash,
            studentName:       data.studentName,
            course:            data.course,
            orgName:           data.orgName,
            ipfsHash:          data.ipfsHash,
            txHash:            dbCert ? dbCert.txHash : null,
            revoked:           data.revoked,
            issuedAt:          dbCert ? dbCert.createdAt : null,
            aiScore:           dbCert ? dbCert.aiScore : null,
            aiDetails:         dbCert ? dbCert.aiDetails : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  RECORD REVOKE (browser-signed on-chain revoke)
// ─────────────────────────────────────────────
exports.recordRevoke = async (req, res) => {
    try {
        const { txHash, chainId, id, adminAddress } = req.body;
        if (!id) return res.status(400).json({ error: "Certificate ID required" });
        if (!txHash || !chainId) {
            return res.status(400).json({ error: "txHash and chainId are required" });
        }

        // Confirm the reported tx really revoked on the registered contract.
        const { address: certAddress } = await getCertificateContractInfo(chainId);
        await verifyTxReceipt(txHash, chainId, certAddress, adminAddress);

        // Mark as revoked in MongoDB for dashboard stats + audit.
        await Certificate.updateOne({ id }, { revoked: true });

        res.json({ success: true, revoked: true, id, txHash });
    } catch (err) {
        console.error("[Record Revoke] Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  STATS (for Dashboard)
// ─────────────────────────────────────────────
exports.getStats = async (req, res) => {
    try {
        const total   = await Certificate.countDocuments();
        const revoked = await Certificate.countDocuments({ revoked: true });

        // Time-range filtering: accept '24h', '7d', '30d' (default '24h')
        const timeRange = req.query.timeRange || '24h';
        const rangeMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
        const since = new Date(Date.now() - (rangeMs[timeRange] || rangeMs['24h']));
        const issuedToday = await Certificate.countDocuments({ createdAt: { $gte: since } });

        // Average AI trust score
        const scoreAgg = await Certificate.aggregate([
            { $group: { _id: null, avg: { $avg: "$aiScore" } } }
        ]);
        const avgAiScore = scoreAgg.length > 0 ? Math.round(scoreAgg[0].avg) : 0;

        // Unique partner institutions (distinct orgNames)
        const partnerInstitutions = await Certificate.distinct("orgName");
        const partnerCount = partnerInstitutions.filter(Boolean).length;

        // Unique students onboarded (distinct studentName + course combination)
        const studentsOnboarded = await Certificate.distinct("studentName");
        const studentCount = studentsOnboarded.filter(Boolean).length;

        // Fraud prevention rate: percentage of certificates with high trust score (>=80)
        const highTrustCount = await Certificate.countDocuments({ aiScore: { $gte: 80 } });
        const fraudPreventionRate = total > 0 ? ((highTrustCount / total) * 100).toFixed(1) : 0;

        // Recent 5 certificates
        const recent = await Certificate.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("id studentName course orgName aiScore createdAt revoked");

        res.json({
            total,
            revoked,
            issuedToday,
            avgAiScore,
            recent,
            partnerInstitutions: partnerCount,
            studentsOnboarded: studentCount,
            fraudPreventionRate: parseFloat(fraudPreventionRate)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  ADMIN STATS (per-admin dashboard)
// ─────────────────────────────────────────────
exports.getAdminStats = async (req, res) => {
    try {
        const adminId = req.user.id; // Admin who is logged in

        const total   = await Certificate.countDocuments({ issuedBy: adminId });
        const revoked = await Certificate.countDocuments({ issuedBy: adminId, revoked: true });

        // Time-range filtering: accept '24h', '7d', '30d' (default '24h')
        const timeRange = req.query.timeRange || '24h';
        const rangeMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
        const since = new Date(Date.now() - (rangeMs[timeRange] || rangeMs['24h']));
        const issuedToday = await Certificate.countDocuments({ issuedBy: adminId, createdAt: { $gte: since } });

        // Average AI trust score for this admin's certificates
        const scoreAgg = await Certificate.aggregate([
            { $match: { issuedBy: adminId, aiScore: { $exists: true, $ne: null } } },
            { $group: { _id: null, avg: { $avg: "$aiScore" } } }
        ]);
        const avgAiScore = scoreAgg.length > 0 ? Math.round(scoreAgg[0].avg) : 0;

        // Unique partner institutions (distinct orgNames) for this admin
        const partnerInstitutions = await Certificate.distinct("orgName", { issuedBy: adminId });
        const partnerCount = partnerInstitutions.filter(Boolean).length;

        // Unique students onboarded (distinct studentName) for this admin
        const studentsOnboarded = await Certificate.distinct("studentName", { issuedBy: adminId });
        const studentCount = studentsOnboarded.filter(Boolean).length;

        // Fraud prevention rate: percentage of certificates with high trust score (>=80)
        const highTrustCount = await Certificate.countDocuments({ issuedBy: adminId, aiScore: { $gte: 80 } });
        const fraudPreventionRate = total > 0 ? ((highTrustCount / total) * 100).toFixed(1) : 0;

        // Recent 5 certificates issued by this admin
        const recent = await Certificate.find({ issuedBy: adminId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select("id studentName course orgName aiScore createdAt revoked");

        res.json({
            total,
            revoked,
            issuedToday,
            avgAiScore,
            recent,
            partnerInstitutions: partnerCount,
            studentsOnboarded: studentCount,
            fraudPreventionRate: parseFloat(fraudPreventionRate)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  STUDENT STATS (per-student dashboard)
// ─────────────────────────────────────────────
exports.getStudentStats = async (req, res) => {
    try {
        const studentId = req.user.id; // Student who is logged in

        const total   = await Certificate.countDocuments({ studentId });
        const revoked = await Certificate.countDocuments({ studentId, revoked: true });

        // Recent 10 certificates for this student
        const recent = await Certificate.find({ studentId })
            .sort({ createdAt: -1 })
            .limit(10)
            .select("id studentName course orgName aiScore createdAt revoked txHash sbtTxHash chainId ipfsHash");

        // Average AI trust score
        const scoreAgg = await Certificate.aggregate([
            { $match: { studentId, aiScore: { $exists: true, $ne: null } } },
            { $group: { _id: null, avg: { $avg: "$aiScore" } } }
        ]);
        const avgAiScore = scoreAgg.length > 0 ? Math.round(scoreAgg[0].avg) : 0;

        // Unique courses
        const courses = await Certificate.distinct("course", { studentId });
        const courseCount = courses.filter(Boolean).length;

        // Unique institutions
        const institutions = await Certificate.distinct("orgName", { studentId });
        const institutionCount = institutions.filter(Boolean).length;

        res.json({
            total,
            revoked,
            avgAiScore,
            recent,
            courses: courseCount,
            institutions: institutionCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  CLEAR ALL (Dashboard reset)
// ─────────────────────────────────────────────
exports.clearAll = async (req, res) => {
    try {
        const result = await Certificate.deleteMany({});
        res.json({ cleared: true, deletedCount: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  RECORD CLAIM SBT (browser-signed student claim)
// ─────────────────────────────────────────────
exports.recordClaimSBT = async (req, res) => {
    try {
        const { txHash, chainId, certId, studentAddress } = req.body;

        if (!studentAddress || !certId || !txHash || !chainId) {
            return res.status(400).json({ error: "Missing required fields for NFT claim." });
        }

        // Confirm the reported tx really minted the SBT on the SBT contract.
        const { address: sbtAddress } = await getSBTContractInfo(chainId);
        await verifyTxReceipt(txHash, chainId, sbtAddress, studentAddress);

        // Mirror the claim in MongoDB (soulbound NFT is already on-chain).
        await Certificate.updateOne({ id: certId }, { sbtTxHash: txHash });

        res.json({
            success: true,
            message: "Soulbound Token successfully minted to student wallet.",
            txHash
        });
    } catch (err) {
        console.error("[Record SBT Claim] Error:", err);
        res.status(500).json({ error: err.message });
    }
};
