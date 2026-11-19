const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CertificateRegistry", () => {
  async function deploy() {
    const [owner, admin, student, stranger] = await ethers.getSigners();
    const registry = await ethers.deployContract("CertificateRegistry");
    await registry.setAdmin(admin.address, true);
    return { registry, owner, admin, student, stranger };
  }

  const sample = (i = 1, diploma = "Licence Informatique") => [
    `Student ${i}`,
    `2023-INF-${String(i).padStart(3, "0")}`,
    diploma,
    "2026-06-15",
    "Mention Bien",
  ];

  describe("access control", () => {
    it("sets deployer as owner and admin", async () => {
      const { registry, owner } = await loadFixture(deploy);
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.isAdmin(owner.address)).to.equal(true);
    });

    it("lets the owner add/remove admins, but nobody else", async () => {
      const { registry, admin, stranger } = await loadFixture(deploy);
      await expect(registry.connect(stranger).setAdmin(stranger.address, true)).to.be.revertedWithCustomError(
        registry,
        "NotOwner"
      );
      await expect(registry.connect(admin).setAdmin(stranger.address, true)).to.be.revertedWithCustomError(
        registry,
        "NotOwner"
      );
      await registry.setAdmin(admin.address, false);
      expect(await registry.isAdmin(admin.address)).to.equal(false);
    });

    it("rejects minting from non-admin accounts", async () => {
      const { registry, stranger, student } = await loadFixture(deploy);
      await expect(
        registry.connect(stranger).mintCertificate(student.address, ...sample())
      ).to.be.revertedWithCustomError(registry, "NotAdmin");
    });
  });

  describe("mintCertificate", () => {
    it("stores the certificate and emits CertificateMinted", async () => {
      const { registry, admin, student } = await loadFixture(deploy);
      const args = sample();
      await expect(registry.connect(admin).mintCertificate(student.address, ...args))
        .to.emit(registry, "CertificateMinted")
        .withArgs(1n, student.address, args[1], args[2]);

      const cert = await registry.getCertificate(1);
      expect(cert.studentName).to.equal(args[0]);
      expect(cert.studentId).to.equal(args[1]);
      expect(cert.diplomaTitle).to.equal(args[2]);
      expect(cert.issueDate).to.equal(args[3]);
      expect(cert.grade).to.equal(args[4]);
      expect(cert.recipient).to.equal(student.address);
      expect(cert.revoked).to.equal(false);
      expect(await registry.totalCertificates()).to.equal(1n);
      expect(await registry.isValid(1)).to.equal(true);
    });

    it("accepts a zero recipient address (student without wallet)", async () => {
      const { registry, admin } = await loadFixture(deploy);
      await registry.connect(admin).mintCertificate(ethers.ZeroAddress, ...sample());
      expect((await registry.getCertificate(1)).recipient).to.equal(ethers.ZeroAddress);
    });

    it("rejects the same studentId + diploma twice", async () => {
      const { registry, admin, student } = await loadFixture(deploy);
      await registry.connect(admin).mintCertificate(student.address, ...sample());
      await expect(registry.connect(admin).mintCertificate(student.address, ...sample()))
        .to.be.revertedWithCustomError(registry, "DuplicateCertificate")
        .withArgs(1n);
    });

    it("allows the same student to get a different diploma", async () => {
      const { registry, admin, student } = await loadFixture(deploy);
      await registry.connect(admin).mintCertificate(student.address, ...sample(1, "Licence"));
      await registry.connect(admin).mintCertificate(student.address, ...sample(1, "Master"));
      expect(await registry.totalCertificates()).to.equal(2n);
      expect(await registry.findCertificateId("2023-INF-001", "Master")).to.equal(2n);
    });

    it("rejects empty mandatory fields", async () => {
      const { registry, admin, student } = await loadFixture(deploy);
      const args = sample();
      args[0] = "";
      await expect(registry.connect(admin).mintCertificate(student.address, ...args))
        .to.be.revertedWithCustomError(registry, "EmptyField")
        .withArgs("studentName");
    });
  });

  describe("batchMint", () => {
    const build = (n) => {
      const rows = Array.from({ length: n }, (_, i) => sample(i + 1));
      return [
        rows.map(() => ethers.ZeroAddress),
        rows.map((r) => r[0]),
        rows.map((r) => r[1]),
        rows.map((r) => r[2]),
        rows.map((r) => r[3]),
        rows.map((r) => r[4]),
      ];
    };

    it("mints several certificates and emits one event each", async () => {
      const { registry, admin } = await loadFixture(deploy);
      const tx = registry.connect(admin).batchMint(...build(5));
      await expect(tx).to.emit(registry, "CertificateMinted");
      await tx;
      expect(await registry.totalCertificates()).to.equal(5n);
      expect((await registry.getCertificate(5)).studentId).to.equal("2023-INF-005");
    });

    it("reverts the whole batch if one row is a duplicate", async () => {
      const { registry, admin } = await loadFixture(deploy);
      const data = build(3);
      data[2][2] = data[2][0]; // same studentId + diploma as row 0
      await expect(registry.connect(admin).batchMint(...data)).to.be.revertedWithCustomError(
        registry,
        "DuplicateCertificate"
      );
      expect(await registry.totalCertificates()).to.equal(0n);
    });

    it("rejects mismatched arrays, empty batches and oversized batches", async () => {
      const { registry, admin } = await loadFixture(deploy);
      const bad = build(3);
      bad[1].pop();
      await expect(registry.connect(admin).batchMint(...bad)).to.be.revertedWithCustomError(
        registry,
        "ArrayLengthMismatch"
      );
      await expect(registry.connect(admin).batchMint(...build(0))).to.be.revertedWithCustomError(
        registry,
        "EmptyBatch"
      );
      await expect(registry.connect(admin).batchMint(...build(51))).to.be.revertedWithCustomError(
        registry,
        "BatchTooLarge"
      );
    });

    it("rejects non-admins", async () => {
      const { registry, stranger } = await loadFixture(deploy);
      await expect(registry.connect(stranger).batchMint(...build(2))).to.be.revertedWithCustomError(
        registry,
        "NotAdmin"
      );
    });
  });

  describe("revoke & reads", () => {
    it("revokes a certificate and reports it as invalid", async () => {
      const { registry, admin, student } = await loadFixture(deploy);
      await registry.connect(admin).mintCertificate(student.address, ...sample());
      await expect(registry.connect(admin).revoke(1)).to.emit(registry, "CertificateRevoked").withArgs(1n, admin.address);
      expect((await registry.getCertificate(1)).revoked).to.equal(true);
      expect(await registry.isValid(1)).to.equal(false);
      await expect(registry.connect(admin).revoke(1)).to.be.revertedWithCustomError(registry, "AlreadyRevoked");
    });

    it("only lets admins revoke", async () => {
      const { registry, admin, stranger, student } = await loadFixture(deploy);
      await registry.connect(admin).mintCertificate(student.address, ...sample());
      await expect(registry.connect(stranger).revoke(1)).to.be.revertedWithCustomError(registry, "NotAdmin");
    });

    it("reverts on unknown ids", async () => {
      const { registry } = await loadFixture(deploy);
      await expect(registry.getCertificate(0)).to.be.revertedWithCustomError(registry, "CertificateNotFound");
      await expect(registry.getCertificate(42)).to.be.revertedWithCustomError(registry, "CertificateNotFound");
      expect(await registry.isValid(42)).to.equal(false);
    });
  });
});
