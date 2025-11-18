/**
 * KONET 블록체인 관리자 서비스
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.ADMIN_PORT || 3004;

// 미들웨어
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100,
  message: '너무 많은 요청이 발생했습니다'
});
app.use('/api/admin/', limiter);

// 라우터 import
const dashboardRouter = require('./routes/dashboard');
const usersRouter = require('./routes/users');
const kycRouter = require('./routes/kyc');

// 라우터 등록
app.use('/api/admin/dashboard', dashboardRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/admin/kyc', kycRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'admin-service',
    timestamp: new Date().toISOString()
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🔐 관리자 서비스 시작: http://localhost:${PORT}`);
  console.log(`환경: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app };
