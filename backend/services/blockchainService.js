const { ethers } = require("ethers");
require("dotenv").config({ override: true });

const contractABI = require("../abis/Certificate.json");
const sbtABI = require("../abis/SoulboundCertificate.json");
const ContractConfig = require("../models/ContractConfig");
const { getNetwork } = require("../config/networks");

const certInterface = new ethers.Interface(contractABI.abi);
const sbtInterface = new ethers.Interface(sbtABI.abi);
const CERTIFICATE_ISSUED_TOPIC = certInterface.getEvent("CertificateIssued").topicHash.toLowerCase();
const CERTIFICATE_REVOKED_TOPIC = certInterface.getEvent("CertificateRevoked").topicHash.toLowerCase();
const SBT_TRANSFER_TOPIC = sbtInterface.getEvent("Transfer").topicHash.toLowerCase();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 4, delayMs = 700, label = "RPC" } = {}) {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            console.warn(`[Blockchain] ${label} attempt ${i}/${attempts} failed: ${err.message}`);
            if (i < attempts) await sleep(delayMs * i);
        }
    }
    throw lastErr;
}

// ── Read-only provider ──────────────────────────────────────────────────────
// The backend never holds a private key and never signs transactions. All
// on-chain WRITES happen in the browser via the admin's MetaMask wallet. The
// backend only reads the chain: verification, and validating tx receipts that
// the frontend reports after a successful signature.
function getProvider(chainId) {
    const net = getNetwork(chainId);
    return new ethers.JsonRpcProvider(net.rpc, Number(chainId), {
        staticNetwork: true,
        batchMaxCount: 1,
    });
}

// Resolve the deployed contract addresses for a given network. The admin deploys
// from the dApp (MetaMask) and registers the addresses via
// POST /api/contract/register, which persists them in a ContractConfig document
// keyed by chainId. That DB record is the source of truth; backend/.env is only
// a fallback so the service still works if the DB is unreachable.
async function getRegisteredAddresses(chainId) {
    const requestedChainId = Number(chainId);
    try {
        let config = await ContractConfig.findOne({
            $or: [{ _id: requestedChainId.toString() }, { chainId: requestedChainId }]
        }).lean();

        // Legacy singleton is only valid when it was registered for this same chain.
        if (!config) {
            const singleton = await ContractConfig.findById("singleton").lean();
            // A legacy address without a chain ID is ambiguous. Only treat it
            // as the old Sepolia deployment; never reuse it on another chain.
            if (singleton && (Number(singleton.chainId) === requestedChainId ||
                (!singleton.chainId && requestedChainId === 11155111))) {
                config = singleton;
            }
        }

        if (config && config.certAddress && config.sbtAddress) {
            if (config.chainId && Number(config.chainId) !== requestedChainId) {
                console.warn(`[Blockchain] Ignoring ContractConfig ${config._id}: chainId ${config.chainId} != ${requestedChainId}`);
            } else {
                const normalizedCertAddress = ethers.getAddress(config.certAddress);
                const normalizedSbtAddress = ethers.getAddress(config.sbtAddress);
                console.log(`[Blockchain] ✓ Resolved from MongoDB: certAddress=${normalizedCertAddress} sbtAddress=${normalizedSbtAddress} chainId=${requestedChainId}`);
                return { certAddress: normalizedCertAddress, sbtAddress: normalizedSbtAddress };
            }
        } else {
            console.warn(`[Blockchain] No ContractConfig in MongoDB for chainId=${requestedChainId}`);
        }
    } catch (err) {
        console.warn(`[Blockchain] DB error: ${err.message}`);
    }

    // Safe fallback to .env if DB record is absent but env vars are configured
    // Legacy .env addresses have no chain metadata, so they are only safe as
    // the documented Sepolia fallback.
    if (requestedChainId === 11155111 && process.env.CONTRACT_ADDRESS && process.env.SBT_CONTRACT_ADDRESS && ethers.isAddress(process.env.CONTRACT_ADDRESS) && ethers.isAddress(process.env.SBT_CONTRACT_ADDRESS)) {
        const certAddress = ethers.getAddress(process.env.CONTRACT_ADDRESS);
        const sbtAddress = ethers.getAddress(process.env.SBT_CONTRACT_ADDRESS);
        console.log(`[Blockchain] ⚠️ Fallback to .env: certAddress=${certAddress} sbtAddress=${sbtAddress} chainId=${requestedChainId}`);
        return { certAddress, sbtAddress };
    }

    throw new Error(`No contracts deployed for chainId ${requestedChainId}. Please deploy contracts first via the Deploy Contracts panel.`);
}

// Public RPCs time out often — don't block mint/info on a live bytecode probe.
// Registration already verified code at deploy time.
async function getCertificateContractInfo(chainId) {
    const { certAddress } = await getRegisteredAddresses(chainId);
    if (!certAddress) {
        throw new Error("No Certificate contract registered for this network — deploy from the dApp first.");
    }
    return { address: ethers.getAddress(certAddress), abi: contractABI.abi, chainId: Number(chainId) };
}

async function getSBTContractInfo(chainId) {
    const { sbtAddress } = await getRegisteredAddresses(chainId);
    if (!sbtAddress) {
        throw new Error("No SoulboundCertificate contract registered for this network — deploy from the dApp first.");
    }
    return { address: ethers.getAddress(sbtAddress), abi: sbtABI.abi, chainId: Number(chainId) };
}

// ── Read-only verification ──────────────────────────────────────────────────
async function verifyOnBlockchain(certId, chainId) {
    const { address, abi } = await getCertificateContractInfo(chainId);
    console.log(`[Blockchain] verifyOnBlockchain: certId="${certId}" contract=${address} chainId=${chainId}`);
    const contract = new ethers.Contract(address, abi, getProvider(chainId));
    const result = await contract.verifyCertificate(certId);
    console.log(`[Blockchain] verifyCertificate result: exists=${result.exists} revoked=${result.revoked} name="${result.studentName}"`);
    return {
        studentName: result.studentName,
        course:      result.course,
        orgName:     result.orgName,
        ipfsHash:    result.ipfsHash,
        fileHash:    result.fileHash,
        exists:      result.exists,
        revoked:     result.revoked,
    };
}

/**
 * Validates a transaction receipt that the frontend reports after the admin's
 * MetaMask signed a transaction. Guards record-mint / record-revoke /
 * record-claim-sbt so a malicious client cannot invent a txHash and get a
 * certificate persisted without actually minting on-chain. To pass, a forged
 * client would have to pay real gas and create real on-chain records.
 *
 * @param {string} txHash       transaction hash from MetaMask
 * @param {number|string} chainId network the tx was mined on
 * @param {string} expectedTo   contract address the tx must target
 * @param {string} expectedFrom wallet address that must have signed
 * @returns {Promise<object>}   the mined receipt
 */
async function verifyTxReceipt(txHash, chainId, expectedTo, expectedFrom, expectedEventTopic) {
    if (!txHash || typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        throw new Error("Invalid transaction hash.");
    }

    console.log(`[Blockchain] verifyTxReceipt: txHash=${txHash}, chainId=${chainId}, expectedTo=${expectedTo}, expectedFrom=${expectedFrom}`);

    const provider = getProvider(chainId);

    let receipt = null;
    let lastErr = null;
    const attempts = 8;
    for (let i = 1; i <= attempts; i++) {
        try {
            receipt = await provider.getTransactionReceipt(txHash);
            if (receipt) break;
            console.warn(`[Blockchain] Receipt not yet available (attempt ${i}/${attempts}) for ${txHash}`);
        } catch (err) {
            lastErr = err;
            console.warn(`[Blockchain] Network error fetching receipt (attempt ${i}/${attempts}): ${err.message}`);
        }
        if (i < attempts) await sleep(800 * i);
    }

    if (!receipt) {
        const extra = lastErr ? ` Last RPC error: ${lastErr.message}` : "";
        throw new Error(`Network error verifying transaction — receipt not found after ${attempts} attempts.${extra}`);
    }
    if (receipt.status !== 1) {
        throw new Error("Transaction failed on-chain (status 0).");
    }

    // Normalize and compare contract addresses — receipt.to is the contract that was called
    let normalizedReceiptTo = null;
    let normalizedExpectedTo = null;

    try {
        normalizedReceiptTo = receipt.to ? ethers.getAddress(receipt.to) : null;
        normalizedExpectedTo = expectedTo ? ethers.getAddress(expectedTo) : null;
    } catch (err) {
        console.error(`[Blockchain] Error normalizing addresses: ${err.message}`);
        throw new Error(`Invalid contract address format: ${err.message}`);
    }

    console.log(`[Blockchain] Receipt details: to=${normalizedReceiptTo}, from=${receipt.from}, gasUsed=${receipt.gasUsed}, blockNumber=${receipt.blockNumber}`);
    console.log(`[Blockchain] Normalized addresses: receipt.to=${normalizedReceiptTo}, expected=${normalizedExpectedTo}`);

    if (!normalizedExpectedTo) {
        throw new Error("No contract address provided for verification.");
    }
    if (!normalizedReceiptTo) {
        console.error(`[Blockchain] ❌ ADDRESS MISMATCH: receipt.to is missing or invalid`);
        throw new Error(`Transaction receipt has no target address. This transaction may not be valid.`);
    }
    if (normalizedReceiptTo.toLowerCase() !== normalizedExpectedTo.toLowerCase()) {
        // Smart wallets and wallet forwarders can wrap a contract call, making
        // receipt.to the forwarder even though the registered contract handled
        // the call. Accept that path only when the expected contract emitted
        // the specific event for this action in the same successful receipt.
        const expectedTopic = expectedEventTopic?.toLowerCase();
        const forwardedContractEvent = expectedTopic && receipt.logs?.some((log) =>
            log.address &&
            ethers.getAddress(log.address).toLowerCase() === normalizedExpectedTo.toLowerCase() &&
            log.topics?.[0]?.toLowerCase() === expectedTopic
        );
        if (forwardedContractEvent) {
            console.log(`[Blockchain] Verified forwarded call: ${normalizedReceiptTo} emitted ${expectedTopic} from registered contract ${normalizedExpectedTo}`);
        } else {
            console.error(`[Blockchain] ❌ ADDRESS MISMATCH: receipt.to=${normalizedReceiptTo} !== expected=${normalizedExpectedTo}`);
            throw new Error(`Transaction did not target the registered contract. Expected: ${normalizedExpectedTo}, Got: ${normalizedReceiptTo}`);
        }
    }

    if (expectedFrom) {
        let normalizedReceiptFrom;
        let normalizedExpectedFrom;
        try {
            normalizedReceiptFrom = ethers.getAddress(receipt.from);
            normalizedExpectedFrom = ethers.getAddress(expectedFrom);
            if (normalizedReceiptFrom.toLowerCase() !== normalizedExpectedFrom.toLowerCase()) {
                throw new Error("Transaction was not signed by the reported wallet.");
            }
        } catch (err) {
            console.error(`[Blockchain] Error verifying signer: ${err.message}`);
            throw new Error(`Unable to verify transaction signer: ${err.message}`);
        }
    }

    console.log(`[Blockchain] ✓ Receipt verified: transaction successfully targeted contract ${normalizedReceiptTo}`);
    return receipt;
}

module.exports = {
    getProvider,
    getRegisteredAddresses,
    getCertificateContractInfo,
    getSBTContractInfo,
    verifyOnBlockchain,
    verifyTxReceipt,
    CERTIFICATE_ISSUED_TOPIC,
    CERTIFICATE_REVOKED_TOPIC,
    SBT_TRANSFER_TOPIC,
};
