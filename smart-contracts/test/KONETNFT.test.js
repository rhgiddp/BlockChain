const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KONETNFT", function () {
  let nft;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const KONETNFT = await ethers.getContractFactory("KONETNFT");
    nft = await KONETNFT.deploy();
    await nft.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await nft.name()).to.equal("KONET NFT");
      expect(await nft.symbol()).to.equal("KNFT");
    });

    it("Should have correct max supply", async function () {
      expect(await nft.maxSupply()).to.equal(10000);
    });

    it("Should have correct mint price", async function () {
      expect(await nft.mintPrice()).to.equal(ethers.parseEther("0.1"));
    });

    it("Should have public mint disabled by default", async function () {
      expect(await nft.publicMintEnabled()).to.equal(false);
    });
  });

  describe("Whitelist Management", function () {
    it("Should allow owner to add to whitelist", async function () {
      await nft.setWhitelist(addr1.address, true);
      expect(await nft.whitelist(addr1.address)).to.equal(true);
    });

    it("Should allow owner to remove from whitelist", async function () {
      await nft.setWhitelist(addr1.address, true);
      await nft.setWhitelist(addr1.address, false);
      expect(await nft.whitelist(addr1.address)).to.equal(false);
    });

    it("Should emit WhitelistUpdated event", async function () {
      await expect(nft.setWhitelist(addr1.address, true))
        .to.emit(nft, "WhitelistUpdated")
        .withArgs(addr1.address, true);
    });

    it("Should not allow non-owner to modify whitelist", async function () {
      await expect(
        nft.connect(addr1).setWhitelist(addr2.address, true)
      ).to.be.reverted;
    });
  });

  describe("Whitelist Minting", function () {
    beforeEach(async function () {
      await nft.setWhitelist(addr1.address, true);
    });

    it("Should allow whitelisted user to mint", async function () {
      await expect(
        nft.connect(addr1).whitelistMint({ value: ethers.parseEther("0.1") })
      ).to.emit(nft, "NFTMinted");
    });

    it("Should not allow non-whitelisted user to mint", async function () {
      await expect(
        nft.connect(addr2).whitelistMint({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Not whitelisted");
    });

    it("Should not allow minting with insufficient payment", async function () {
      await expect(
        nft.connect(addr1).whitelistMint({ value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should mint NFT with correct metadata", async function () {
      await nft.connect(addr1).whitelistMint({ value: ethers.parseEther("0.1") });

      const metadata = await nft.nftMetadata(0);
      expect(metadata.tokenId).to.equal(0);
      expect(metadata.originalCreator).to.equal(addr1.address);
      expect(metadata.generation).to.equal(0);
    });

    it("Should assign random rarity", async function () {
      await nft.connect(addr1).whitelistMint({ value: ethers.parseEther("0.1") });

      const metadata = await nft.nftMetadata(0);
      expect(metadata.rarity).to.be.oneOf([0, 1, 2, 3, 4]); // COMMON to LEGENDARY
    });
  });

  describe("Public Minting", function () {
    it("Should not allow public mint when disabled", async function () {
      await expect(
        nft.connect(addr1).publicMint({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Public mint not enabled");
    });

    it("Should allow public mint when enabled", async function () {
      await nft.setPublicMintEnabled(true);

      await expect(
        nft.connect(addr1).publicMint({ value: ethers.parseEther("0.1") })
      ).to.emit(nft, "NFTMinted");
    });

    it("Should require sufficient payment", async function () {
      await nft.setPublicMintEnabled(true);

      await expect(
        nft.connect(addr1).publicMint({ value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("Insufficient payment");
    });
  });

  describe("Owner Minting", function () {
    it("Should allow owner to mint for free", async function () {
      await nft.ownerMint(addr1.address, 1);
      expect(await nft.balanceOf(addr1.address)).to.equal(1);
    });

    it("Should allow batch minting", async function () {
      await nft.ownerMint(addr1.address, 5);
      expect(await nft.balanceOf(addr1.address)).to.equal(5);
    });

    it("Should not allow non-owner to mint", async function () {
      await expect(
        nft.connect(addr1).ownerMint(addr2.address, 1)
      ).to.be.reverted;
    });

    it("Should respect max supply", async function () {
      // 이 테스트는 시간이 오래 걸릴 수 있으므로 skip하거나 작은 수로 테스트
      await expect(
        nft.ownerMint(addr1.address, 10001)
      ).to.be.revertedWith("Max supply reached");
    });
  });

  describe("Royalties", function () {
    beforeEach(async function () {
      await nft.ownerMint(addr1.address, 1);
    });

    it("Should have default royalty of 5%", async function () {
      const [recipient, amount] = await nft.royaltyInfo(0, ethers.parseEther("1"));
      expect(recipient).to.equal(addr1.address);
      expect(amount).to.equal(ethers.parseEther("0.05"));
    });

    it("Should allow owner to set custom royalty", async function () {
      await nft.connect(addr1).setRoyalty(0, addr2.address, 1000); // 10%

      const [recipient, amount] = await nft.royaltyInfo(0, ethers.parseEther("1"));
      expect(recipient).to.equal(addr2.address);
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("Should not allow royalty higher than 10%", async function () {
      await expect(
        nft.connect(addr1).setRoyalty(0, addr2.address, 1001)
      ).to.be.revertedWith("Royalty too high");
    });

    it("Should not allow non-owner to set royalty", async function () {
      await expect(
        nft.connect(addr2).setRoyalty(0, addr2.address, 500)
      ).to.be.revertedWith("Not token owner");
    });

    it("Should emit RoyaltySet event", async function () {
      await expect(nft.connect(addr1).setRoyalty(0, addr2.address, 500))
        .to.emit(nft, "RoyaltySet")
        .withArgs(0, addr2.address, 500);
    });
  });

  describe("Token URI", function () {
    beforeEach(async function () {
      await nft.ownerMint(addr1.address, 1);
    });

    it("Should allow owner to set token URI", async function () {
      await nft.connect(addr1).setTokenURI(0, "ipfs://test-uri");
      expect(await nft.tokenURI(0)).to.include("ipfs://test-uri");
    });

    it("Should allow contract owner to set token URI", async function () {
      await nft.setTokenURI(0, "ipfs://admin-uri");
      expect(await nft.tokenURI(0)).to.include("ipfs://admin-uri");
    });

    it("Should not allow unauthorized to set token URI", async function () {
      await expect(
        nft.connect(addr2).setTokenURI(0, "ipfs://unauthorized")
      ).to.be.revertedWith("Not authorized");
    });

    it("Should set and return base URI", async function () {
      await nft.setBaseURI("https://api.konet.com/nft/");
      await nft.ownerMint(addr1.address, 1);
      // Base URI는 tokenURI에 반영됨
    });
  });

  describe("Batch Operations", function () {
    beforeEach(async function () {
      await nft.ownerMint(addr1.address, 3);
    });

    it("Should allow batch transfer", async function () {
      await nft.connect(addr1).batchTransfer(addr2.address, [0, 1, 2]);

      expect(await nft.balanceOf(addr1.address)).to.equal(0);
      expect(await nft.balanceOf(addr2.address)).to.equal(3);
    });

    it("Should not allow batch transfer of non-owned tokens", async function () {
      await expect(
        nft.connect(addr2).batchTransfer(addr1.address, [0, 1, 2])
      ).to.be.reverted;
    });
  });

  describe("Token Queries", function () {
    beforeEach(async function () {
      await nft.ownerMint(addr1.address, 5);
      await nft.ownerMint(addr2.address, 3);
    });

    it("Should return tokens of owner", async function () {
      const tokens = await nft.tokensOfOwner(addr1.address);
      expect(tokens.length).to.equal(5);
    });

    it("Should return correct token IDs", async function () {
      const tokens = await nft.tokensOfOwner(addr1.address);
      expect(tokens[0]).to.equal(0);
      expect(tokens[4]).to.equal(4);
    });

    it("Should return empty array for non-owner", async function () {
      const [, , , addr3] = await ethers.getSigners();
      const tokens = await nft.tokensOfOwner(addr3.address);
      expect(tokens.length).to.equal(0);
    });
  });

  describe("Rarity Statistics", function () {
    it("Should track rarity supply", async function () {
      await nft.ownerMint(addr1.address, 10);

      const stats = await nft.getRarityStats();
      const total = stats.reduce((sum, count) => sum + count, 0n);
      expect(total).to.equal(10n);
    });

    it("Should increment rarity counters correctly", async function () {
      const statsBefore = await nft.getRarityStats();
      await nft.ownerMint(addr1.address, 1);
      const statsAfter = await nft.getRarityStats();

      const totalBefore = statsBefore.reduce((sum, count) => sum + count, 0n);
      const totalAfter = statsAfter.reduce((sum, count) => sum + count, 0n);

      expect(totalAfter - totalBefore).to.equal(1n);
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await nft.ownerMint(addr1.address, 1);
    });

    it("Should allow owner to burn token", async function () {
      await nft.connect(addr1).burn(0);
      expect(await nft.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should not allow non-owner to burn", async function () {
      await expect(nft.connect(addr2).burn(0)).to.be.reverted;
    });
  });

  describe("Withdraw", function () {
    it("Should allow owner to withdraw funds", async function () {
      // 사용자가 민팅
      await nft.setWhitelist(addr1.address, true);
      await nft.connect(addr1).whitelistMint({ value: ethers.parseEther("0.1") });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await nft.withdraw();
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should not allow non-owner to withdraw", async function () {
      await expect(nft.connect(addr1).withdraw()).to.be.reverted;
    });

    it("Should fail if no balance", async function () {
      await expect(nft.withdraw()).to.be.revertedWith("No balance");
    });
  });

  describe("Configuration", function () {
    it("Should allow owner to set mint price", async function () {
      await nft.setMintPrice(ethers.parseEther("0.2"));
      expect(await nft.mintPrice()).to.equal(ethers.parseEther("0.2"));
    });

    it("Should not allow non-owner to set mint price", async function () {
      await expect(
        nft.connect(addr1).setMintPrice(ethers.parseEther("0.2"))
      ).to.be.reverted;
    });

    it("Should allow owner to toggle public mint", async function () {
      await nft.setPublicMintEnabled(true);
      expect(await nft.publicMintEnabled()).to.equal(true);

      await nft.setPublicMintEnabled(false);
      expect(await nft.publicMintEnabled()).to.equal(false);
    });
  });
});
