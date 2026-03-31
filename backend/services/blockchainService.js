const { ethers } = require("ethers");
require("dotenv").config();

const contractABI = require("../abis/Certificate.json");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    contractABI.abi,
    wallet
);

/**
 * Issues a certificate on-chain.
 * @param {string} id         - Unique certificate ID
 * @param {string} studentName
 * @param {string} course
 * @param {string} orgName
 * @param {string} ipfsHash   - IPFS CID of the uploaded file
 * @param {string} fileHash   - SHA-256 hex digest of the raw PDF bytes
 */
async function issueOnBlockchain(id, studentName, course, orgName, ipfsHash, fileHash) {
    const tx = await contract.issueCertificate(id, studentName, course, orgName, ipfsHash, fileHash);
    await tx.wait();
    return tx.hash;
}

/**
 * HACKATHON UPGRADE: Batch Issuance
 */
async function batchIssueOnBlockchain(ids, names, courses, orgs, ipfsHashes, fileHashes) {
    const tx = await contract.batchIssueCertificates(ids, names, courses, orgs, ipfsHashes, fileHashes);
    await tx.wait(); // Wait for confirmation
    return tx.hash;
}

/**
 * Fetches certificate data from the blockchain.
 * Returns { exists, studentName, course, orgName, ipfsHash, fileHash }
 */
async function verifyOnBlockchain(certId) {
    const result = await contract.verifyCertificate(certId);
    return {
        studentName: result.studentName,
        course:      result.course,
        orgName:     result.orgName,
        ipfsHash:    result.ipfsHash,
        fileHash:    result.fileHash,
        exists:      result.exists
    };
}

async function revokeOnBlockchain(hash) {
    const tx = await contract.revokeCertificate(hash);
    await tx.wait();
    return tx.hash;
}

// ─────────────────────────────────────────────
// SBT (Soulbound NFT) Interactions
// ─────────────────────────────────────────────
const sbtABI = require("../abis/SoulboundCertificate.json");
const sbtContract = new ethers.Contract(
    process.env.SBT_CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", // Replace or use ENV
    sbtABI.abi,
    wallet
);

async function issueSBTOnBlockchain(studentAddress, certId, ipfsHash) {
    // Generate the metadata URI pointing to the certificate PDF stored on IPFS
    const uri = `ipfs://${ipfsHash}`;
    const tx = await sbtContract.issueSBT(studentAddress, certId, uri);
    await tx.wait();
    return tx.hash;
}

module.exports = {
    issueOnBlockchain,
    batchIssueOnBlockchain,
    verifyOnBlockchain,
    revokeOnBlockchain,
    issueSBTOnBlockchain
};