/**
 * 거래 라우터
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const redis = require('../database/redis');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// 모든 라우트에 인증 필요
router.use(authenticate);

/**
 * 거래 해시 생성
 */
function generateTxHash() {
  const randomBytes = crypto.randomBytes(32);
  return '0x' + randomBytes.toString('hex');
}

/**
 * 거래 전송
 * POST /api/transactions/send
 */
router.post('/send', async (req, res) => {
  try {
    const { from_address, to_address, amount, token_symbol = 'KONET', memo } = req.body;

    // 입력 검증
    if (!from_address || !to_address || !amount) {
      return res.status(400).json({
        error: '발신 주소, 수신 주소, 금액은 필수입니다'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: '금액은 0보다 커야 합니다'
      });
    }

    // 발신 지갑 소유권 확인
    const walletResult = await db.query(
      'SELECT id FROM wallets WHERE address = $1 AND user_id = $2',
      [from_address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(403).json({
        error: '지갑에 대한 권한이 없습니다'
      });
    }

    const walletId = walletResult.rows[0].id;

    // 트랜잭션 시작
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 잔액 확인 및 차감
      const balanceResult = await client.query(
        `SELECT balance FROM balances
         WHERE wallet_id = $1 AND token_symbol = $2
         FOR UPDATE`,
        [walletId, token_symbol]
      );

      if (balanceResult.rows.length === 0) {
        throw new Error('토큰 잔액을 찾을 수 없습니다');
      }

      const currentBalance = parseFloat(balanceResult.rows[0].balance);

      if (currentBalance < amount) {
        throw new Error('잔액이 부족합니다');
      }

      // 발신 지갑 잔액 차감
      await client.query(
        `UPDATE balances
         SET balance = balance - $1, updated_at = NOW()
         WHERE wallet_id = $2 AND token_symbol = $3`,
        [amount, walletId, token_symbol]
      );

      // 수신 지갑 확인 및 잔액 증가
      const toWalletResult = await client.query(
        'SELECT id FROM wallets WHERE address = $1',
        [to_address]
      );

      if (toWalletResult.rows.length > 0) {
        const toWalletId = toWalletResult.rows[0].id;

        // 수신 지갑 잔액 확인
        const toBalanceResult = await client.query(
          'SELECT id FROM balances WHERE wallet_id = $1 AND token_symbol = $2',
          [toWalletId, token_symbol]
        );

        if (toBalanceResult.rows.length === 0) {
          // 잔액 레코드가 없으면 생성
          await client.query(
            `INSERT INTO balances (wallet_id, token_symbol, balance)
             VALUES ($1, $2, 0)`,
            [toWalletId, token_symbol]
          );
        }

        // 잔액 증가
        await client.query(
          `UPDATE balances
           SET balance = balance + $1, updated_at = NOW()
           WHERE wallet_id = $2 AND token_symbol = $3`,
          [amount, toWalletId, token_symbol]
        );
      }

      // 거래 기록 생성
      const txHash = generateTxHash();
      const txResult = await client.query(
        `INSERT INTO transactions (
          tx_hash, type, from_address, to_address, amount, token_symbol,
          fee, status, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, tx_hash, created_at`,
        [txHash, 'transfer', from_address, to_address, amount, token_symbol,
         0, 'pending', memo]
      );

      await client.query('COMMIT');

      const transaction = txResult.rows[0];

      // 비동기로 거래 처리 (실제로는 블록체인 전송)
      setImmediate(async () => {
        try {
          // 여기서 실제 블록체인 거래 전송
          // await sendToBlockchain(txHash, from_address, to_address, amount);

          // 거래 상태 업데이트
          await db.query(
            `UPDATE transactions
             SET status = 'confirmed', confirmed_at = NOW()
             WHERE tx_hash = $1`,
            [txHash]
          );

          logger.info('Transaction confirmed', { txHash });
        } catch (error) {
          logger.error('Transaction processing error:', error);
          await db.query(
            `UPDATE transactions SET status = 'failed' WHERE tx_hash = $1`,
            [txHash]
          );
        }
      });

      logger.info('Transaction created', {
        userId: req.user.id,
        txHash,
        from: from_address,
        to: to_address,
        amount
      });

      res.status(201).json({
        message: '거래가 생성되었습니다',
        transaction: {
          tx_hash: transaction.tx_hash,
          from_address,
          to_address,
          amount,
          token_symbol,
          status: 'pending',
          created_at: transaction.created_at
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Send transaction error:', error);
    res.status(500).json({
      error: error.message || '거래 전송 중 오류가 발생했습니다'
    });
  }
});

/**
 * 거래 내역 조회
 * GET /api/transactions/:address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { page = 1, limit = 20, type, status } = req.query;

    const offset = (page - 1) * limit;

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

    // 쿼리 조건 구성
    let query = `
      SELECT tx_hash, type, from_address, to_address, amount, token_symbol,
             fee, status, memo, created_at, confirmed_at
      FROM transactions
      WHERE (from_address = $1 OR to_address = $1)
    `;
    const params = [address];
    let paramIndex = 2;

    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // 총 개수 조회
    const countResult = await db.query(
      `SELECT COUNT(*) FROM transactions WHERE from_address = $1 OR to_address = $1`,
      [address]
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get transaction history error:', error);
    res.status(500).json({
      error: '거래 내역 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 거래 상태 조회
 * GET /api/transactions/:txHash/status
 */
router.get('/:txHash/status', async (req, res) => {
  try {
    const { txHash } = req.params;

    const result = await db.query(
      `SELECT tx_hash, type, from_address, to_address, amount, token_symbol,
              status, created_at, confirmed_at
       FROM transactions
       WHERE tx_hash = $1`,
      [txHash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '거래를 찾을 수 없습니다'
      });
    }

    const transaction = result.rows[0];

    // 블록 정보 (실제로는 블록체인에서 조회)
    const blockInfo = transaction.status === 'confirmed' ? {
      block_number: Math.floor(Math.random() * 1000000),
      confirmations: Math.floor(Math.random() * 100) + 1
    } : null;

    res.json({
      transaction: {
        ...transaction,
        block_info: blockInfo
      }
    });
  } catch (error) {
    logger.error('Get transaction status error:', error);
    res.status(500).json({
      error: '거래 상태 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 거래 취소 (pending 상태만)
 * POST /api/transactions/:txHash/cancel
 */
router.post('/:txHash/cancel', async (req, res) => {
  try {
    const { txHash } = req.params;

    // 거래 조회
    const txResult = await db.query(
      `SELECT from_address, status FROM transactions WHERE tx_hash = $1`,
      [txHash]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({
        error: '거래를 찾을 수 없습니다'
      });
    }

    const transaction = txResult.rows[0];

    // 지갑 소유권 확인
    const walletResult = await db.query(
      'SELECT id FROM wallets WHERE address = $1 AND user_id = $2',
      [transaction.from_address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(403).json({
        error: '권한이 없습니다'
      });
    }

    // pending 상태만 취소 가능
    if (transaction.status !== 'pending') {
      return res.status(400).json({
        error: 'pending 상태의 거래만 취소할 수 있습니다'
      });
    }

    // 거래 취소
    await db.query(
      `UPDATE transactions SET status = 'cancelled' WHERE tx_hash = $1`,
      [txHash]
    );

    logger.info('Transaction cancelled', {
      userId: req.user.id,
      txHash
    });

    res.json({
      message: '거래가 취소되었습니다'
    });
  } catch (error) {
    logger.error('Cancel transaction error:', error);
    res.status(500).json({
      error: '거래 취소 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
