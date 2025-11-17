/**
 * 잔액 조회 라우터
 */

const express = require('express');
const db = require('../database/db');
const redis = require('../database/redis');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// 모든 라우트에 인증 필요
router.use(authenticate);

/**
 * 지갑 잔액 조회
 * GET /api/balance/:address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // 캐시 확인
    const cacheKey = `balance:${address}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.debug('Balance cache hit', { address });
      return res.json(cached);
    }

    // 지갑 소유권 확인
    const walletResult = await db.query(
      'SELECT id FROM wallets WHERE address = $1 AND user_id = $2',
      [address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(403).json({
        error: '지갑에 대한 권한이 없습니다'
      });
    }

    const walletId = walletResult.rows[0].id;

    // 잔액 조회
    const balanceResult = await db.query(
      `SELECT token_symbol, balance, updated_at
       FROM balances
       WHERE wallet_id = $1
       ORDER BY token_symbol`,
      [walletId]
    );

    // 총 가치 계산 (USD)
    // 실제로는 외부 API에서 토큰 가격 조회
    const totalValueUSD = balanceResult.rows.reduce((sum, item) => {
      // 간단히 KONET = $1로 가정
      const tokenPrice = 1.0;
      return sum + (parseFloat(item.balance) * tokenPrice);
    }, 0);

    const response = {
      address,
      balances: balanceResult.rows,
      total_value_usd: totalValueUSD,
      last_updated: new Date().toISOString()
    };

    // 캐시 저장 (30초)
    await redis.set(cacheKey, response, 30);

    res.json(response);
  } catch (error) {
    logger.error('Get balance error:', error);
    res.status(500).json({
      error: '잔액 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 토큰별 잔액 조회
 * GET /api/balance/:address/:token
 */
router.get('/:address/:token', async (req, res) => {
  try {
    const { address, token } = req.params;

    // 지갑 소유권 확인
    const walletResult = await db.query(
      'SELECT id FROM wallets WHERE address = $1 AND user_id = $2',
      [address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(403).json({
        error: '지갑에 대한 권한이 없습니다'
      });
    }

    const walletId = walletResult.rows[0].id;

    // 토큰 잔액 조회
    const balanceResult = await db.query(
      `SELECT balance, updated_at
       FROM balances
       WHERE wallet_id = $1 AND token_symbol = $2`,
      [walletId, token.toUpperCase()]
    );

    if (balanceResult.rows.length === 0) {
      return res.json({
        address,
        token: token.toUpperCase(),
        balance: '0',
        message: '해당 토큰의 잔액 기록이 없습니다'
      });
    }

    const balance = balanceResult.rows[0];

    res.json({
      address,
      token: token.toUpperCase(),
      balance: balance.balance,
      updated_at: balance.updated_at
    });
  } catch (error) {
    logger.error('Get token balance error:', error);
    res.status(500).json({
      error: '토큰 잔액 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자의 모든 지갑 잔액 조회
 * GET /api/balance/user/summary
 */
router.get('/user/summary', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT w.address, w.label, b.token_symbol, b.balance, b.updated_at
       FROM wallets w
       LEFT JOIN balances b ON w.id = b.wallet_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC, b.token_symbol`,
      [req.user.id]
    );

    // 지갑별로 그룹화
    const wallets = {};
    result.rows.forEach(row => {
      if (!wallets[row.address]) {
        wallets[row.address] = {
          address: row.address,
          label: row.label,
          balances: []
        };
      }

      if (row.token_symbol) {
        wallets[row.address].balances.push({
          token: row.token_symbol,
          balance: row.balance,
          updated_at: row.updated_at
        });
      }
    });

    // 총 가치 계산
    let totalValueUSD = 0;
    Object.values(wallets).forEach(wallet => {
      wallet.balances.forEach(b => {
        totalValueUSD += parseFloat(b.balance) * 1.0; // 간단히 $1로 가정
      });
    });

    res.json({
      wallets: Object.values(wallets),
      total_value_usd: totalValueUSD,
      wallet_count: Object.keys(wallets).length
    });
  } catch (error) {
    logger.error('Get user balance summary error:', error);
    res.status(500).json({
      error: '잔액 요약 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 잔액 갱신 (블록체인과 동기화)
 * POST /api/balance/:address/refresh
 */
router.post('/:address/refresh', async (req, res) => {
  try {
    const { address } = req.params;

    // 지갑 소유권 확인
    const walletResult = await db.query(
      'SELECT id FROM wallets WHERE address = $1 AND user_id = $2',
      [address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(403).json({
        error: '지갑에 대한 권한이 없습니다'
      });
    }

    // 실제로는 블록체인에서 잔액 조회
    // const blockchainBalance = await fetchBalanceFromBlockchain(address);

    // 캐시 무효화
    await redis.del(`balance:${address}`);

    logger.info('Balance refreshed', {
      userId: req.user.id,
      address
    });

    res.json({
      message: '잔액이 갱신되었습니다',
      address
    });
  } catch (error) {
    logger.error('Refresh balance error:', error);
    res.status(500).json({
      error: '잔액 갱신 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
