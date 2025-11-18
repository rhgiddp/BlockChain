/**
 * 관리자 사용자 관리 라우터
 */

const express = require('express');
const db = require('../../../wallet-service/backend/src/database/db');
const logger = require('../../../wallet-service/backend/src/utils/logger');
const { requireAdmin, requireRole, logActivity } = require('../middleware/adminAuth');

const router = express.Router();

// 모든 라우트에 관리자 인증 필요
router.use(requireAdmin);

/**
 * 사용자 목록 조회
 * GET /api/admin/users
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = 'all',
      kyc_status = 'all',
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    const params = [];
    let paramIndex = 1;

    // 검색 조건
    if (search) {
      params.push(`%${search}%`);
      whereConditions.push(`(u.email ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
      paramIndex++;
    }

    // 상태 필터
    if (status !== 'all') {
      params.push(status === 'active');
      whereConditions.push(`u.is_active = $${paramIndex}`);
      paramIndex++;
    }

    // KYC 상태 필터
    if (kyc_status !== 'all') {
      params.push(kyc_status);
      whereConditions.push(`k.status = $${paramIndex}`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // 총 개수 조회
    const countResult = await db.query(
      `SELECT COUNT(DISTINCT u.id) as total
       FROM users u
       LEFT JOIN user_kyc k ON u.id = k.user_id
       ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // 사용자 목록 조회
    params.push(limit, offset);
    const result = await db.query(
      `SELECT
        u.id,
        u.email,
        u.username,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login,
        k.status as kyc_status,
        k.level as kyc_level,
        COUNT(DISTINCT w.id) as wallet_count,
        COUNT(DISTINCT t.id) as transaction_count,
        COALESCE(SUM(t.amount), 0) as total_volume
       FROM users u
       LEFT JOIN user_kyc k ON u.id = k.user_id
       LEFT JOIN wallets w ON u.id = w.user_id
       LEFT JOIN transactions t ON w.address = t.from_address
       ${whereClause}
       GROUP BY u.id, k.status, k.level
       ORDER BY ${sort} ${order}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      error: '사용자 목록 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 상세 정보
 * GET /api/admin/users/:userId
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 사용자 기본 정보
    const userResult = await db.query(
      `SELECT u.*, k.status as kyc_status, k.level as kyc_level, k.full_name
       FROM users u
       LEFT JOIN user_kyc k ON u.id = k.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: '사용자를 찾을 수 없습니다'
      });
    }

    const user = userResult.rows[0];

    // 지갑 정보
    const walletsResult = await db.query(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [userId]
    );

    // 거래 통계
    const txStatsResult = await db.query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(amount) as total_volume,
        MAX(created_at) as last_transaction
       FROM transactions t
       JOIN wallets w ON t.from_address = w.address
       WHERE w.user_id = $1`,
      [userId]
    );

    // 제재 내역
    const sanctionsResult = await db.query(
      `SELECT * FROM user_sanctions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    // 활동 로그
    await logActivity(req.admin.id, 'view_user_details', 'users', userId, null, req);

    res.json({
      user,
      wallets: walletsResult.rows,
      transactionStats: txStatsResult.rows[0],
      sanctions: sanctionsResult.rows
    });
  } catch (error) {
    logger.error('Get user details error:', error);
    res.status(500).json({
      error: '사용자 정보 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 활성화/비활성화
 * PATCH /api/admin/users/:userId/status
 */
router.patch('/:userId/status', requireRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    const result = await db.query(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_active, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '사용자를 찾을 수 없습니다'
      });
    }

    await logActivity(
      req.admin.id,
      is_active ? 'activate_user' : 'deactivate_user',
      'users',
      userId,
      { is_active },
      req
    );

    res.json({
      message: `사용자가 ${is_active ? '활성화' : '비활성화'}되었습니다`,
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Update user status error:', error);
    res.status(500).json({
      error: '사용자 상태 변경 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 제재
 * POST /api/admin/users/:userId/sanction
 */
router.post('/:userId/sanction', requireRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, reason, duration_hours, is_permanent = false, notes } = req.body;

    if (!type || !reason) {
      return res.status(400).json({
        error: '제재 타입과 사유는 필수입니다'
      });
    }

    const endTime = is_permanent ? null : (
      duration_hours ? `NOW() + INTERVAL '${duration_hours} hours'` : null
    );

    const result = await db.query(
      `INSERT INTO user_sanctions (
        user_id, type, reason, duration_hours, end_time, is_permanent, created_by, notes
      ) VALUES ($1, $2, $3, $4, ${endTime || 'NULL'}, $5, $6, $7)
      RETURNING *`,
      [userId, type, reason, duration_hours, is_permanent, req.admin.id, notes]
    );

    // 자산 동결인 경우 지갑도 비활성화
    if (type === 'freeze_assets') {
      await db.query(
        `UPDATE wallets SET is_active = false WHERE user_id = $1`,
        [userId]
      );
    }

    await logActivity(
      req.admin.id,
      'create_sanction',
      'user_sanctions',
      result.rows[0].id,
      { type, reason, userId },
      req
    );

    res.status(201).json({
      message: '사용자 제재가 등록되었습니다',
      sanction: result.rows[0]
    });
  } catch (error) {
    logger.error('Create sanction error:', error);
    res.status(500).json({
      error: '제재 등록 중 오류가 발생했습니다'
    });
  }
});

/**
 * 제재 해제
 * POST /api/admin/users/:userId/sanctions/:sanctionId/lift
 */
router.post('/:userId/sanctions/:sanctionId/lift', requireRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { userId, sanctionId } = req.params;

    const result = await db.query(
      `UPDATE user_sanctions
       SET is_active = false, lifted_by = $1, lifted_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [req.admin.id, sanctionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: '제재 내역을 찾을 수 없습니다'
      });
    }

    await logActivity(
      req.admin.id,
      'lift_sanction',
      'user_sanctions',
      sanctionId,
      { userId },
      req
    );

    res.json({
      message: '제재가 해제되었습니다',
      sanction: result.rows[0]
    });
  } catch (error) {
    logger.error('Lift sanction error:', error);
    res.status(500).json({
      error: '제재 해제 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 삭제 (GDPR 준수)
 * DELETE /api/admin/users/:userId
 */
router.delete('/:userId', requireRole('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
      return res.status(400).json({
        error: '삭제를 확인하려면 confirm 필드에 "DELETE"를 입력하세요'
      });
    }

    // 트랜잭션 시작
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 사용자 정보 익명화 (완전 삭제 대신)
      await client.query(
        `UPDATE users
         SET email = 'deleted_' || id || '@deleted.com',
             username = 'deleted_' || id,
             password_hash = '',
             is_active = false,
             updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      // 지갑 비활성화
      await client.query(
        `UPDATE wallets SET is_active = false WHERE user_id = $1`,
        [userId]
      );

      // KYC 정보 삭제
      await client.query(
        `DELETE FROM user_kyc WHERE user_id = $1`,
        [userId]
      );

      await client.query('COMMIT');

      await logActivity(
        req.admin.id,
        'delete_user',
        'users',
        userId,
        { anonymized: true },
        req
      );

      res.json({
        message: '사용자 데이터가 익명화되었습니다'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      error: '사용자 삭제 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;
