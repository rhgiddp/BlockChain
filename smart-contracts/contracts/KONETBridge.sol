// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title KONETBridge
 * @dev 크로스체인 브릿지 - 다른 블록체인과 자산 이동
 *
 * 주요 기능:
 * - ERC20 토큰 Lock & Mint 방식
 * - 다중 서명 검증자 시스템
 * - 수수료 관리
 * - 긴급 정지 기능
 */
contract KONETBridge is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // 지원되는 체인 ID
    enum ChainId {
        ETHEREUM,
        BSC,
        POLYGON,
        AVALANCHE,
        ARBITRUM,
        OPTIMISM
    }

    // 브릿지 방향
    enum Direction {
        DEPOSIT,  // 이 체인으로 입금
        WITHDRAW  // 이 체인에서 출금
    }

    // 거래 상태
    enum Status {
        PENDING,
        CONFIRMED,
        EXECUTED,
        REFUNDED,
        CANCELLED
    }

    // 브릿지 거래 구조체
    struct BridgeTransaction {
        bytes32 txId;
        address user;
        address token;
        uint256 amount;
        ChainId sourceChain;
        ChainId targetChain;
        Direction direction;
        Status status;
        uint256 timestamp;
        uint256 confirmations;
        bytes32 targetTxHash;
    }

    // 검증자 서명 구조체
    struct ValidatorSignature {
        address validator;
        bytes signature;
        uint256 timestamp;
    }

    // 지원 토큰 정보
    struct SupportedToken {
        address tokenAddress;
        bool isSupported;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 dailyLimit;
        uint256 dailyVolume;
        uint256 lastResetTime;
    }

    // 상태 변수
    mapping(bytes32 => BridgeTransaction) public transactions;
    mapping(bytes32 => mapping(address => bool)) public validatorConfirmed;
    mapping(address => SupportedToken) public supportedTokens;
    mapping(ChainId => bool) public supportedChains;

    uint256 public requiredConfirmations = 3;
    uint256 public bridgeFee = 10; // 0.1% (basis points)
    uint256 public constant FEE_DENOMINATOR = 10000;

    address public feeRecipient;
    uint256 public totalBridgedVolume;
    uint256 public transactionCount;

    // 이벤트
    event DepositInitiated(
        bytes32 indexed txId,
        address indexed user,
        address indexed token,
        uint256 amount,
        ChainId targetChain
    );

    event WithdrawInitiated(
        bytes32 indexed txId,
        address indexed user,
        address indexed token,
        uint256 amount,
        ChainId sourceChain
    );

    event TransactionConfirmed(
        bytes32 indexed txId,
        address indexed validator,
        uint256 confirmations
    );

    event TransactionExecuted(
        bytes32 indexed txId,
        address indexed user,
        uint256 amount
    );

    event TransactionRefunded(
        bytes32 indexed txId,
        address indexed user,
        uint256 amount
    );

    event TokenAdded(
        address indexed token,
        uint256 minAmount,
        uint256 maxAmount
    );

    event ChainAdded(ChainId indexed chainId);

    event FeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "Invalid fee recipient");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);

        feeRecipient = _feeRecipient;

        // 기본 지원 체인 추가
        supportedChains[ChainId.ETHEREUM] = true;
        supportedChains[ChainId.BSC] = true;
        supportedChains[ChainId.POLYGON] = true;
    }

    /**
     * @dev 토큰 추가
     */
    function addSupportedToken(
        address token,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 dailyLimit
    ) external onlyRole(OPERATOR_ROLE) {
        require(token != address(0), "Invalid token");
        require(minAmount < maxAmount, "Invalid amounts");

        supportedTokens[token] = SupportedToken({
            tokenAddress: token,
            isSupported: true,
            minAmount: minAmount,
            maxAmount: maxAmount,
            dailyLimit: dailyLimit,
            dailyVolume: 0,
            lastResetTime: block.timestamp
        });

        emit TokenAdded(token, minAmount, maxAmount);
    }

    /**
     * @dev 체인 추가
     */
    function addSupportedChain(ChainId chainId) external onlyRole(OPERATOR_ROLE) {
        supportedChains[chainId] = true;
        emit ChainAdded(chainId);
    }

    /**
     * @dev 입금 (Lock) - 다른 체인으로 토큰 보내기
     */
    function deposit(
        address token,
        uint256 amount,
        ChainId targetChain
    ) external nonReentrant whenNotPaused returns (bytes32) {
        require(supportedTokens[token].isSupported, "Token not supported");
        require(supportedChains[targetChain], "Chain not supported");
        require(amount >= supportedTokens[token].minAmount, "Amount too low");
        require(amount <= supportedTokens[token].maxAmount, "Amount too high");

        // 일일 한도 체크
        _checkDailyLimit(token, amount);

        // 수수료 계산
        uint256 fee = (amount * bridgeFee) / FEE_DENOMINATOR;
        uint256 netAmount = amount - fee;

        // 토큰 전송 (Lock)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }

        // 거래 ID 생성
        bytes32 txId = keccak256(
            abi.encodePacked(
                msg.sender,
                token,
                amount,
                targetChain,
                block.timestamp,
                transactionCount++
            )
        );

        // 거래 저장
        transactions[txId] = BridgeTransaction({
            txId: txId,
            user: msg.sender,
            token: token,
            amount: netAmount,
            sourceChain: ChainId.ETHEREUM, // 현재 체인
            targetChain: targetChain,
            direction: Direction.DEPOSIT,
            status: Status.PENDING,
            timestamp: block.timestamp,
            confirmations: 0,
            targetTxHash: bytes32(0)
        });

        totalBridgedVolume += amount;

        emit DepositInitiated(txId, msg.sender, token, netAmount, targetChain);

        return txId;
    }

    /**
     * @dev 출금 요청 (Burn) - 다른 체인에서 이 체인으로
     */
    function initiateWithdraw(
        address user,
        address token,
        uint256 amount,
        ChainId sourceChain,
        bytes32 sourceTxHash
    ) external onlyRole(VALIDATOR_ROLE) returns (bytes32) {
        require(supportedTokens[token].isSupported, "Token not supported");
        require(supportedChains[sourceChain], "Chain not supported");

        bytes32 txId = keccak256(
            abi.encodePacked(
                user,
                token,
                amount,
                sourceChain,
                sourceTxHash,
                transactionCount++
            )
        );

        // 중복 체크
        require(transactions[txId].txId == bytes32(0), "Transaction exists");

        transactions[txId] = BridgeTransaction({
            txId: txId,
            user: user,
            token: token,
            amount: amount,
            sourceChain: sourceChain,
            targetChain: ChainId.ETHEREUM,
            direction: Direction.WITHDRAW,
            status: Status.PENDING,
            timestamp: block.timestamp,
            confirmations: 1,
            targetTxHash: sourceTxHash
        });

        validatorConfirmed[txId][msg.sender] = true;

        emit WithdrawInitiated(txId, user, token, amount, sourceChain);
        emit TransactionConfirmed(txId, msg.sender, 1);

        return txId;
    }

    /**
     * @dev 검증자 확인
     */
    function confirmTransaction(bytes32 txId)
        external
        onlyRole(VALIDATOR_ROLE)
    {
        BridgeTransaction storage txn = transactions[txId];
        require(txn.txId != bytes32(0), "Transaction not found");
        require(txn.status == Status.PENDING, "Transaction not pending");
        require(!validatorConfirmed[txId][msg.sender], "Already confirmed");

        validatorConfirmed[txId][msg.sender] = true;
        txn.confirmations++;

        emit TransactionConfirmed(txId, msg.sender, txn.confirmations);

        // 충분한 확인이 있으면 자동 실행
        if (txn.confirmations >= requiredConfirmations) {
            _executeTransaction(txId);
        }
    }

    /**
     * @dev 거래 실행 (출금 완료)
     */
    function _executeTransaction(bytes32 txId) internal {
        BridgeTransaction storage txn = transactions[txId];
        require(txn.status == Status.PENDING, "Transaction not pending");
        require(
            txn.confirmations >= requiredConfirmations,
            "Insufficient confirmations"
        );

        if (txn.direction == Direction.WITHDRAW) {
            // 토큰 전송 (Unlock or Mint)
            IERC20(txn.token).safeTransfer(txn.user, txn.amount);
        }

        txn.status = Status.EXECUTED;

        emit TransactionExecuted(txId, txn.user, txn.amount);
    }

    /**
     * @dev 수동 거래 실행
     */
    function executeTransaction(bytes32 txId)
        external
        onlyRole(OPERATOR_ROLE)
    {
        _executeTransaction(txId);
    }

    /**
     * @dev 거래 환불
     */
    function refundTransaction(bytes32 txId)
        external
        onlyRole(OPERATOR_ROLE)
        nonReentrant
    {
        BridgeTransaction storage txn = transactions[txId];
        require(txn.status == Status.PENDING, "Transaction not pending");
        require(txn.direction == Direction.DEPOSIT, "Can only refund deposits");

        IERC20(txn.token).safeTransfer(txn.user, txn.amount);
        txn.status = Status.REFUNDED;

        emit TransactionRefunded(txId, txn.user, txn.amount);
    }

    /**
     * @dev 일일 한도 체크 및 업데이트
     */
    function _checkDailyLimit(address token, uint256 amount) internal {
        SupportedToken storage tokenInfo = supportedTokens[token];

        // 24시간 경과 시 리셋
        if (block.timestamp >= tokenInfo.lastResetTime + 1 days) {
            tokenInfo.dailyVolume = 0;
            tokenInfo.lastResetTime = block.timestamp;
        }

        require(
            tokenInfo.dailyVolume + amount <= tokenInfo.dailyLimit,
            "Daily limit exceeded"
        );

        tokenInfo.dailyVolume += amount;
    }

    /**
     * @dev 수수료 업데이트
     */
    function updateFee(uint256 newFee) external onlyRole(OPERATOR_ROLE) {
        require(newFee <= 100, "Fee too high"); // Max 1%
        uint256 oldFee = bridgeFee;
        bridgeFee = newFee;
        emit FeeUpdated(oldFee, newFee);
    }

    /**
     * @dev 필요 확인 수 업데이트
     */
    function updateRequiredConfirmations(uint256 count)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(count > 0 && count <= 10, "Invalid count");
        requiredConfirmations = count;
    }

    /**
     * @dev 수수료 수령자 변경
     */
    function updateFeeRecipient(address newRecipient)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newRecipient != address(0), "Invalid recipient");
        feeRecipient = newRecipient;
    }

    /**
     * @dev 긴급 정지
     */
    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    /**
     * @dev 긴급 정지 해제
     */
    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    /**
     * @dev 긴급 출금 (관리자만)
     */
    function emergencyWithdraw(address token, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    /**
     * @dev 거래 정보 조회
     */
    function getTransaction(bytes32 txId)
        external
        view
        returns (BridgeTransaction memory)
    {
        return transactions[txId];
    }

    /**
     * @dev 토큰 정보 조회
     */
    function getTokenInfo(address token)
        external
        view
        returns (SupportedToken memory)
    {
        return supportedTokens[token];
    }

    /**
     * @dev 검증자 확인 여부
     */
    function hasValidatorConfirmed(bytes32 txId, address validator)
        external
        view
        returns (bool)
    {
        return validatorConfirmed[txId][validator];
    }

    /**
     * @dev 브릿지 통계
     */
    function getStats() external view returns (
        uint256 totalVolume,
        uint256 totalTransactions,
        uint256 currentFee
    ) {
        return (totalBridgedVolume, transactionCount, bridgeFee);
    }
}
