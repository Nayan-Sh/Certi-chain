const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulboundCertificate — self-claim & owner mint", function () {
  let sbt;
  let owner;
  let student;

  beforeEach(async function () {
    [owner, student] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SoulboundCertificate");
    sbt = await Factory.deploy();
    await sbt.waitForDeployment();
  });

  it("lets a student claim their own certificate as an SBT", async function () {
    await sbt.connect(student).issueSBT(student.address, "CERT-001", "ipfs://QmHash");
    expect(await sbt.isClaimed("CERT-001")).to.equal(true);
    expect(await sbt.ownerOf(0)).to.equal(student.address);
  });

  it("lets the contract owner mint an SBT on a student's behalf", async function () {
    await sbt.issueSBT(student.address, "CERT-002", "ipfs://QmHash2");
    expect(await sbt.ownerOf(0)).to.equal(student.address);
  });

  it("blocks a third party from claiming someone else's certificate", async function () {
    const [, , stranger] = await ethers.getSigners();
    await expect(
      sbt.connect(stranger).issueSBT(student.address, "CERT-003", "ipfs://QmHash3")
    ).to.be.revertedWith("Only the student or contract owner can claim");
  });

  it("rejects a duplicate claim for the same certificate ID", async function () {
    await sbt.connect(student).issueSBT(student.address, "CERT-004", "ipfs://QmHash4");
    await expect(
      sbt.issueSBT(student.address, "CERT-004", "ipfs://QmHash4")
    ).to.be.revertedWith("Certificate has already been claimed as an SBT");
  });

  it("is soulbound — SBTs cannot be transferred", async function () {
    await sbt.connect(student).issueSBT(student.address, "CERT-005", "ipfs://QmHash5");
    await expect(
      sbt.connect(student).transferFrom(student.address, owner.address, 0)
    ).to.be.revertedWith("SoulboundToken: Transfer failed. Certificates are non-transferable.");
  });

  it("lets the owner burn a compromised SBT and clear the claim flag", async function () {
    await sbt.connect(student).issueSBT(student.address, "CERT-006", "ipfs://QmHash6");
    await expect(sbt.connect(student).burn(0)).to.be.revertedWithCustomError(sbt, "OwnableUnauthorizedAccount");
    await expect(sbt.burn(0)).to.emit(sbt, "CertificateBurned").withArgs(student.address, 0, "CERT-006");
    expect(await sbt.isClaimed("CERT-006")).to.equal(false);
    await expect(sbt.ownerOf(0)).to.be.revertedWithCustomError(sbt, "ERC721NonexistentToken");
  });
});
