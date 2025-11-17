/**
 * 인증 라우터
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const redis = require('../database/redis');
const logger = require('../utils/logger');
const {
  generateToken,
  generateRefreshToken,
  verifyToken,
  authenticate,
  blacklistToken
} = require('../middleware/auth');

const router = express.Router();

/**
 * 회원가입
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // 입력 검증
    if (!email || !password || !username) {
      return res.status(400).json({
        error: '이메일, 비밀번호, 사용자명은 필수입니다'
      });
    }

    // 이메일 중복 확인
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: '이미 사용 중인 이메일입니다'
      });
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(password, 10);

    // 사용자 생성
    const result = await db.query(
      `INSERT INTO users (email, password_hash, username, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, email, username, created_at`,
      [email, passwordHash, username]
    );

    const user = result.rows[0];

    logger.info('User registered', { userId: user.id, email });

    res.status(201).json({
      message: '회원가입이 완료되었습니다',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({
      error: '회원가입 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * 로그인
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 입력 검증
    if (!email || !password) {
      return res.status(400).json({
        error: '이메일과 비밀번호는 필수입니다'
      });
    }

    // 사용자 조회
    const result = await db.query(
      'SELECT id, email, username, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: '이메일 또는 비밀번호가 올바르지 않습니다'
      });
    }

    const user = result.rows[0];

    // 계정 활성화 확인
    if (!user.is_active) {
      return res.status(403).json({
        error: '비활성화된 계정입니다'
      });
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: '이메일 또는 비밀번호가 올바르지 않습니다'
      });
    }

    // 토큰 생성
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email
    });

    // 세션 생성
    const sessionId = uuidv4();
    await redis.setSession(sessionId, {
      userId: user.id,
      email: user.email,
      loginAt: new Date().toISOString()
    });

    // 마지막 로그인 시간 업데이트
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info('User logged in', { userId: user.id, email });

    res.json({
      message: '로그인 성공',
      accessToken,
      refreshToken,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: '로그인 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * 로그아웃
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.substring(7);

    // 토큰 블랙리스트 추가
    await blacklistToken(token);

    // 세션 삭제
    if (req.body.sessionId) {
      await redis.delSession(req.body.sessionId);
    }

    logger.info('User logged out', { userId: req.user.id });

    res.json({
      message: '로그아웃되었습니다'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: '로그아웃 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * 토큰 갱신
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token이 필요합니다'
      });
    }

    // 토큰 검증
    const decoded = verifyToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        error: '유효하지 않은 refresh token입니다'
      });
    }

    // 사용자 조회
    const result = await db.query(
      'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: '사용자를 찾을 수 없습니다'
      });
    }

    const user = result.rows[0];

    // 새 액세스 토큰 생성
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    res.json({
      accessToken
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      error: '토큰 갱신 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 정보 조회
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, username, role, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '사용자를 찾을 수 없습니다'
      });
    }

    res.json({
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({
      error: '사용자 정보 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
