/**
 * Redis 캐시 연결 (Admin Service)
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

// Redis 클라이언트 생성
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
});

// 연결 성공
redis.on('connect', () => {
  logger.info('Redis 연결 성공');
});

// 연결 준비 완료
redis.on('ready', () => {
  logger.info('Redis 준비 완료');
});

// 에러 핸들러
redis.on('error', (err) => {
  logger.error('Redis 에러:', err);
});

// 재연결
redis.on('reconnecting', () => {
  logger.warn('Redis 재연결 시도 중...');
});

/**
 * 캐시 설정
 */
async function set(key, value, expireSeconds = 3600) {
  try {
    const data = JSON.stringify(value);
    if (expireSeconds) {
      await redis.setex(key, expireSeconds, data);
    } else {
      await redis.set(key, data);
    }
    return true;
  } catch (error) {
    logger.error('Redis set error', { key, error: error.message });
    return false;
  }
}

/**
 * 캐시 조회
 */
async function get(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Redis get error', { key, error: error.message });
    return null;
  }
}

/**
 * 캐시 삭제
 */
async function del(key) {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Redis del error', { key, error: error.message });
    return false;
  }
}

/**
 * 패턴으로 삭제
 */
async function delPattern(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  } catch (error) {
    logger.error('Redis delPattern error', { pattern, error: error.message });
    return 0;
  }
}

/**
 * 존재 여부 확인
 */
async function exists(key) {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis exists error', { key, error: error.message });
    return false;
  }
}

/**
 * TTL 설정
 */
async function expire(key, seconds) {
  try {
    await redis.expire(key, seconds);
    return true;
  } catch (error) {
    logger.error('Redis expire error', { key, error: error.message });
    return false;
  }
}

/**
 * 세션 저장
 */
async function setSession(sessionId, data, expireSeconds = 86400) {
  return set(`session:${sessionId}`, data, expireSeconds);
}

/**
 * 세션 조회
 */
async function getSession(sessionId) {
  return get(`session:${sessionId}`);
}

/**
 * 세션 삭제
 */
async function delSession(sessionId) {
  return del(`session:${sessionId}`);
}

/**
 * 연결 테스트
 */
async function ping() {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('Redis ping failed', error);
    throw error;
  }
}

/**
 * 연결 종료
 */
async function quit() {
  await redis.quit();
  logger.info('Redis connection closed');
}

module.exports = {
  redis,
  set,
  get,
  del,
  delPattern,
  exists,
  expire,
  setSession,
  getSession,
  delSession,
  ping,
  quit
};
