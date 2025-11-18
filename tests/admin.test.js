/**
 * 관리자 시스템 테스트
 */

const { expect } = require('chai');
const axios = require('axios');

const ADMIN_API = process.env.ADMIN_API || 'http://localhost:3004/api/admin';

// 테스트 관리자 계정
let adminToken = null;

describe('관리자 시스템 테스트', function() {
  this.timeout(30000);

  describe('1. 인증', function() {
    it('관리자 로그인이 성공해야 함', async function() {
      // 일반 로그인 후 관리자 토큰 확인
      // 실제 구현에서는 별도의 관리자 로그인 로직 필요
      this.skip(); // 스킵 (관리자 계정 생성 필요)
    });
  });

  describe('2. 대시보드', function() {
    it('헬스 체크가 성공해야 함', async function() {
      const response = await axios.get('http://localhost:3004/health');
      expect(response.data).to.have.property('status', 'healthy');
    });

    it('대시보드 통계 조회 (인증 없이는 실패)', async function() {
      try {
        await axios.get(`${ADMIN_API}/dashboard/stats`);
        expect.fail('Should have failed');
      } catch (error) {
        expect(error.response.status).to.equal(401);
      }
    });
  });

  describe('3. 사용자 관리', function() {
    it('사용자 목록 조회 (인증 없이는 실패)', async function() {
      try {
        await axios.get(`${ADMIN_API}/users`);
        expect.fail('Should have failed');
      } catch (error) {
        expect(error.response.status).to.equal(401);
      }
    });
  });

  describe('4. KYC 관리', function() {
    it('KYC 목록 조회 (인증 없이는 실패)', async function() {
      try {
        await axios.get(`${ADMIN_API}/kyc`);
        expect.fail('Should have failed');
      } catch (error) {
        expect(error.response.status).to.equal(401);
      }
    });
  });
});
