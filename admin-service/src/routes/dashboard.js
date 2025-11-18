/**
 * 관리자 대시보드 라우터
 */

const express = require('express');
const db = require('../database/db');
const redis = require('../database/redis');
const logger = require('../utils/logger');
const { requireAdmin, logActivity } = require('../middleware/adminAuth');

const router = express.Router();

// 모든 라우트에 관리자 인증 필요
router.use(requireAdmin);

/**
 * 대시보드 전체 통계
 * GET /api/admin/dashboard/stats
 */
router.get('/stats', async (req, res) => {
  try {
    // 캐시 확인
    const cacheKey = 'admin:dashboard:stats';
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // 전체 통계 조회
    const statsResult = await db.query('SELECT * FROM admin_dashboard_stats');
    const stats = statsResult.rows[0] || {};

    // 추가 통계
    const [
      totalVolumeResult,
      topUsersResult,
      recentTransactionsResult,
      systemHealthResult
    ] = await Promise.all([
      // 총 거래량
      db.query(`
        SELECT
          COALESCE(SUM(amount), 0) as total_volume,
          COUNT(*) as total_transactions
        FROM transactions
      `),

      // 상위 사용자
      db.query(`
        SELECT u.email, COUNT(t.id) as tx_count, SUM(t.amount) as volume
        FROM users u
        LEFT JOIN wallets w ON u.id = w.user_id
        LEFT JOIN transactions t ON w.address = t.from_address
        GROUP BY u.id, u.email
        ORDER BY volume DESC NULLS LAST
        LIMIT 10
      `),

      // 최근 거래
      db.query(`
        SELECT tx_hash, from_address, to_address, amount, status, created_at
        FROM transactions
        ORDER BY created_at DESC
        LIMIT 10
      `),

      // 시스템 상태
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_active = true) as active_nodes,
          COUNT(*) FILTER (WHERE is_synced = true) as synced_nodes,
          AVG(uptime_percentage) as avg_uptime
        FROM blockchain_nodes
      `)
    ]);

    const dashboardStats = {
      overview: {
        ...stats,
        total_volume: parseFloat(totalVolumeResult.rows[0].total_volume || 0),
        total_transactions: parseInt(totalVolumeResult.rows[0].total_transactions || 0)
      },
      topUsers: topUsersResult.rows,
      recentTransactions: recentTransactionsResult.rows,
      systemHealth: systemHealthResult.rows[0] || {}
    };

    // 캐시 저장 (30초)
    await redis.set(cacheKey, dashboardStats, 30);

    // 활동 로그
    await logActivity(req.admin.id, 'view_dashboard', 'dashboard', null, null, req);

    res.json(dashboardStats);
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({
      error: '통계 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 실시간 활동 로그
 * GET /api/admin/dashboard/activity
 */
router.get('/activity', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT
        al.*,
        u.email as admin_email,
        u.username as admin_username
       FROM admin_activity_logs al
       JOIN admin_users au ON al.admin_user_id = au.id
       JOIN users u ON au.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      activities: result.rows,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Activity log error:', error);
    res.status(500).json({
      error: '활동 로그 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 시스템 알림
 * GET /api/admin/dashboard/alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const { status = 'unresolved' } = req.query;

    let query = 'SELECT * FROM system_alerts';
    const params = [];

    if (status === 'unresolved') {
      query += ' WHERE is_resolved = false';
    }

    query += ' ORDER BY severity DESC, created_at DESC LIMIT 100';

    const result = await db.query(query, params);

    res.json({
      alerts: result.rows,
      unresolved_count: result.rows.filter(a => !a.is_resolved).length
    });
  } catch (error) {
    logger.error('Alerts error:', error);
    res.status(500).json({
      error: '알림 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 알림 해결
 * POST /api/admin/dashboard/alerts/:alertId/resolve
 */
router.post('/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;

    const result = await db.query(
      `UPDATE system_alerts
       SET is_resolved = true, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.admin.id, alertId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '알림을 찾을 수 없습니다'
      });
    }

    await logActivity(req.admin.id, 'resolve_alert', 'system_alerts', alertId, null, req);

    res.json({
      message: '알림이 해결되었습니다',
      alert: result.rows[0]
    });
  } catch (error) {
    logger.error('Resolve alert error:', error);
    res.status(500).json({
      error: '알림 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * 차트 데이터 - 시간별 거래량
 * GET /api/admin/dashboard/charts/transactions
 */
router.get('/charts/transactions', async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    let interval, timeRange;

    switch (period) {
      case '1h':
        interval = '5 minutes';
        timeRange = '1 hour';
        break;
      case '24h':
        interval = '1 hour';
        timeRange = '24 hours';
        break;
      case '7d':
        interval = '1 day';
        timeRange = '7 days';
        break;
      case '30d':
        interval = '1 day';
        timeRange = '30 days';
        break;
      default:
        interval = '1 hour';
        timeRange = '24 hours';
    }

    const result = await db.query(
      `SELECT
        date_trunc($1, created_at) as time,
        COUNT(*) as transaction_count,
        SUM(amount) as volume
       FROM transactions
       WHERE created_at > NOW() - INTERVAL '${timeRange}'
       GROUP BY time
       ORDER BY time ASC`,
      [interval.split(' ')[1]]
    );

    res.json({
      period,
      data: result.rows
    });
  } catch (error) {
    logger.error('Chart data error:', error);
    res.status(500).json({
      error: '차트 데이터 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 차트 데이터 - 사용자 증가
 * GET /api/admin/dashboard/charts/users
 */
router.get('/charts/users', async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    const result = await db.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as new_users,
        SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_users
       FROM users
       WHERE created_at > NOW() - INTERVAL '${period}'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    res.json({
      period,
      data: result.rows
    });
  } catch (error) {
    logger.error('User chart error:', error);
    res.status(500).json({
      error: '사용자 차트 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
