// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title KONETStablecoin
 * @dev USD 페그 스테이블코인 (1 KUSD = 1 USD)
 *
 * 기능:
 * - 담보 기반 발행/소각
 * - 가격 안정화 메커니즘
 * - 담보 비율 관리
 * - 청산 시스템
 */
contract KONETStablecoin is ERC20, ERC20Burnable, AccessControl, ERC20Permit {
    // 역할 정의
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // 담보 구조체
    struct Collateral {
        address tokenAddress;      // 담보 토큰 주소
        uint256 collateralRatio;   // 담보 비율 (150% = 15000)
        uint256 liquidationRatio;  // 청산 비율 (130% = 13000)
        bool isActive;             // 활성화 여부
    }

    // 금고 구조체 (개인별 담보 및 부채)
    struct Vault {
        uint256 collateralAmount;  // 담보량
        uint256 debtAmount;        // 부채량 (발행한 스테이블코인)
        uint64 lastUpdate;         // 마지막 업데이트 시간
    }

    // 상태 변수
    mapping(address => Collateral) public collaterals;
    mapping(address => mapping(address => Vault)) public vaults; // user => collateral => vault
    mapping(address => uint256) public prices; // 담보 토큰 가격 (USD, 18 decimals)

    uint256 public constant PRECISION = 10000; // 100.00%
    uint256 public stabilityFee = 50; // 0.5% 연간 안정화 수수료 (50/10000)
    uint256 public liquidationPenalty = 1000; // 10% 청산 패널티

    // 이벤트
    event CollateralAdded(address indexed token, uint256 collateralRatio);
    event CollateralUpdated(address indexed token, uint256 collateralRatio);
    event VaultOpened(address indexed user, address indexed collateral);
    event StablecoinMinted(address indexed user, address indexed collateral, uint256 amount);
    event StablecoinBurned(address indexed user, address indexed collateral, uint256 amount);
    event CollateralDeposited(address indexed user, address indexed collateral, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed collateral, uint256 amount);
    event VaultLiquidated(address indexed user, address indexed collateral, address indexed liquidator);
    event PriceUpdated(address indexed token, uint256 price);

    constructor() ERC20("KONET Stablecoin", "KUSD") ERC20Permit("KONET Stablecoin") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    /**
     * @dev 담보 토큰 추가
     */
    function addCollateral(
        address tokenAddress,
        uint256 collateralRatio,
        uint256 liquidationRatio
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenAddress != address(0), "Invalid token address");
        require(collateralRatio >= 10000, "Collateral ratio must be >= 100%");
        require(liquidationRatio >= 10000, "Liquidation ratio must be >= 100%");
        require(collateralRatio > liquidationRatio, "Collateral ratio must be > liquidation ratio");

        collaterals[tokenAddress] = Collateral({
            tokenAddress: tokenAddress,
            collateralRatio: collateralRatio,
            liquidationRatio: liquidationRatio,
            isActive: true
        });

        emit CollateralAdded(tokenAddress, collateralRatio);
    }

    /**
     * @dev 담보 비율 업데이트
     */
    function updateCollateralRatio(
        address tokenAddress,
        uint256 newRatio
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collaterals[tokenAddress].isActive, "Collateral not active");
        require(newRatio >= 10000, "Ratio must be >= 100%");

        collaterals[tokenAddress].collateralRatio = newRatio;
        emit CollateralUpdated(tokenAddress, newRatio);
    }

    /**
     * @dev 가격 업데이트 (오라클)
     */
    function updatePrice(address tokenAddress, uint256 price) external onlyRole(ORACLE_ROLE) {
        require(price > 0, "Price must be > 0");
        prices[tokenAddress] = price;
        emit PriceUpdated(tokenAddress, price);
    }

    /**
     * @dev 담보 예치
     */
    function depositCollateral(address collateralToken, uint256 amount) external {
        require(collaterals[collateralToken].isActive, "Collateral not active");
        require(amount > 0, "Amount must be > 0");

        // 담보 토큰 전송
        IERC20(collateralToken).transferFrom(msg.sender, address(this), amount);

        // 금고 업데이트
        Vault storage vault = vaults[msg.sender][collateralToken];
        if (vault.lastUpdate == 0) {
            emit VaultOpened(msg.sender, collateralToken);
        }

        vault.collateralAmount += amount;
        vault.lastUpdate = uint64(block.timestamp);

        emit CollateralDeposited(msg.sender, collateralToken, amount);
    }

    /**
     * @dev 스테이블코인 발행 (담보 기반)
     */
    function mintStablecoin(address collateralToken, uint256 amount) external {
        require(collaterals[collateralToken].isActive, "Collateral not active");
        require(amount > 0, "Amount must be > 0");

        Vault storage vault = vaults[msg.sender][collateralToken];
        require(vault.collateralAmount > 0, "No collateral deposited");

        // 발행 후 담보 비율 확인
        uint256 newDebt = vault.debtAmount + amount;
        require(isCollateralized(msg.sender, collateralToken, newDebt), "Insufficient collateral");

        // 부채 업데이트
        vault.debtAmount = newDebt;
        vault.lastUpdate = uint64(block.timestamp);

        // 스테이블코인 발행
        _mint(msg.sender, amount);

        emit StablecoinMinted(msg.sender, collateralToken, amount);
    }

    /**
     * @dev 스테이블코인 소각 (부채 상환)
     */
    function burnStablecoin(address collateralToken, uint256 amount) external {
        Vault storage vault = vaults[msg.sender][collateralToken];
        require(vault.debtAmount >= amount, "Amount exceeds debt");

        // 부채 감소
        vault.debtAmount -= amount;
        vault.lastUpdate = uint64(block.timestamp);

        // 스테이블코인 소각
        _burn(msg.sender, amount);

        emit StablecoinBurned(msg.sender, collateralToken, amount);
    }

    /**
     * @dev 담보 인출
     */
    function withdrawCollateral(address collateralToken, uint256 amount) external {
        Vault storage vault = vaults[msg.sender][collateralToken];
        require(vault.collateralAmount >= amount, "Insufficient collateral");

        // 인출 후에도 담보 비율 유지되는지 확인
        uint256 remainingCollateral = vault.collateralAmount - amount;

        if (vault.debtAmount > 0) {
            uint256 collateralValue = (remainingCollateral * prices[collateralToken]) / 1e18;
            uint256 requiredCollateral = (vault.debtAmount * collaterals[collateralToken].collateralRatio) / PRECISION;
            require(collateralValue >= requiredCollateral, "Would be undercollateralized");
        }

        // 담보 감소
        vault.collateralAmount = remainingCollateral;
        vault.lastUpdate = uint64(block.timestamp);

        // 담보 토큰 전송
        IERC20(collateralToken).transfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, collateralToken, amount);
    }

    /**
     * @dev 청산 (담보 비율 미달 시)
     */
    function liquidate(address user, address collateralToken) external {
        Vault storage vault = vaults[user][collateralToken];
        require(vault.debtAmount > 0, "No debt to liquidate");

        // 청산 가능 여부 확인
        require(isLiquidatable(user, collateralToken), "Vault is not liquidatable");

        uint256 debtAmount = vault.debtAmount;
        uint256 collateralAmount = vault.collateralAmount;

        // 청산자가 부채 상환
        _burn(msg.sender, debtAmount);

        // 패널티 계산
        uint256 penalty = (collateralAmount * liquidationPenalty) / PRECISION;
        uint256 liquidatorReward = collateralAmount - penalty;

        // 금고 초기화
        vault.debtAmount = 0;
        vault.collateralAmount = 0;
        vault.lastUpdate = uint64(block.timestamp);

        // 담보 전송
        IERC20(collateralToken).transfer(msg.sender, liquidatorReward);
        IERC20(collateralToken).transfer(owner(), penalty); // 패널티는 프로토콜로

        emit VaultLiquidated(user, collateralToken, msg.sender);
    }

    /**
     * @dev 담보 비율 확인
     */
    function isCollateralized(
        address user,
        address collateralToken,
        uint256 debtAmount
    ) public view returns (bool) {
        Vault storage vault = vaults[user][collateralToken];
        if (debtAmount == 0) return true;

        uint256 collateralValue = (vault.collateralAmount * prices[collateralToken]) / 1e18;
        uint256 requiredCollateral = (debtAmount * collaterals[collateralToken].collateralRatio) / PRECISION;

        return collateralValue >= requiredCollateral;
    }

    /**
     * @dev 청산 가능 여부
     */
    function isLiquidatable(address user, address collateralToken) public view returns (bool) {
        Vault storage vault = vaults[user][collateralToken];
        if (vault.debtAmount == 0) return false;

        uint256 collateralValue = (vault.collateralAmount * prices[collateralToken]) / 1e18;
        uint256 liquidationThreshold = (vault.debtAmount * collaterals[collateralToken].liquidationRatio) / PRECISION;

        return collateralValue < liquidationThreshold;
    }

    /**
     * @dev 담보 비율 계산
     */
    function getCollateralizationRatio(
        address user,
        address collateralToken
    ) external view returns (uint256) {
        Vault storage vault = vaults[user][collateralToken];
        if (vault.debtAmount == 0) return type(uint256).max;

        uint256 collateralValue = (vault.collateralAmount * prices[collateralToken]) / 1e18;
        return (collateralValue * PRECISION) / vault.debtAmount;
    }

    /**
     * @dev 소유자 함수 (호환성)
     */
    function owner() public view returns (address) {
        return getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    }
}
