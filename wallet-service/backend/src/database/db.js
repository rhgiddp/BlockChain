/**
 * PostgreSQL 데이터베이스 연결
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// PostgreSQL 연결 풀 설정
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'konet_wallet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 연결 에러 핸들러
pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * 쿼리 실행
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Query error', { text, error: error.message });
    throw error;
  }
}

/**
 * 트랜잭션 시작
 */
async function getClient() {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;

  // 트랜잭션 타임아웃 설정
  const timeout = setTimeout(() => {
    logger.error('A client has been checked out for more than 5 seconds!');
  }, 5000);

  // release를 오버라이드해서 타임아웃 클리어
  client.release = () => {
    clearTimeout(timeout);
    client.query = query;
    client.release = release;
    return release.apply(client);
  };

  return client;
}

/**
 * 트랜잭션 실행
 */
async function transaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 연결 테스트
 */
async function ping() {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (error) {
    logger.error('Database ping failed', error);
    throw error;
  }
}

/**
 * 연결 종료
 */
async function end() {
  await pool.end();
  logger.info('Database pool has ended');
}

module.exports = {
  query,
  getClient,
  transaction,
  ping,
  end,
  pool
};
