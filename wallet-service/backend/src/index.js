/**
 * KONET 지갑 서비스 메인 서버
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const db = require('./database/db');
const redis = require('./database/redis');

// 라우터
const authRouter = require('./routes/auth');
const walletRouter = require('./routes/wallet');
const transactionRouter = require('./routes/transaction');
const balanceRouter = require('./routes/balance');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 미들웨어 설정
// ==========================================

// 보안 헤더
app.use(helmet());

// CORS 설정
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// JSON 파싱
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting (DDoS 방어)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 최대 100 요청
  message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// 더 엄격한 Rate Limit (인증 관련)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15분에 5번만 허용
  skipSuccessfulRequests: true,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ==========================================
// 로깅 미들웨어
// ==========================================

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ==========================================
// 라우트
// ==========================================

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'connected',
    redis: 'connected'
  });
});

// API 라우트
app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/balance', balanceRouter);

// API 문서 (루트)
app.get('/', (req, res) => {
  res.json({
    name: 'KONET Wallet Service',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        refresh: 'POST /api/auth/refresh'
      },
      wallet: {
        create: 'POST /api/wallet/create',
        list: 'GET /api/wallet',
        details: 'GET /api/wallet/:address',
        export: 'POST /api/wallet/:address/export'
      },
      transactions: {
        send: 'POST /api/transactions/send',
        history: 'GET /api/transactions/:address',
        status: 'GET /api/transactions/:txHash/status'
      },
      balance: {
        get: 'GET /api/balance/:address'
      }
    }
  });
});

// ==========================================
// 에러 처리
// ==========================================

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `경로를 찾을 수 없습니다: ${req.path}`
  });
});

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  logger.error('서버 에러:', err);

  // 개발 환경에서는 스택 트레이스 포함
  const errorResponse = {
    error: err.message || '서버 오류가 발생했습니다',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  res.status(err.status || 500).json(errorResponse);
});

// ==========================================
// 서버 시작
// ==========================================

async function startServer() {
  try {
    // 데이터베이스 연결 확인
    await db.ping();
    logger.info('PostgreSQL 연결 성공');

    // Redis 연결 확인
    await redis.ping();
    logger.info('Redis 연결 성공');

    // 서버 시작
    app.listen(PORT, () => {
      logger.info(`🚀 지갑 서비스 시작: http://localhost:${PORT}`);
      logger.info(`환경: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('서버 시작 실패:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM 신호 받음. 서버 종료 중...');

  await db.end();
  await redis.quit();

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT 신호 받음. 서버 종료 중...');

  await db.end();
  await redis.quit();

  process.exit(0);
});

// 처리되지 않은 Promise 거부
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();

module.exports = app;
