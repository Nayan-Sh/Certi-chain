const hre = require("hardhat");

async function main() {
  // 1. Tell Hardhat we want to deploy the "Certificate" contract
  const Certificate = await hre.ethers.getContractFactory("Certificate");

  // 2. Start the deployment process
  const certificate = await Certificate.deploy();

  // 3. Wait for the deployment to finish
  await certificate.waitForDeployment();

  // 4. Log the address where the contract is now living
  console.log("-----------------------------------------------");
  console.log("CertifyChain Smart Contract deployed to:", await certificate.getAddress());

  console.log("Deploying Soulbound NFT Contract...");
  const SoulboundCertificate = await hre.ethers.getContractFactory("SoulboundCertificate");
  const sbt = await SoulboundCertificate.deploy();
  await sbt.waitForDeployment();
  console.log("Soulbound NFT (SBT) deployed to:", await sbt.getAddress());
  console.log("-----------------------------------------------");
}

// Standard pattern to run the script and handle errors
main().catch((error) => {
  console.error(error);
  process.exit(1);
});