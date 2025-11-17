/**
 * JWT 인증 미들웨어
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const redis = require('../database/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'konet-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * JWT 토큰 생성
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Refresh 토큰 생성
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

/**
 * JWT 토큰 검증
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 인증 미들웨어
 */
async function authenticate(req, res, next) {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '인증 토큰이 필요합니다'
      });
    }

    const token = authHeader.substring(7);

    // 블랙리스트 확인
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        error: '유효하지 않은 토큰입니다'
      });
    }

    // 토큰 검증
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        error: '토큰이 만료되었거나 유효하지 않습니다'
      });
    }

    // 사용자 정보를 req에 저장
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      error: '인증 처리 중 오류가 발생했습니다'
    });
  }
}

/**
 * 역할 기반 권한 검증
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: '인증이 필요합니다'
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: '권한이 없습니다'
      });
    }

    next();
  };
}

/**
 * 토큰 블랙리스트 추가
 */
async function blacklistToken(token) {
  try {
    const decoded = verifyToken(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.set(`blacklist:${token}`, true, ttl);
      }
    }
    return true;
  } catch (error) {
    logger.error('Blacklist token error:', error);
    return false;
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  authenticate,
  authorize,
  blacklistToken
};
