/**
 * 데이터베이스 연결 및 스키마 테스트
 */

require('dotenv').config();
const db = require('./src/database/db');
const logger = require('./src/utils/logger');

async function testDatabase() {
  console.log('='.repeat(60));
  console.log('📊 관리자 페이지 데이터베이스 테스트');
  console.log('='.repeat(60));

  try {
    // 1. 연결 테스트
    console.log('\n✅ 1. PostgreSQL 연결 테스트...');
    await db.ping();
    console.log('   ✓ 데이터베이스 연결 성공');

    // 2. 테이블 존재 확인
    console.log('\n✅ 2. 관리자 테이블 존재 확인...');
    const tables = [
      'admin_users',
      'admin_activity_logs',
      'system_settings',
      'user_kyc',
      'user_sanctions',
      'transaction_flags',
      'blockchain_nodes',
      'system_alerts',
      'api_usage_stats'
    ];

    for (const table of tables) {
      const result = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )`,
        [table]
      );
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✓' : '✗'} ${table}: ${exists ? '존재함' : '없음'}`);
    }

    // 3. 뷰 존재 확인
    console.log('\n✅ 3. 대시보드 뷰 확인...');
    const viewResult = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name = 'admin_dashboard_stats'
      )`
    );
    const viewExists = viewResult.rows[0].exists;
    console.log(`   ${viewExists ? '✓' : '✗'} admin_dashboard_stats: ${viewExists ? '존재함' : '없음'}`);

    // 4. users 테이블 확인 (admin_users가 참조)
    console.log('\n✅ 4. users 테이블 확인...');
    const usersResult = await db.query('SELECT COUNT(*) FROM users');
    console.log(`   ✓ users 테이블: ${usersResult.rows[0].count}명의 사용자`);

    // 5. 관리자 사용자 확인
    console.log('\n✅ 5. 관리자 사용자 확인...');
    const adminResult = await db.query('SELECT COUNT(*) FROM admin_users WHERE is_active = true');
    console.log(`   ✓ 활성 관리자: ${adminResult.rows[0].count}명`);

    // 6. 대시보드 통계 조회 테스트
    console.log('\n✅ 6. 대시보드 통계 조회 테스트...');
    if (viewExists) {
      const statsResult = await db.query('SELECT * FROM admin_dashboard_stats');
      const stats = statsResult.rows[0] || {};
      console.log('   ✓ 대시보드 통계:');
      console.log(`      - 활성 사용자: ${stats.active_users || 0}`);
      console.log(`      - 총 지갑: ${stats.total_wallets || 0}`);
      console.log(`      - 24h 거래: ${stats.transactions_24h || 0}`);
      console.log(`      - 대기중 KYC: ${stats.pending_kyc || 0}`);
      console.log(`      - 활성 노드: ${stats.active_nodes || 0}`);
      console.log(`      - 미해결 알림: ${stats.unresolved_alerts || 0}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 모든 데이터베이스 테스트 완료!');
    console.log('='.repeat(60));

    return true;
  } catch (error) {
    console.error('\n❌ 데이터베이스 테스트 실패:', error.message);
    console.error('상세 에러:', error);
    return false;
  } finally {
    await db.end();
  }
}

// 실행
testDatabase().then(success => {
  process.exit(success ? 0 : 1);
});
