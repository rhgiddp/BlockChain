const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KONETStablecoin", function () {
  let stablecoin;
  let collateralToken;
  let owner;
  let addr1;
  let addr2;
  let oracle;

  const COLLATERAL_RATIO = 15000; // 150%
  const LIQUIDATION_RATIO = 13000; // 130%

  beforeEach(async function () {
    [owner, addr1, addr2, oracle] = await ethers.getSigners();

    // 담보용 Mock ERC20 토큰 배포
    const MockERC20 = await ethers.getContractFactory("KONETToken");
    collateralToken = await MockERC20.deploy();
    await collateralToken.waitForDeployment();

    // 스테이블코인 배포
    const KONETStablecoin = await ethers.getContractFactory("KONETStablecoin");
    stablecoin = await KONETStablecoin.deploy();
    await stablecoin.waitForDeployment();

    // Oracle 역할 부여
    const ORACLE_ROLE = await stablecoin.ORACLE_ROLE();
    await stablecoin.grantRole(ORACLE_ROLE, oracle.address);

    // 담보 토큰 추가
    await stablecoin.addCollateral(
      await collateralToken.getAddress(),
      COLLATERAL_RATIO,
      LIQUIDATION_RATIO
    );

    // 가격 설정 ($1 = 1e18)
    await stablecoin.connect(oracle).updatePrice(
      await collateralToken.getAddress(),
      ethers.parseEther("1")
    );

    // 사용자에게 담보 토큰 전송
    await collateralToken.transfer(addr1.address, ethers.parseEther("10000"));
    await collateralToken.transfer(addr2.address, ethers.parseEther("10000"));

    // 승인
    await collateralToken.connect(addr1).approve(
      await stablecoin.getAddress(),
      ethers.parseEther("10000")
    );
    await collateralToken.connect(addr2).approve(
      await stablecoin.getAddress(),
      ethers.parseEther("10000")
    );
  });

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      expect(await stablecoin.name()).to.equal("KONET Stablecoin");
      expect(await stablecoin.symbol()).to.equal("KUSD");
    });

    it("Should grant DEFAULT_ADMIN_ROLE to owner", async function () {
      const DEFAULT_ADMIN_ROLE = await stablecoin.DEFAULT_ADMIN_ROLE();
      expect(await stablecoin.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should grant MINTER_ROLE to owner", async function () {
      const MINTER_ROLE = await stablecoin.MINTER_ROLE();
      expect(await stablecoin.hasRole(MINTER_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Collateral Management", function () {
    it("Should add collateral correctly", async function () {
      const collateral = await stablecoin.collaterals(await collateralToken.getAddress());
      expect(collateral.isActive).to.be.true;
      expect(collateral.collateralRatio).to.equal(COLLATERAL_RATIO);
      expect(collateral.liquidationRatio).to.equal(LIQUIDATION_RATIO);
    });

    it("Should update collateral ratio", async function () {
      await stablecoin.updateCollateralRatio(
        await collateralToken.getAddress(),
        16000
      );

      const collateral = await stablecoin.collaterals(await collateralToken.getAddress());
      expect(collateral.collateralRatio).to.equal(16000);
    });

    it("Should emit CollateralAdded event", async function () {
      const MockERC20 = await ethers.getContractFactory("KONETToken");
      const newToken = await MockERC20.deploy();

      await expect(
        stablecoin.addCollateral(await newToken.getAddress(), COLLATERAL_RATIO, LIQUIDATION_RATIO)
      )
        .to.emit(stablecoin, "CollateralAdded")
        .withArgs(await newToken.getAddress(), COLLATERAL_RATIO);
    });

    it("Should not allow collateral ratio below 100%", async function () {
      const MockERC20 = await ethers.getContractFactory("KONETToken");
      const newToken = await MockERC20.deploy();

      await expect(
        stablecoin.addCollateral(await newToken.getAddress(), 9000, LIQUIDATION_RATIO)
      ).to.be.revertedWith("Collateral ratio must be >= 100%");
    });

    it("Should not allow non-admin to add collateral", async function () {
      const MockERC20 = await ethers.getContractFactory("KONETToken");
      const newToken = await MockERC20.deploy();

      await expect(
        stablecoin.connect(addr1).addCollateral(
          await newToken.getAddress(),
          COLLATERAL_RATIO,
          LIQUIDATION_RATIO
        )
      ).to.be.reverted;
    });
  });

  describe("Price Oracle", function () {
    it("Should allow oracle to update price", async function () {
      await stablecoin.connect(oracle).updatePrice(
        await collateralToken.getAddress(),
        ethers.parseEther("1.5")
      );

      expect(
        await stablecoin.prices(await collateralToken.getAddress())
      ).to.equal(ethers.parseEther("1.5"));
    });

    it("Should emit PriceUpdated event", async function () {
      await expect(
        stablecoin.connect(oracle).updatePrice(
          await collateralToken.getAddress(),
          ethers.parseEther("2")
        )
      )
        .to.emit(stablecoin, "PriceUpdated")
        .withArgs(await collateralToken.getAddress(), ethers.parseEther("2"));
    });

    it("Should not allow non-oracle to update price", async function () {
      await expect(
        stablecoin.connect(addr1).updatePrice(
          await collateralToken.getAddress(),
          ethers.parseEther("2")
        )
      ).to.be.reverted;
    });

    it("Should not allow zero price", async function () {
      await expect(
        stablecoin.connect(oracle).updatePrice(
          await collateralToken.getAddress(),
          0
        )
      ).to.be.revertedWith("Price must be > 0");
    });
  });

  describe("Collateral Deposit", function () {
    it("Should allow user to deposit collateral", async function () {
      await stablecoin.connect(addr1).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );

      const vault = await stablecoin.vaults(addr1.address, await collateralToken.getAddress());
      expect(vault.collateralAmount).to.equal(ethers.parseEther("100"));
    });

    it("Should emit VaultOpened event on first deposit", async function () {
      await expect(
        stablecoin.connect(addr1).depositCollateral(
          await collateralToken.getAddress(),
          ethers.parseEther("100")
        )
      )
        .to.emit(stablecoin, "VaultOpened")
        .withArgs(addr1.address, await collateralToken.getAddress());
    });

    it("Should emit CollateralDeposited event", async function () {
      await expect(
        stablecoin.connect(addr1).depositCollateral(
          await collateralToken.getAddress(),
          ethers.parseEther("100")
        )
      )
        .to.emit(stablecoin, "CollateralDeposited")
        .withArgs(addr1.address, await collateralToken.getAddress(), ethers.parseEther("100"));
    });

    it("Should not allow deposit of inactive collateral", async function () {
      const MockERC20 = await ethers.getContractFactory("KONETToken");
      const inactiveToken = await MockERC20.deploy();

      await expect(
        stablecoin.connect(addr1).depositCollateral(
          await inactiveToken.getAddress(),
          ethers.parseEther("100")
        )
      ).to.be.revertedWith("Collateral not active");
    });
  });

  describe("Stablecoin Minting", function () {
    beforeEach(async function () {
      // 담보 예치
      await stablecoin.connect(addr1).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("150")
      );
    });

    it("Should allow minting with sufficient collateral", async function () {
      await stablecoin.connect(addr1).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );

      expect(await stablecoin.balanceOf(addr1.address)).to.equal(
        ethers.parseEther("100")
      );
    });

    it("Should emit StablecoinMinted event", async function () {
      await expect(
        stablecoin.connect(addr1).mintStablecoin(
          await collateralToken.getAddress(),
          ethers.parseEther("100")
        )
      )
        .to.emit(stablecoin, "StablecoinMinted")
        .withArgs(addr1.address, await collateralToken.getAddress(), ethers.parseEther("100"));
    });

    it("Should not allow minting without collateral", async function () {
      await expect(
        stablecoin.connect(addr2).mintStablecoin(
          await collateralToken.getAddress(),
          ethers.parseEther("100")
        )
      ).to.be.revertedWith("No collateral deposited");
    });

    it("Should not allow minting with insufficient collateral", async function () {
      await expect(
        stablecoin.connect(addr1).mintStablecoin(
          await collateralToken.getAddress(),
          ethers.parseEther("101")
        )
      ).to.be.revertedWith("Insufficient collateral");
    });

    it("Should update vault debt correctly", async function () {
      await stablecoin.connect(addr1).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );

      const vault = await stablecoin.vaults(addr1.address, await collateralToken.getAddress());
      expect(vault.debtAmount).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Stablecoin Burning", function () {
    beforeEach(async function () {
      await stablecoin.connect(addr1).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("150")
      );
      await stablecoin.connect(addr1).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );
    });

    it("Should allow burning to repay debt", async function () {
      await stablecoin.connect(addr1).burnStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("50")
      );

      expect(await stablecoin.balanceOf(addr1.address)).to.equal(
        ethers.parseEther("50")
      );
    });

    it("Should emit StablecoinBurned event", async function () {
      await expect(
        stablecoin.connect(addr1).burnStablecoin(
          await collateralToken.getAddress(),
          ethers.parseEther("50")
        )
      )
        .to.emit(stablecoin, "StablecoinBurned")
        .withArgs(addr1.address, await collateralToken.getAddress(), ethers.parseEther("50"));
    });

    it("Should not allow burning more than debt", async function () {
      await expect(
        stablecoin.connect(addr1).burnStablecoin(
          await collateralToken.getAddress(),
          ethers.parseEther("101")
        )
      ).to.be.revertedWith("Amount exceeds debt");
    });

    it("Should reduce vault debt correctly", async function () {
      await stablecoin.connect(addr1).burnStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("50")
      );

      const vault = await stablecoin.vaults(addr1.address, await collateralToken.getAddress());
      expect(vault.debtAmount).to.equal(ethers.parseEther("50"));
    });
  });

  describe("Collateral Withdrawal", function () {
    beforeEach(async function () {
      await stablecoin.connect(addr1).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("200")
      );
      await stablecoin.connect(addr1).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );
    });

    it("Should allow withdrawal if collateral ratio maintained", async function () {
      await stablecoin.connect(addr1).withdrawCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("50")
      );

      const vault = await stablecoin.vaults(addr1.address, await collateralToken.getAddress());
      expect(vault.collateralAmount).to.equal(ethers.parseEther("150"));
    });

    it("Should not allow withdrawal if undercollateralized", async function () {
      await expect(
        stablecoin.connect(addr1).withdrawCollateral(
          await collateralToken.getAddress(),
          ethers.parseEther("100")
        )
      ).to.be.revertedWith("Would be undercollateralized");
    });

    it("Should emit CollateralWithdrawn event", async function () {
      await expect(
        stablecoin.connect(addr1).withdrawCollateral(
          await collateralToken.getAddress(),
          ethers.parseEther("50")
        )
      )
        .to.emit(stablecoin, "CollateralWithdrawn")
        .withArgs(addr1.address, await collateralToken.getAddress(), ethers.parseEther("50"));
    });

    it("Should allow full withdrawal if no debt", async function () {
      await stablecoin.connect(addr1).burnStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );

      await stablecoin.connect(addr1).withdrawCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("200")
      );

      const vault = await stablecoin.vaults(addr1.address, await collateralToken.getAddress());
      expect(vault.collateralAmount).to.equal(0);
    });
  });

  describe("Liquidation", function () {
    beforeEach(async function () {
      // addr1이 최소 담보로 발행
      await stablecoin.connect(addr1).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("150")
      );
      await stablecoin.connect(addr1).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );

      // addr2가 청산용 스테이블코인 보유
      await stablecoin.connect(addr2).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("200")
      );
      await stablecoin.connect(addr2).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );
    });

    it("Should allow liquidation when undercollateralized", async function () {
      // 가격 하락으로 담보 부족 유발
      await stablecoin.connect(oracle).updatePrice(
        await collateralToken.getAddress(),
        ethers.parseEther("0.8")
      );

      await stablecoin.connect(addr2).liquidate(
        addr1.address,
        await collateralToken.getAddress()
      );

      const vault = await stablecoin.vaults(addr1.address, await collateralToken.getAddress());
      expect(vault.debtAmount).to.equal(0);
    });

    it("Should emit VaultLiquidated event", async function () {
      await stablecoin.connect(oracle).updatePrice(
        await collateralToken.getAddress(),
        ethers.parseEther("0.8")
      );

      await expect(
        stablecoin.connect(addr2).liquidate(
          addr1.address,
          await collateralToken.getAddress()
        )
      )
        .to.emit(stablecoin, "VaultLiquidated")
        .withArgs(addr1.address, await collateralToken.getAddress(), addr2.address);
    });

    it("Should not allow liquidation if properly collateralized", async function () {
      await expect(
        stablecoin.connect(addr2).liquidate(
          addr1.address,
          await collateralToken.getAddress()
        )
      ).to.be.revertedWith("Vault is not liquidatable");
    });
  });

  describe("Collateralization Checks", function () {
    beforeEach(async function () {
      await stablecoin.connect(addr1).depositCollateral(
        await collateralToken.getAddress(),
        ethers.parseEther("150")
      );
    });

    it("Should return true for properly collateralized vault", async function () {
      expect(
        await stablecoin.isCollateralized(
          addr1.address,
          await collateralToken.getAddress(),
          ethers.parseEther("100")
        )
      ).to.be.true;
    });

    it("Should return false for undercollateralized vault", async function () {
      expect(
        await stablecoin.isCollateralized(
          addr1.address,
          await collateralToken.getAddress(),
          ethers.parseEther("101")
        )
      ).to.be.false;
    });

    it("Should calculate collateralization ratio correctly", async function () {
      await stablecoin.connect(addr1).mintStablecoin(
        await collateralToken.getAddress(),
        ethers.parseEther("100")
      );

      const ratio = await stablecoin.getCollateralizationRatio(
        addr1.address,
        await collateralToken.getAddress()
      );

      expect(ratio).to.equal(15000); // 150%
    });
  });
});
