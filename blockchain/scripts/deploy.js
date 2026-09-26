const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// The backend reads CONTRACT_ADDRESS / SBT_CONTRACT_ADDRESS from backend/.env.
// Hardhat's local node is ephemeral, so every restart wipes the deployed
// contracts. This small helper rewrites those values in backend/.env with the
// freshly-deployed addresses, so the backend always points at a live contract
// instead of the stale pre-restart one.
function setEnvValue(filePath, key, value) {
  const full = path.resolve(__dirname, filePath);
  let content = "";
  try {
    content = fs.readFileSync(full, "utf8");
  } catch (err) {
    // File may not exist yet — we'll create it.
  }
  const lines = content.split(/\r?\n/);
  const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (keyPattern.test(lines[i])) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }
  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(full, lines.join("\n"), "utf8");
  console.log(`[deploy] ${key}=${value}`);
}

async function main() {
  // 1. Deploy the "Certificate" contract
  const Certificate = await hre.ethers.getContractFactory("Certificate");
  const certificate = await Certificate.deploy();
  await certificate.waitForDeployment();

  // 2. Deploy the Soulbound NFT (SBT) contract
  const SoulboundCertificate = await hre.ethers.getContractFactory("SoulboundCertificate");
  const sbt = await SoulboundCertificate.deploy();
  await sbt.waitForDeployment();

  // 3. Copy freshly compiled artifacts to backend/abis
  const artifactsDir = path.resolve(__dirname, "../artifacts/contracts");
  const backendAbisDir = path.resolve(__dirname, "../../backend/abis");
  if (fs.existsSync(backendAbisDir)) {
    try {
      fs.copyFileSync(
        path.join(artifactsDir, "Certificate.sol/Certificate.json"),
        path.join(backendAbisDir, "Certificate.json")
      );
      fs.copyFileSync(
        path.join(artifactsDir, "SoulboundCertificate.sol/SoulboundCertificate.json"),
        path.join(backendAbisDir, "SoulboundCertificate.json")
      );
      console.log("[deploy] Synced latest ABIs to backend/abis/");
    } catch (e) {
      console.warn("[deploy] Warning syncing ABIs:", e.message);
    }
  }

  // 4. Log + sync the live addresses into the backend .env
  const certAddr = await certificate.getAddress();
  const sbtAddr = await sbt.getAddress();
  console.log("-----------------------------------------------");
  console.log("CertifyChain Smart Contract deployed to:", certAddr);
  console.log("Soulbound NFT (SBT) deployed to:", sbtAddr);
  console.log("-----------------------------------------------");

  setEnvValue("../../backend/.env", "CONTRACT_ADDRESS", certAddr);
  setEnvValue("../../backend/.env", "SBT_CONTRACT_ADDRESS", sbtAddr);

  // 5. Also upsert into MongoDB ContractConfig so the database remains authoritative
  try {
    const mongoose = require("../../backend/node_modules/mongoose");
    const net = await hre.ethers.provider.getNetwork();
    const chainId = Number(net.chainId);
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/certificatesDB";
    
    await mongoose.connect(mongoUri);
    const ContractConfig = mongoose.models.ContractConfig || mongoose.model(
      "ContractConfig",
      new mongoose.Schema(
        {
          _id: { type: String, required: true },
          certAddress: { type: String, required: true },
          sbtAddress: { type: String, required: true },
          certTxHash: { type: String, default: null },
          sbtTxHash: { type: String, default: null },
          deployedBy: { type: String, default: "deploy-script" },
          deployedAt: { type: Date, default: Date.now },
          chainId: { type: Number, default: null },
        },
        { collection: "contractconfigs" }
      )
    );

    const [deployerSigner] = await hre.ethers.getSigners();
    const deployerAddress = deployerSigner ? await deployerSigner.getAddress() : "deploy-script";

    await ContractConfig.findByIdAndUpdate(
      chainId.toString(),
      {
        certAddress: certAddr,
        sbtAddress: sbtAddr,
        certTxHash: certificate.deploymentTransaction()?.hash || null,
        sbtTxHash: sbt.deploymentTransaction()?.hash || null,
        deployedBy: deployerAddress,
        deployedAt: new Date(),
        chainId: chainId,
      },
      { new: true, upsert: true }
    );

    console.log(`[deploy] Successfully synced ContractConfig in MongoDB for chainId ${chainId}`);
    await mongoose.disconnect();
  } catch (mongoErr) {
    console.warn(`[deploy] Notice: Could not sync to MongoDB directly (${mongoErr.message}). .env was updated.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});