const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB
const PINATA_MAX_ATTEMPTS = 3;
const PINATA_RETRY_DELAY_MS = 500;

function assertPdfSizeLimit(fileBuffer) {
    const size = fileBuffer ? fileBuffer.length : 0;
    if (!fileBuffer || size === 0) {
        throw new Error("Cannot upload an empty PDF to IPFS.");
    }
    if (size > MAX_PDF_BYTES) {
        throw new Error(`PDF exceeds the 5MB size limit (${(size / (1024 * 1024)).toFixed(2)}MB).`);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pinFileToPinata(fileBuffer) {
    let lastError;
    for (let attempt = 1; attempt <= PINATA_MAX_ATTEMPTS; attempt++) {
        try {
            const formData = new FormData();
            formData.append("file", fileBuffer, { filename: `certificate-${Date.now()}.pdf` });

            const response = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
                headers: {
                    ...formData.getHeaders(),
                    pinata_api_key: process.env.PINATA_API_KEY,
                    pinata_secret_api_key: process.env.PINATA_API_SECRET,
                },
            });
            return response;
        } catch (error) {
            lastError = error;
            console.warn(
                `[IPFS] Pinata upload attempt ${attempt}/${PINATA_MAX_ATTEMPTS} failed:`,
                error.response?.data || error.message
            );
            if (attempt < PINATA_MAX_ATTEMPTS) {
                await sleep(PINATA_RETRY_DELAY_MS * attempt);
            }
        }
    }
    throw lastError;
}

/**
 * Uploads a file buffer to IPFS via Pinata.
 * Returns the actual decentralized IPFS CID and a flag indicating demo mode.
 */
async function uploadToIPFS(fileBuffer) {
    assertPdfSizeLimit(fileBuffer);

    if (!process.env.PINATA_API_KEY || !process.env.PINATA_API_SECRET) {
        console.warn("⚠️ Pinata API keys missing from .env, falling back to local simulation...");
        // Generate a fake but valid-looking CIDv0 for demo purposes
        // In production, you MUST use real Pinata API keys
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        // Create a base58-like string for the fake CID
        const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let fakeHash = '';
        for (let i = 0; i < 44; i++) {
            const byte = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
            fakeHash += base58Chars[byte % 58];
        }
        const fakeCID = "Qm" + fakeHash;
        console.log(`[IPFS] Generated demo CID: ${fakeCID}`);
        return { cid: fakeCID, isDemo: true };
    }

    try {
        const response = await pinFileToPinata(fileBuffer);
        console.log(`[IPFS] Successfully pinned via Pinata! CID: ${response.data.IpfsHash}`);
        return { cid: response.data.IpfsHash, isDemo: false };
    } catch (error) {
        console.error("[IPFS] Error uploading to Pinata:", error.response?.data || error.message);
        throw new Error("Failed to upload to IPFS. Check Pinata API keys.");
    }
}

module.exports = { uploadToIPFS };