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

  // 3. Log + sync the live addresses into the backend .env
  const certAddr = await certificate.getAddress();
  const sbtAddr = await sbt.getAddress();
  console.log("-----------------------------------------------");
  console.log("CertifyChain Smart Contract deployed to:", certAddr);
  console.log("Soulbound NFT (SBT) deployed to:", sbtAddr);
  console.log("-----------------------------------------------");

  // deploy.js lives in blockchain/scripts/, so the backend .env is two levels up.
  setEnvValue("../../backend/.env", "CONTRACT_ADDRESS", certAddr);
  setEnvValue("../../backend/.env", "SBT_CONTRACT_ADDRESS", sbtAddr);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});