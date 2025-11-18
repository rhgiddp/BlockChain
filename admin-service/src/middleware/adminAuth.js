/**
 * 관리자 인증 미들웨어
 */

const jwt = require('jsonwebtoken');
const db = require('../../wallet-service/backend/src/database/db');
const logger = require('../../wallet-service/backend/src/utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'konet-secret-key-change-in-production';

/**
 * 관리자 인증 확인
 */
async function requireAdmin(req, res, next) {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: '인증 토큰이 필요합니다'
      });
    }

    const token = authHeader.substring(7);

    // 토큰 검증
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded) {
      return res.status(401).json({
        error: '유효하지 않은 토큰입니다'
      });
    }

    // 관리자 권한 확인
    const result = await db.query(
      `SELECT au.*, u.email, u.username
       FROM admin_users au
       JOIN users u ON au.user_id = u.id
       WHERE au.user_id = $1 AND au.is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: '관리자 권한이 없습니다'
      });
    }

    const adminUser = result.rows[0];

    // 마지막 로그인 시간 업데이트
    await db.query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
      [adminUser.id]
    );

    // 요청 객체에 관리자 정보 저장
    req.admin = {
      id: adminUser.id,
      userId: adminUser.user_id,
      email: adminUser.email,
      username: adminUser.username,
      role: adminUser.role,
      permissions: adminUser.permissions || {}
    };

    next();
  } catch (error) {
    logger.error('Admin authentication error:', error);
    res.status(500).json({
      error: '인증 처리 중 오류가 발생했습니다'
    });
  }
}

/**
 * 역할 기반 권한 확인
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: '인증이 필요합니다'
      });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        error: `이 작업은 ${allowedRoles.join(', ')} 역할이 필요합니다`
      });
    }

    next();
  };
}

/**
 * 권한 확인 (세밀한 권한 제어)
 */
function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: '인증이 필요합니다'
      });
    }

    // Super admin은 모든 권한 보유
    if (req.admin.role === 'super_admin') {
      return next();
    }

    // 권한 확인
    const permissions = req.admin.permissions || {};
    const resourcePermissions = permissions[resource] || {};

    if (!resourcePermissions[action]) {
      return res.status(403).json({
        error: `${resource} 리소스에 대한 ${action} 권한이 없습니다`
      });
    }

    next();
  };
}

/**
 * 활동 로그 기록
 */
async function logActivity(adminUserId, action, resourceType, resourceId = null, details = null, req) {
  try {
    await db.query(
      `INSERT INTO admin_activity_logs (
        admin_user_id, action, resource_type, resource_id, details, ip_address, user_agent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        adminUserId,
        action,
        resourceType,
        resourceId,
        details ? JSON.stringify(details) : null,
        req.ip,
        req.get('user-agent'),
        'success'
      ]
    );
  } catch (error) {
    logger.error('Failed to log admin activity:', error);
  }
}

module.exports = {
  requireAdmin,
  requireRole,
  requirePermission,
  logActivity
};
