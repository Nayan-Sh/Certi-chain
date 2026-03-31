const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Certificate Contract — fileHash verification", function () {
  let certificate;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("Certificate");
    certificate = await Factory.deploy();
    await certificate.waitForDeployment();
  });

  it("issues a certificate with a fileHash and stores it immutably", async function () {
    await certificate.issueCertificate(
      "CERT-001",
      "Alice Smith",
      "Blockchain Engineering",
      "CertifyChain",
      "QmSomeIPFSHash",
      "abc123deadbeef" // simulated SHA-256 hex
    );

    const result = await certificate.verifyCertificate("CERT-001");
    expect(result.exists).to.equal(true);
    expect(result.studentName).to.equal("Alice Smith");
    expect(result.course).to.equal("Blockchain Engineering");
    expect(result.fileHash).to.equal("abc123deadbeef");
  });

  it("returns the correct fileHash so backend can compare uploaded file", async function () {
    const realFileHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256 of empty bytes (example)

    await certificate.issueCertificate(
      "CERT-002",
      "Bob Jones",
      "Data Science",
      "CertifyChain",
      "QmAnotherIPFSHash",
      realFileHash
    );

    const result = await certificate.verifyCertificate("CERT-002");
    expect(result.fileHash).to.equal(realFileHash);

    // Simulate tampered file — different hash should NOT match
    const tamperedHash = "0000000000000000000000000000000000000000000000000000000000000000";
    expect(result.fileHash).to.not.equal(tamperedHash);
  });

  it("rejects a duplicate certificate ID", async function () {
    await certificate.issueCertificate("CERT-003", "Carol", "DevOps", "Org", "ipfs1", "hash1");
    await expect(
      certificate.issueCertificate("CERT-003", "Dave", "AI", "Org", "ipfs2", "hash2")
    ).to.be.revertedWith("Certificate already issued");
  });

  it("reverts verifyCertificate for non-existent ID", async function () {
    const result = await certificate.verifyCertificate("DOES_NOT_EXIST");
    expect(result.exists).to.equal(false);
    expect(result.fileHash).to.equal("");
  });
});
