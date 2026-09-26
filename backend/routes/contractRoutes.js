const express = require("express");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const ContractConfig = require("../models/ContractConfig");
const authMiddleware = require("../middleware/authMiddleware");
const { getCertificateContractInfo, getSBTContractInfo } = require("../services/blockchainService");

const router = express.Router();

// Only admins may inspect / register / fetch deployment artifacts.
router.use((req, res, next) => {
  console.log('[DEBUG router.use] path:', req.path, 'method:', req.method);
  next();
});
router.use(authMiddleware);
router.use((req, res, next) => {
  // Students need the deployed addresses and ABI to claim an SBT. All
  // deployment and registration operations remain admin-only.
  if (req.method === "GET" && req.path === "/info") return next();
  return authMiddleware.requireRole("admin")(req, res, next);
});

// ── Artifact lookup ────────────────────────────────────────────────────────
// Serve the freshly-compiled hardhat artifact (ABI + bytecode) so the browser
// can deploy the contracts directly from a connected MetaMask wallet. Prefers
// blockchain/artifacts (rebuilds every `npx hardhat compile`), falls back to
// backend/abis for a committed copy.
const ARTIFACT_NAMES = {
  Certificate: "Certificate",
  SoulboundCertificate: "SoulboundCertificate",
};

function loadArtifact(name) {
  const primary = path.resolve(
    __dirname,
    `../../blockchain/artifacts/contracts/${name}.sol/${name}.json`
  );
  const fallback = path.resolve(__dirname, `../abis/${name}.json`);

  for (const file of [primary, fallback]) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw.abi && raw.bytecode) return raw;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

// GET /api/contract/artifact/:name  →  { abi, bytecode, contractName }
router.get("/artifact/:name", (req, res) => {
  const name = ARTIFACT_NAMES[req.params.name];
  if (!name) {
    return res.status(400).json({ error: `Unknown contract: ${req.params.name}` });
  }
  const artifact = loadArtifact(name);
  if (!artifact) {
    return res.status(404).json({ error: `Artifact not found for ${name}. Run 'npx hardhat compile' first.` });
  }
  res.json({ contractName: name, abi: artifact.abi, bytecode: artifact.bytecode });
});

// GET /api/contract/status  →  currently registered deployment (or empty)
router.get("/status", async (req, res) => {
  const { chainId } = req.query;
  try {
    let config;
    if (chainId) {
        config = await ContractConfig.findOne({ 
            $or: [{ _id: chainId.toString() }, { _id: Number(chainId) }] 
        }).lean();
        if (!config) {
            const singleton = await ContractConfig.findById("singleton").lean();
            if (singleton && (Number(singleton.chainId) === Number(chainId) ||
                (!singleton.chainId && Number(chainId) === 11155111))) config = singleton;
        }
    } else {
        // Fallback for general status check
        config = await ContractConfig.findOne().lean();
    }
    res.json({ deployed: !!config, config: config || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to read contract config", details: err.message });
  }
});

// GET /api/contract/info?chainId=  →  { certAddress, certAbi, sbtAddress, sbtAbi, chainId }
router.get("/info", async (req, res) => {
  const { chainId } = req.query;
  if (!chainId) {
    return res.status(400).json({ error: "chainId query parameter is required" });
  }

  try {
    console.log(`[ContractRoutes] GET /api/contract/info: chainId=${chainId}`);
    const certInfo = await getCertificateContractInfo(Number(chainId));
    const sbtInfo = await getSBTContractInfo(Number(chainId));
    console.log(`[ContractRoutes] Returning certAddress=${certInfo.address}, sbtAddress=${sbtInfo.address}`);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.json({
      certAddress: certInfo.address,
      certAbi: certInfo.abi,
      sbtAddress: sbtInfo.address,
      sbtAbi: sbtInfo.abi,
      chainId: Number(chainId)
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/contract/register  →  persist addresses from a wallet deployment
// Body: { certAddress, sbtAddress, certTxHash?, sbtTxHash?, chainId? }
router.post("/register", async (req, res) => {
  const { certAddress, sbtAddress, certTxHash, sbtTxHash, chainId } = req.body || {};

  if (!ethers.isAddress(certAddress) || !ethers.isAddress(sbtAddress)) {
    return res.status(400).json({ error: "Invalid contract address (must be a valid 0x… address)." });
  }

  // Confirm live code actually sits at both addresses on the target network.
  // Skip rather than fail registration if the public RPC times out — MetaMask
  // already mined the deploy tx, so a flaky RPC should not block minting.
  try {
    const { getNetwork } = require("../config/networks");
    const net = getNetwork(Number(chainId) || 11155111);
    const provider = new ethers.JsonRpcProvider(net.rpc, Number(net.chainId), { staticNetwork: true });
    for (const [label, address] of [
      ["Certificate", certAddress],
      ["SoulboundCertificate", sbtAddress],
    ]) {
      const code = await provider.getCode(address);
      if (!code || code === "0x") {
        return res.status(400).json({
          error: `No smart contract code found at ${label} address ${address} on ${net.name}. Deploy first, then register.`,
        });
      }
    }
  } catch (err) {
    console.warn(`[Contract] Skipping live bytecode check (RPC unavailable): ${err.message}`);
  }

  try {
    const configId = chainId ? chainId.toString() : "singleton";
    const normalizedCertAddress = ethers.getAddress(certAddress);
    const normalizedSbtAddress = ethers.getAddress(sbtAddress);
    const config = await ContractConfig.findByIdAndUpdate(
      configId,
      {
        certAddress: normalizedCertAddress,
        sbtAddress: normalizedSbtAddress,
        certTxHash: certTxHash || null,
        sbtTxHash: sbtTxHash || null,
        deployedBy: req.user?.email || "admin",
        deployedAt: new Date(),
        chainId: Number(chainId) || null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    console.log(`[Contract] Registered: certAddress=${normalizedCertAddress} sbtAddress=${normalizedSbtAddress} chainId=${Number(chainId) || 'N/A'}`);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: "Failed to save contract config", details: err.message });
  }
});

module.exports = router;
