const { ethers } = require("ethers");
require("dotenv").config({ override: true });

const contractABI = require("../abis/Certificate.json");
const sbtABI = require("../abis/SoulboundCertificate.json");
const ContractConfig = require("../models/ContractConfig");
const { getNetwork } = require("../config/networks");

// ── Read-only provider ──────────────────────────────────────────────────────
// The backend never holds a private key and never signs transactions. All
// on-chain WRITES happen in the browser via the admin's MetaMask wallet. The
// backend only reads the chain: verification, and validating tx receipts that
// the frontend reports after a successful signature.
function getProvider(chainId) {
    const net = getNetwork(chainId);
    return new ethers.JsonRpcProvider(net.rpc);
}

// Resolve the deployed contract addresses for a given network. The admin deploys
// from the dApp (MetaMask) and registers the addresses via
// POST /api/contract/register, which persists them in a ContractConfig document
// with a fixed _id: "singleton". The chainId field stores the network. That DB
// record is the source of truth; backend/.env is only a fallback so the service
// still works if the DB is unreachable or no deployment was ever registered.
async function getRegisteredAddresses(chainId) {
    const requestedChainId = Number(chainId);
    try {
        const config = await ContractConfig.findById("singleton").lean();
        if (config && config.certAddress && config.sbtAddress) {
            // Match if chainId matches exactly, or if config has no chainId (legacy)
            // and requested chain is the default Sepolia network.
            const configChainId = config.chainId != null ? Number(config.chainId) : null;
            const isDefaultNetwork = requestedChainId === 11155111;
            if (configChainId === requestedChainId || (configChainId === null && isDefaultNetwork)) {
                return { certAddress: config.certAddress, sbtAddress: config.sbtAddress };
            }
        }
    } catch (err) {
        // DB unavailable — fall through to .env.
    }
    return {
        certAddress: process.env.CONTRACT_ADDRESS,
        sbtAddress: process.env.SBT_CONTRACT_ADDRESS,
    };
}

// Verify live code actually sits at the address on the target network before
// handing it to the frontend, so a stale/empty address never reaches the signer.
async function getCertificateContractInfo(chainId) {
    const { certAddress } = await getRegisteredAddresses(chainId);
    const address = certAddress;
    if (!address) {
        throw new Error("No Certificate contract registered for this network — deploy from the dApp first.");
    }
    const provider = getProvider(chainId);
    const code = await provider.getCode(address);
    if (!code || code === "0x") {
        throw new Error(`No smart contract deployed at ${address} on network ${chainId}.`);
    }
    return { address, abi: contractABI.abi, chainId: Number(chainId) };
}

async function getSBTContractInfo(chainId) {
    const { sbtAddress } = await getRegisteredAddresses(chainId);
    const address = sbtAddress;
    if (!address) {
        throw new Error("No SoulboundCertificate contract registered for this network — deploy from the dApp first.");
    }
    const provider = getProvider(chainId);
    const code = await provider.getCode(address);
    if (!code || code === "0x") {
        throw new Error(`No SBT contract deployed at ${address} on network ${chainId}.`);
    }
    return { address, abi: sbtABI.abi, chainId: Number(chainId) };
}

// ── Read-only verification ──────────────────────────────────────────────────
async function verifyOnBlockchain(certId, chainId) {
    const { address, abi } = await getCertificateContractInfo(chainId);
    const contract = new ethers.Contract(address, abi, getProvider(chainId));
    const result = await contract.verifyCertificate(certId);
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
async function verifyTxReceipt(txHash, chainId, expectedTo, expectedFrom) {
    if (!txHash || typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        throw new Error("Invalid transaction hash.");
    }

    const provider = getProvider(chainId);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
        throw new Error("Transaction not found on chain — has it been mined yet?");
    }
    if (receipt.status !== 1) {
        throw new Error("Transaction failed on-chain (status 0).");
    }
    if (!expectedTo || ethers.getAddress(receipt.to) !== ethers.getAddress(expectedTo)) {
        throw new Error("Transaction did not target the registered contract.");
    }
    if (expectedFrom && ethers.getAddress(receipt.from) !== ethers.getAddress(expectedFrom)) {
        throw new Error("Transaction was not signed by the reported wallet.");
    }

    return receipt;
}

module.exports = {
    getProvider,
    getRegisteredAddresses,
    getCertificateContractInfo,
    getSBTContractInfo,
    verifyOnBlockchain,
    verifyTxReceipt,
};
