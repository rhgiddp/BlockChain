/**
 * 지갑 라우터
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
 * 암호화 키 (환경 변수로 관리 필요)
 */
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'konet-wallet-encryption-key-32b';
const ENCRYPTION_IV_LENGTH = 16;

/**
 * 개인키 암호화
 */
function encryptPrivateKey(privateKey) {
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    iv
  );

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 개인키 복호화
 */
function decryptPrivateKey(encryptedKey) {
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    iv
  );

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 지갑 주소 생성 (간단한 구현)
 */
function generateWalletAddress() {
  const randomBytes = crypto.randomBytes(20);
  return '0x' + randomBytes.toString('hex');
}

/**
 * 개인키 생성
 */
function generatePrivateKey() {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('hex');
}

/**
 * 지갑 생성
 * POST /api/wallet/create
 */
router.post('/create', async (req, res) => {
  try {
    const { wallet_type = 'hot', label } = req.body;

    // 지갑 타입 검증
    if (!['hot', 'cold', 'multisig'].includes(wallet_type)) {
      return res.status(400).json({
        error: '유효하지 않은 지갑 타입입니다'
      });
    }

    // 지갑 주소 및 개인키 생성
    const address = generateWalletAddress();
    const privateKey = generatePrivateKey();
    const encryptedPrivateKey = encryptPrivateKey(privateKey);

    // 데이터베이스에 저장
    const result = await db.query(
      `INSERT INTO wallets (user_id, address, encrypted_private_key, wallet_type, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, address, wallet_type, label, created_at`,
      [req.user.id, address, encryptedPrivateKey, wallet_type, label]
    );

    const wallet = result.rows[0];

    // 초기 잔액 생성
    await db.query(
      `INSERT INTO balances (wallet_id, token_symbol, balance)
       VALUES ($1, 'KONET', 0)`,
      [wallet.id]
    );

    logger.info('Wallet created', {
      userId: req.user.id,
      walletId: wallet.id,
      address: wallet.address
    });

    res.status(201).json({
      message: '지갑이 생성되었습니다',
      wallet: {
        id: wallet.id,
        address: wallet.address,
        wallet_type: wallet.wallet_type,
        label: wallet.label,
        created_at: wallet.created_at
      }
    });
  } catch (error) {
    logger.error('Create wallet error:', error);
    res.status(500).json({
      error: '지갑 생성 중 오류가 발생했습니다'
    });
  }
});

/**
 * 지갑 목록 조회
 * GET /api/wallet
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, address, wallet_type, label, created_at
       FROM wallets
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      wallets: result.rows
    });
  } catch (error) {
    logger.error('Get wallets error:', error);
    res.status(500).json({
      error: '지갑 목록 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 지갑 상세 조회
 * GET /api/wallet/:address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // 지갑 조회
    const walletResult = await db.query(
      `SELECT w.id, w.address, w.wallet_type, w.label, w.created_at,
              array_agg(json_build_object(
                'token', b.token_symbol,
                'balance', b.balance
              )) as balances
       FROM wallets w
       LEFT JOIN balances b ON w.id = b.wallet_id
       WHERE w.address = $1 AND w.user_id = $2
       GROUP BY w.id`,
      [address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        error: '지갑을 찾을 수 없습니다'
      });
    }

    const wallet = walletResult.rows[0];

    // 최근 거래 내역
    const txResult = await db.query(
      `SELECT tx_hash, type, amount, token_symbol, status, created_at
       FROM transactions
       WHERE from_address = $1 OR to_address = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [address]
    );

    res.json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        wallet_type: wallet.wallet_type,
        label: wallet.label,
        balances: wallet.balances,
        created_at: wallet.created_at
      },
      recent_transactions: txResult.rows
    });
  } catch (error) {
    logger.error('Get wallet details error:', error);
    res.status(500).json({
      error: '지갑 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 지갑 개인키 내보내기 (주의: 보안 위험)
 * POST /api/wallet/:address/export
 */
router.post('/:address/export', async (req, res) => {
  try {
    const { address } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: '비밀번호가 필요합니다'
      });
    }

    // 사용자 비밀번호 확인
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const bcrypt = require('bcrypt');
    const isPasswordValid = await bcrypt.compare(
      password,
      userResult.rows[0].password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        error: '비밀번호가 올바르지 않습니다'
      });
    }

    // 지갑 조회
    const walletResult = await db.query(
      `SELECT encrypted_private_key FROM wallets
       WHERE address = $1 AND user_id = $2`,
      [address, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        error: '지갑을 찾을 수 없습니다'
      });
    }

    // 개인키 복호화
    const privateKey = decryptPrivateKey(
      walletResult.rows[0].encrypted_private_key
    );

    logger.warn('Private key exported', {
      userId: req.user.id,
      address
    });

    res.json({
      address,
      privateKey,
      warning: '개인키는 절대 공유하지 마세요. 분실 시 복구할 수 없습니다.'
    });
  } catch (error) {
    logger.error('Export private key error:', error);
    res.status(500).json({
      error: '개인키 내보내기 중 오류가 발생했습니다'
    });
  }
});

/**
 * 지갑 삭제
 * DELETE /api/wallet/:address
 */
router.delete('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const result = await db.query(
      'DELETE FROM wallets WHERE address = $1 AND user_id = $2 RETURNING id',
      [address, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '지갑을 찾을 수 없습니다'
      });
    }

    logger.info('Wallet deleted', {
      userId: req.user.id,
      address
    });

    res.json({
      message: '지갑이 삭제되었습니다'
    });
  } catch (error) {
    logger.error('Delete wallet error:', error);
    res.status(500).json({
      error: '지갑 삭제 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
