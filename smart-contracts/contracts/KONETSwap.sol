// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title KONETSwap
 * @dev AMM (Automated Market Maker) DEX - Uniswap V2 스타일
 *
 * 주요 기능:
 * - 유동성 풀 생성 및 관리
 * - 토큰 스왑 (Constant Product Formula: x * y = k)
 * - LP 토큰 발행
 * - 수수료 (0.3%)
 */
contract KONETSwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 유동성 풀 구조체
    struct Pool {
        address tokenA;
        address tokenB;
        uint256 reserveA;
        uint256 reserveB;
        uint256 totalLiquidity;
        uint256 lastUpdate;
        bool exists;
    }

    // 유동성 공급자 정보
    struct LiquidityProvider {
        uint256 liquidity;
        uint256 tokenADeposited;
        uint256 tokenBDeposited;
        uint256 timestamp;
    }

    // 풀 ID => Pool
    mapping(bytes32 => Pool) public pools;

    // 풀 ID => 주소 => LiquidityProvider
    mapping(bytes32 => mapping(address => LiquidityProvider)) public liquidityProviders;

    // 거래 수수료 (0.3% = 30/10000)
    uint256 public constant FEE_NUMERATOR = 30;
    uint256 public constant FEE_DENOMINATOR = 10000;

    // 최소 유동성
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // 통계
    uint256 public totalPools;
    uint256 public totalVolume;
    uint256 public totalFees;

    // 이벤트
    event PoolCreated(
        bytes32 indexed poolId,
        address indexed tokenA,
        address indexed tokenB,
        uint256 reserveA,
        uint256 reserveB
    );

    event LiquidityAdded(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );

    event LiquidityRemoved(
        bytes32 indexed poolId,
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );

    event Swap(
        bytes32 indexed poolId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev 풀 ID 생성
     */
    function getPoolId(address tokenA, address tokenB)
        public
        pure
        returns (bytes32)
    {
        // 토큰 순서 정렬 (항상 같은 ID)
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);

        return keccak256(abi.encodePacked(token0, token1));
    }

    /**
     * @dev 풀 생성
     */
    function createPool(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external nonReentrant returns (bytes32) {
        require(tokenA != tokenB, "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");
        require(amountA > 0 && amountB > 0, "Insufficient amounts");

        bytes32 poolId = getPoolId(tokenA, tokenB);
        require(!pools[poolId].exists, "Pool already exists");

        // 토큰 전송
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        // 초기 유동성 계산 (기하평균)
        uint256 liquidity = sqrt(amountA * amountB);
        require(liquidity > MINIMUM_LIQUIDITY, "Insufficient liquidity");

        // 풀 생성
        pools[poolId] = Pool({
            tokenA: tokenA,
            tokenB: tokenB,
            reserveA: amountA,
            reserveB: amountB,
            totalLiquidity: liquidity,
            lastUpdate: block.timestamp,
            exists: true
        });

        // LP 토큰 발행
        liquidityProviders[poolId][msg.sender] = LiquidityProvider({
            liquidity: liquidity,
            tokenADeposited: amountA,
            tokenBDeposited: amountB,
            timestamp: block.timestamp
        });

        totalPools++;

        emit PoolCreated(poolId, tokenA, tokenB, amountA, amountB);
        emit LiquidityAdded(poolId, msg.sender, amountA, amountB, liquidity);

        return poolId;
    }

    /**
     * @dev 유동성 추가
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external nonReentrant returns (uint256 liquidity) {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool does not exist");

        // 최적 비율 계산
        uint256 optimalAmountB = quote(amountA, pool.reserveA, pool.reserveB);
        require(amountB >= optimalAmountB, "Insufficient tokenB amount");

        // 실제 사용될 금액
        uint256 actualAmountB = optimalAmountB;

        // 토큰 전송
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), actualAmountB);

        // 유동성 계산
        liquidity = (amountA * pool.totalLiquidity) / pool.reserveA;

        // 풀 업데이트
        pool.reserveA += amountA;
        pool.reserveB += actualAmountB;
        pool.totalLiquidity += liquidity;
        pool.lastUpdate = block.timestamp;

        // LP 정보 업데이트
        LiquidityProvider storage lp = liquidityProviders[poolId][msg.sender];
        lp.liquidity += liquidity;
        lp.tokenADeposited += amountA;
        lp.tokenBDeposited += actualAmountB;

        emit LiquidityAdded(poolId, msg.sender, amountA, actualAmountB, liquidity);

        return liquidity;
    }

    /**
     * @dev 유동성 제거
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity
    ) external nonReentrant returns (uint256 amountA, uint256 amountB) {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool does not exist");

        LiquidityProvider storage lp = liquidityProviders[poolId][msg.sender];
        require(lp.liquidity >= liquidity, "Insufficient liquidity");

        // 반환할 토큰 계산
        amountA = (liquidity * pool.reserveA) / pool.totalLiquidity;
        amountB = (liquidity * pool.reserveB) / pool.totalLiquidity;

        require(amountA > 0 && amountB > 0, "Insufficient output amounts");

        // LP 정보 업데이트
        lp.liquidity -= liquidity;

        // 풀 업데이트
        pool.reserveA -= amountA;
        pool.reserveB -= amountB;
        pool.totalLiquidity -= liquidity;
        pool.lastUpdate = block.timestamp;

        // 토큰 전송
        IERC20(tokenA).safeTransfer(msg.sender, amountA);
        IERC20(tokenB).safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(poolId, msg.sender, amountA, amountB, liquidity);

        return (amountA, amountB);
    }

    /**
     * @dev 스왑 (정확한 입력)
     */
    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external nonReentrant returns (uint256 amountOut) {
        bytes32 poolId = getPoolId(tokenIn, tokenOut);
        Pool storage pool = pools[poolId];
        require(pool.exists, "Pool does not exist");
        require(amountIn > 0, "Insufficient input amount");

        // 출력량 계산
        amountOut = getAmountOut(amountIn, tokenIn, tokenOut, poolId);
        require(amountOut >= amountOutMin, "Insufficient output amount");

        // 수수료 계산
        uint256 fee = (amountIn * FEE_NUMERATOR) / FEE_DENOMINATOR;

        // 토큰 전송
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        // 풀 업데이트
        if (tokenIn == pool.tokenA) {
            pool.reserveA += amountIn;
            pool.reserveB -= amountOut;
        } else {
            pool.reserveB += amountIn;
            pool.reserveA -= amountOut;
        }
        pool.lastUpdate = block.timestamp;

        // 통계 업데이트
        totalVolume += amountIn;
        totalFees += fee;

        emit Swap(poolId, msg.sender, tokenIn, tokenOut, amountIn, amountOut, fee);

        return amountOut;
    }

    /**
     * @dev 출력량 계산 (Constant Product Formula)
     */
    function getAmountOut(
        uint256 amountIn,
        address tokenIn,
        address tokenOut,
        bytes32 poolId
    ) public view returns (uint256) {
        Pool memory pool = pools[poolId];
        require(pool.exists, "Pool does not exist");

        uint256 reserveIn;
        uint256 reserveOut;

        if (tokenIn == pool.tokenA) {
            reserveIn = pool.reserveA;
            reserveOut = pool.reserveB;
        } else {
            reserveIn = pool.reserveB;
            reserveOut = pool.reserveA;
        }

        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        // 수수료 차감 (0.3%)
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_NUMERATOR);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;

        return numerator / denominator;
    }

    /**
     * @dev 입력량 계산 (역계산)
     */
    function getAmountIn(
        uint256 amountOut,
        address tokenIn,
        address tokenOut,
        bytes32 poolId
    ) public view returns (uint256) {
        Pool memory pool = pools[poolId];
        require(pool.exists, "Pool does not exist");

        uint256 reserveIn;
        uint256 reserveOut;

        if (tokenIn == pool.tokenA) {
            reserveIn = pool.reserveA;
            reserveOut = pool.reserveB;
        } else {
            reserveIn = pool.reserveB;
            reserveOut = pool.reserveA;
        }

        require(reserveIn > 0 && reserveOut > amountOut, "Insufficient liquidity");

        uint256 numerator = reserveIn * amountOut * FEE_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * (FEE_DENOMINATOR - FEE_NUMERATOR);

        return (numerator / denominator) + 1;
    }

    /**
     * @dev 최적 비율 계산
     */
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure returns (uint256) {
        require(amountA > 0, "Insufficient amount");
        require(reserveA > 0 && reserveB > 0, "Insufficient liquidity");
        return (amountA * reserveB) / reserveA;
    }

    /**
     * @dev 제곱근 계산 (Babylonian method)
     */
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /**
     * @dev 풀 정보 조회
     */
    function getPool(bytes32 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }

    /**
     * @dev LP 정보 조회
     */
    function getLPInfo(bytes32 poolId, address provider)
        external
        view
        returns (LiquidityProvider memory)
    {
        return liquidityProviders[poolId][provider];
    }

    /**
     * @dev 가격 조회
     */
    function getPrice(address tokenA, address tokenB)
        external
        view
        returns (uint256)
    {
        bytes32 poolId = getPoolId(tokenA, tokenB);
        Pool memory pool = pools[poolId];
        require(pool.exists, "Pool does not exist");

        if (tokenA == pool.tokenA) {
            return (pool.reserveB * 1e18) / pool.reserveA;
        } else {
            return (pool.reserveA * 1e18) / pool.reserveB;
        }
    }

    /**
     * @dev 통계 조회
     */
    function getStats() external view returns (
        uint256 pools_,
        uint256 volume,
        uint256 fees
    ) {
        return (totalPools, totalVolume, totalFees);
    }
}
