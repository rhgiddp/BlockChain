/**
 * KONET Bridge Service
 * 크로스체인 브릿지 오프체인 검증자 서비스
 */

const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// 환경 변수
const BRIDGE_CONTRACT_ADDRESS = process.env.BRIDGE_CONTRACT_ADDRESS || '';
const VALIDATOR_PRIVATE_KEY = process.env.VALIDATOR_PRIVATE_KEY || '';
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

// 브릿지 컨트랙트 ABI (간략화)
const BRIDGE_ABI = [
  'event DepositInitiated(bytes32 indexed txId, address indexed user, address indexed token, uint256 amount, uint8 targetChain)',
  'event WithdrawInitiated(bytes32 indexed txId, address indexed user, address indexed token, uint256 amount, uint8 sourceChain)',
  'function confirmTransaction(bytes32 txId) external',
  'function initiateWithdraw(address user, address token, uint256 amount, uint8 sourceChain, bytes32 sourceTxHash) external returns (bytes32)',
  'function getTransaction(bytes32 txId) external view returns (tuple(bytes32 txId, address user, address token, uint256 amount, uint8 sourceChain, uint8 targetChain, uint8 direction, uint8 status, uint256 timestamp, uint256 confirmations, bytes32 targetTxHash))'
];

// Provider 및 Wallet 설정
let provider;
let wallet;
let bridgeContract;

if (BRIDGE_CONTRACT_ADDRESS && VALIDATOR_PRIVATE_KEY) {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, provider);
  bridgeContract = new ethers.Contract(BRIDGE_CONTRACT_ADDRESS, BRIDGE_ABI, wallet);
}

// 트랜잭션 큐
const pendingTransactions = new Map();
const processedTransactions = new Set();

/**
 * 이벤트 리스너 시작
 */
async function startEventListener() {
  if (!bridgeContract) {
    console.log('⚠️  Bridge contract not configured. Skipping event listener.');
    return;
  }

  console.log('🔍 Starting event listener...');

  // Deposit 이벤트 감지
  bridgeContract.on('DepositInitiated', async (txId, user, token, amount, targetChain, event) => {
    console.log('📥 Deposit detected:', {
      txId,
      user,
      token,
      amount: ethers.formatEther(amount),
      targetChain
    });

    // 검증 후 대상 체인에서 출금 처리
    await processDeposit(txId, user, token, amount, targetChain);
  });

  // Withdraw 이벤트 감지
  bridgeContract.on('WithdrawInitiated', async (txId, user, token, amount, sourceChain, event) => {
    console.log('📤 Withdraw detected:', {
      txId,
      user,
      token,
      amount: ethers.formatEther(amount),
      sourceChain
    });

    // 자동 확인
    await confirmTransaction(txId);
  });

  console.log('✅ Event listener started');
}

/**
 * Deposit 처리 (소스 체인 → 타겟 체인)
 */
async function processDeposit(txId, user, token, amount, targetChain) {
  if (processedTransactions.has(txId)) {
    console.log('Already processed:', txId);
    return;
  }

  try {
    // 실제로는 타겟 체인의 브릿지 컨트랙트에 initiateWithdraw 호출
    // 여기서는 시뮬레이션
    console.log('🔄 Processing deposit on target chain...');

    // 타겟 체인 RPC 연결 (예시)
    const targetProvider = new ethers.JsonRpcProvider(getTargetChainRPC(targetChain));
    const targetWallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, targetProvider);
    const targetBridge = new ethers.Contract(
      BRIDGE_CONTRACT_ADDRESS,
      BRIDGE_ABI,
      targetWallet
    );

    // 출금 시작
    const tx = await targetBridge.initiateWithdraw(
      user,
      token,
      amount,
      0, // sourceChain (현재 체인)
      txId
    );

    await tx.wait();
    processedTransactions.add(txId);

    console.log('✅ Deposit processed:', tx.hash);
  } catch (error) {
    console.error('❌ Error processing deposit:', error.message);
  }
}

/**
 * 트랜잭션 확인
 */
async function confirmTransaction(txId) {
  if (!bridgeContract) return;

  try {
    console.log('✍️  Confirming transaction:', txId);

    const tx = await bridgeContract.confirmTransaction(txId);
    await tx.wait();

    console.log('✅ Transaction confirmed:', tx.hash);
  } catch (error) {
    console.error('❌ Error confirming transaction:', error.message);
  }
}

/**
 * 타겟 체인 RPC URL 가져오기
 */
function getTargetChainRPC(chainId) {
  const chains = {
    0: 'https://mainnet.infura.io/v3/YOUR_KEY', // Ethereum
    1: 'https://bsc-dataseed.binance.org/', // BSC
    2: 'https://polygon-rpc.com', // Polygon
    3: 'https://api.avax.network/ext/bc/C/rpc', // Avalanche
    4: 'https://arb1.arbitrum.io/rpc', // Arbitrum
    5: 'https://mainnet.optimism.io' // Optimism
  };

  return chains[chainId] || chains[0];
}

// ==========================================
// REST API
// ==========================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'bridge-validator',
    timestamp: new Date().toISOString()
  });
});

/**
 * 트랜잭션 상태 조회
 */
app.get('/api/transaction/:txId', async (req, res) => {
  try {
    const { txId } = req.params;

    if (!bridgeContract) {
      return res.status(503).json({
        error: 'Bridge contract not configured'
      });
    }

    const tx = await bridgeContract.getTransaction(txId);

    res.json({
      txId: tx.txId,
      user: tx.user,
      token: tx.token,
      amount: ethers.formatEther(tx.amount),
      sourceChain: tx.sourceChain,
      targetChain: tx.targetChain,
      status: ['PENDING', 'CONFIRMED', 'EXECUTED', 'REFUNDED', 'CANCELLED'][tx.status],
      confirmations: Number(tx.confirmations),
      timestamp: Number(tx.timestamp)
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 수동 확인 (관리자)
 */
app.post('/api/confirm/:txId', async (req, res) => {
  try {
    const { txId } = req.params;

    await confirmTransaction(txId);

    res.json({
      message: 'Transaction confirmed',
      txId
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 검증자 통계
 */
app.get('/api/stats', async (req, res) => {
  try {
    res.json({
      pendingTransactions: pendingTransactions.size,
      processedTransactions: processedTransactions.size,
      validatorAddress: wallet ? wallet.address : 'Not configured'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 체인별 상태 조회
 */
app.get('/api/chains', async (req, res) => {
  res.json({
    chains: [
      { id: 0, name: 'Ethereum', rpc: getTargetChainRPC(0) },
      { id: 1, name: 'BSC', rpc: getTargetChainRPC(1) },
      { id: 2, name: 'Polygon', rpc: getTargetChainRPC(2) },
      { id: 3, name: 'Avalanche', rpc: getTargetChainRPC(3) },
      { id: 4, name: 'Arbitrum', rpc: getTargetChainRPC(4) },
      { id: 5, name: 'Optimism', rpc: getTargetChainRPC(5) }
    ]
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// 서버 시작
app.listen(PORT, async () => {
  console.log(`🌉 Bridge Service started: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // 이벤트 리스너 시작
  if (BRIDGE_CONTRACT_ADDRESS && VALIDATOR_PRIVATE_KEY) {
    await startEventListener();
  } else {
    console.log('⚠️  Please configure BRIDGE_CONTRACT_ADDRESS and VALIDATOR_PRIVATE_KEY');
  }
});

module.exports = { app };
