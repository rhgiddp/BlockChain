const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("KONETToken", function () {
  async function deployTokenFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();

    const initialSupply = ethers.parseEther("1000000"); // 1M tokens
    const Token = await ethers.getContractFactory("KONETToken");
    const token = await Token.deploy(initialSupply);

    return { token, owner, addr1, addr2, initialSupply };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply to the owner", async function () {
      const { token, owner, initialSupply } = await loadFixture(deployTokenFixture);
      const ownerBalance = await token.balanceOf(owner.address);
      expect(ownerBalance).to.equal(initialSupply);
    });

    it("Should have correct name and symbol", async function () {
      const { token } = await loadFixture(deployTokenFixture);
      expect(await token.name()).to.equal("KONET");
      expect(await token.symbol()).to.equal("KON");
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      const { token, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);

      await expect(
        token.transfer(addr1.address, ethers.parseEther("50"))
      ).to.changeTokenBalances(
        token,
        [owner, addr1],
        [ethers.parseEther("-50"), ethers.parseEther("50")]
      );

      await expect(
        token.connect(addr1).transfer(addr2.address, ethers.parseEther("50"))
      ).to.changeTokenBalances(
        token,
        [addr1, addr2],
        [ethers.parseEther("-50"), ethers.parseEther("50")]
      );
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const { token, owner, addr1 } = await loadFixture(deployTokenFixture);
      const initialOwnerBalance = await token.balanceOf(owner.address);

      await expect(
        token.connect(addr1).transfer(owner.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");

      expect(await token.balanceOf(owner.address)).to.equal(initialOwnerBalance);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      const { token, addr1 } = await loadFixture(deployTokenFixture);

      const mintAmount = ethers.parseEther("1000");
      await token.mint(addr1.address, mintAmount);

      expect(await token.balanceOf(addr1.address)).to.equal(mintAmount);
    });

    it("Should not exceed max supply when minting", async function () {
      const { token, addr1 } = await loadFixture(deployTokenFixture);

      const maxSupply = await token.MAX_SUPPLY();
      const totalSupply = await token.totalSupply();
      const excess = maxSupply - totalSupply + ethers.parseEther("1");

      await expect(
        token.mint(addr1.address, excess)
      ).to.be.revertedWith("Exceeds max supply");
    });

    it("Should not allow non-owner to mint", async function () {
      const { token, addr1 } = await loadFixture(deployTokenFixture);

      await expect(
        token.connect(addr1).mint(addr1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Burning", function () {
    it("Should allow token burning", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      const burnAmount = ethers.parseEther("100");
      const initialBalance = await token.balanceOf(owner.address);

      await token.burn(burnAmount);

      expect(await token.balanceOf(owner.address)).to.equal(initialBalance - burnAmount);
    });
  });

  describe("Pause functionality", function () {
    it("Should allow owner to pause", async function () {
      const { token } = await loadFixture(deployTokenFixture);

      await token.pause();
      expect(await token.paused()).to.be.true;
    });

    it("Should not allow transfers when paused", async function () {
      const { token, owner, addr1 } = await loadFixture(deployTokenFixture);

      await token.pause();

      await expect(
        token.transfer(addr1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("Should allow transfers after unpause", async function () {
      const { token, owner, addr1 } = await loadFixture(deployTokenFixture);

      await token.pause();
      await token.unpause();

      await expect(
        token.transfer(addr1.address, ethers.parseEther("100"))
      ).to.not.be.reverted;
    });
  });
});
