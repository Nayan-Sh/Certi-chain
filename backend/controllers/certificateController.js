const fs = require("fs");
const crypto = require("crypto");
const Certificate = require("../models/Certificate");

const { uploadToIPFS } = require("../services/ipfsService");
const { analyzeWithAI } = require("../services/aiServices");
const {
    issueOnBlockchain,
    batchIssueOnBlockchain,
    verifyOnBlockchain,
    revokeOnBlockchain,
    issueSBTOnBlockchain
} = require("../services/blockchainService");

// ─────────────────────────────────────────────
//  ISSUE
// ─────────────────────────────────────────────
exports.issueCertificate = async (req, res) => {
    try {
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);

        // 1️⃣ SHA-256 hash of the raw PDF bytes — this is what goes on-chain
        const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // 2️⃣ AI authenticity check — run BEFORE any blockchain writes
        const aiResult = await analyzeWithAI(filePath, {
            studentName: req.body.studentName,
            course: req.body.course,
            orgName: req.body.orgName
        });

        // 🚫 GATE: Reject outright if AI trust score is too low
        if (aiResult.trust_score < 40) {
            fs.unlinkSync(filePath);
            return res.status(403).json({
                success: false,
                error: "AI_REJECTED",
                message: `Upload rejected by AI forensic analysis. Trust Score: ${aiResult.trust_score}%. The document could not be verified as a legitimate certificate.`,
                aiAnalysis: aiResult
            });
        }

        // 3️⃣ Upload file to IPFS (for decentralised storage / retrieval)
        const ipfsHash = await uploadToIPFS(fileBuffer);

        // 4️⃣ Store on blockchain: ID + metadata + IPFS ref + file hash
        const txHash = await issueOnBlockchain(
            req.body.id,
            req.body.studentName,
            req.body.course,
            req.body.orgName,
            ipfsHash,
            fileHash
        );

        // 5️⃣ Save metadata in MongoDB (mirror of on-chain data + AI results)
        const certificate = await Certificate.create({
            id: req.body.id,
            studentName: req.body.studentName,
            course: req.body.course,
            orgName: req.body.orgName,
            hash: fileHash,
            ipfsHash,
            txHash,
            aiScore: aiResult.trust_score,
            aiDetails: aiResult.details,
            revoked: false
        });

        fs.unlinkSync(filePath);

        res.json({
            success: true,
            certificate,
            fileHash,
            txHash,
            aiAnalysis: aiResult
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  BATCH ISSUE (HACKATHON UPGRADE)
// ─────────────────────────────────────────────
exports.batchIssueCertificates = async (req, res) => {
    try {
        const { certificates } = req.body; // Array of objects: { id, studentName, course, orgName, pdfUrl/base64 (mocked for this hackathon demo) }
        
        if (!certificates || !Array.isArray(certificates) || certificates.length === 0) {
            return res.status(400).json({ error: "Invalid array of certificates provided." });
        }

        console.log(`[Batch Issue] Starting batch minting for ${certificates.length} certificates...`);

        // Prepare arrays for the smart contract
        const ids = [];
        const names = [];
        const courses = [];
        const orgs = [];
        const ipfsHashes = [];
        const fileHashes = [];
        const dbRecords = [];

        // 1. Process each certificate (Simulating file upload & hashing for the batch demo)
        for (const cert of certificates) {
            const { id, studentName, course, orgName } = cert;
            
            // For a real batch upload, you'd process real files or generated PDFs here.
            // For this UI demo, we simulate a PDF file buffer based on the student's name.
            const simulatedBuffer = Buffer.from(`Simulated PDF content for ${studentName} - ${course} ID: ${id}`);
            const fileHash = crypto.createHash("sha256").update(simulatedBuffer).digest("hex");
            
            // Skip the slow AI check on batch uploads to simulate "Trusted Enterprise Status", 
            // but still upload them to IPFS to get decentralized CIDs!
            const ipfsHash = await uploadToIPFS(simulatedBuffer);

            ids.push(id);
            names.push(studentName);
            courses.push(course);
            orgs.push(orgName);
            ipfsHashes.push(ipfsHash);
            fileHashes.push(fileHash);

            dbRecords.push({
                id,
                studentName,
                course,
                orgName,
                hash: fileHash,
                ipfsHash,
                aiScore: 100, // Trusted Enterprise Batch implies 100 score
                aiDetails: { notes: "Batch Issued — Trusted Enterprise Origin" },
                revoked: false
            });
        }

        // 2. Batch Mint to Blockchain
        console.log("[Batch Issue] Waiting for blockchain transaction...");
        const txHash = await batchIssueOnBlockchain(ids, names, courses, orgs, ipfsHashes, fileHashes);
        
        // 3. Save to MongoDB
        const recordsWithTx = dbRecords.map(doc => ({ ...doc, txHash }));
        await Certificate.insertMany(recordsWithTx);

        console.log(`[Batch Issue] Successfully minted! TX: ${txHash}`);

        res.json({
            success: true,
            mintedCount: certificates.length,
            txHash,
            certificates: recordsWithTx
        });

    } catch (err) {
        console.error("[Batch Issue] Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  VERIFY
// ─────────────────────────────────────────────
exports.verifyCertificate = async (req, res) => {
    try {
        const certId = req.params.id;
        const submittedFileHash = req.query.fileHash || null;

        // 1️⃣ Fetch from blockchain
        const data = await verifyOnBlockchain(certId);

        if (!data.exists) {
            return res.status(404).json({
                verified: false,
                error: "Certificate not found on blockchain ledger"
            });
        }

        // 2️⃣ Compare file hashes
        let hashMatch = null;
        if (submittedFileHash) {
            hashMatch = (submittedFileHash.toLowerCase() === data.fileHash.toLowerCase());
        }

        // 3️⃣ Fetch AI details from MongoDB (stored at issuance time)
        const dbCert = await Certificate.findOne({ id: certId });

        // 4️⃣ Overall verdict
        const verified = hashMatch !== false;

        res.json({
            verified,
            hashMatch,
            id:                certId,
            storedFileHash:    data.fileHash,
            submittedFileHash,
            studentName:       data.studentName,
            course:            data.course,
            orgName:           data.orgName,
            ipfsHash:          data.ipfsHash,
            txHash:            dbCert ? dbCert.txHash : null,
            revoked:           dbCert ? dbCert.revoked : false,
            issuedAt:          dbCert ? dbCert.createdAt : null,
            aiScore:           dbCert ? dbCert.aiScore : null,
            aiDetails:         dbCert ? dbCert.aiDetails : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
//  REVOKE
// ─────────────────────────────────────────────
exports.revokeCertificate = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: "Certificate ID required" });

        // Mark as revoked in MongoDB for dashboard stats
        await Certificate.updateOne({ id }, { revoked: true });

        res.json({ revoked: true, id });
    } catch (err) {
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

        // "Verified today" = documents created in the last 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const issuedToday = await Certificate.countDocuments({ createdAt: { $gte: since } });

        // Average AI trust score
        const scoreAgg = await Certificate.aggregate([
            { $group: { _id: null, avg: { $avg: "$aiScore" } } }
        ]);
        const avgAiScore = scoreAgg.length > 0 ? Math.round(scoreAgg[0].avg) : 0;

        // Recent 5 certificates
        const recent = await Certificate.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("id studentName course orgName aiScore createdAt revoked");

        res.json({ total, revoked, issuedToday, avgAiScore, recent });
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
//  SBT (SOULBOUND NFT) CLAIM
// ─────────────────────────────────────────────
exports.claimSBT = async (req, res) => {
    try {
        const { studentAddress, certId, ipfsHash } = req.body;
        
        if (!studentAddress || !certId || !ipfsHash) {
            return res.status(400).json({ error: "Missing required fields for NFT claim." });
        }

        // Must run on the backend to use the Admin's protocol wallet gas funds
        const txHash = await issueSBTOnBlockchain(studentAddress, certId, ipfsHash);

        res.json({
            success: true,
            message: "Soulbound Token successfully minted to student wallet.",
            txHash
        });
    } catch (err) {
        console.error("[SBT Claim] Error:", err);
        res.status(500).json({ error: err.message });
    }
};