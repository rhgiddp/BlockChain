/**
 * KYC 관리 라우터
 */

const express = require('express');
const db = require('../../../wallet-service/backend/src/database/db');
const logger = require('../../../wallet-service/backend/src/utils/logger');
const { requireAdmin, requireRole, logActivity } = require('../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

/**
 * KYC 신청 목록
 * GET /api/admin/kyc
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT k.*, u.email, u.username
       FROM user_kyc k
       JOIN users u ON k.user_id = u.id
       WHERE k.status = $1
       ORDER BY k.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM user_kyc WHERE status = $1',
      [status]
    );

    res.json({
      kyc_applications: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    logger.error('Get KYC list error:', error);
    res.status(500).json({ error: 'KYC 목록 조회 실패' });
  }
});

/**
 * KYC 승인
 * POST /api/admin/kyc/:userId/approve
 */
router.post('/:userId/approve', requireRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { level = 1 } = req.body;

    const result = await db.query(
      `UPDATE user_kyc
       SET status = 'approved', level = $1, verified_by = $2, verified_at = NOW()
       WHERE user_id = $3
       RETURNING *`,
      [level, req.admin.id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'KYC 신청을 찾을 수 없습니다' });
    }

    await logActivity(req.admin.id, 'approve_kyc', 'user_kyc', userId, { level }, req);

    res.json({ message: 'KYC가 승인되었습니다', kyc: result.rows[0] });
  } catch (error) {
    logger.error('Approve KYC error:', error);
    res.status(500).json({ error: 'KYC 승인 실패' });
  }
});

/**
 * KYC 거부
 * POST /api/admin/kyc/:userId/reject
 */
router.post('/:userId/reject', requireRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: '거부 사유가 필요합니다' });
    }

    const result = await db.query(
      `UPDATE user_kyc
       SET status = 'rejected', rejection_reason = $1, verified_by = $2, verified_at = NOW()
       WHERE user_id = $3
       RETURNING *`,
      [reason, req.admin.id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'KYC 신청을 찾을 수 없습니다' });
    }

    await logActivity(req.admin.id, 'reject_kyc', 'user_kyc', userId, { reason }, req);

    res.json({ message: 'KYC가 거부되었습니다', kyc: result.rows[0] });
  } catch (error) {
    logger.error('Reject KYC error:', error);
    res.status(500).json({ error: 'KYC 거부 실패' });
  }
});

module.exports = router;
