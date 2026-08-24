const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");

/**
 * Uploads a file buffer to IPFS via Pinata.
 * Returns the actual decentralized IPFS CID and a flag indicating demo mode.
 */
async function uploadToIPFS(fileBuffer) {
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
        const formData = new FormData();
        formData.append("file", fileBuffer, { filename: `certificate-${Date.now()}.pdf` });

        const response = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
            headers: {
                ...formData.getHeaders(),
                pinata_api_key: process.env.PINATA_API_KEY,
                pinata_secret_api_key: process.env.PINATA_API_SECRET,
            },
        });

        console.log(`[IPFS] Successfully pinned via Pinata! CID: ${response.data.IpfsHash}`);
        return { cid: response.data.IpfsHash, isDemo: false };
    } catch (error) {
        console.error("[IPFS] Error uploading to Pinata:", error.response?.data || error.message);
        throw new Error("Failed to upload to IPFS. Check Pinata API keys.");
    }
}

module.exports = { uploadToIPFS };