/**
 * KONET 블록체인 통합 테스트
 *
 * 전체 시스템 통합 테스트
 * - 블록체인 코어
 * - 지갑 서비스
 * - 거래소
 * - Bridge
 * - 스마트 컨트랙트
 */

const { expect } = require('chai');
const axios = require('axios');
const { ethers } = require('ethers');

// API 엔드포인트
const WALLET_API = process.env.WALLET_API || 'http://localhost:3000';
const EXCHANGE_API = process.env.EXCHANGE_API || 'http://localhost:3001';
const BRIDGE_API = process.env.BRIDGE_API || 'http://localhost:3002';
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

// 테스트 계정
let testUser = {
  email: `test${Date.now()}@konet.com`,
  password: 'Test123!@#',
  username: 'TestUser'
};

let authToken = null;
let testWallet = null;

describe('KONET 블록체인 통합 테스트', function() {
  this.timeout(30000); // 30초 타임아웃

  /**
   * 1. 인증 시스템
   */
  describe('1. 인증 시스템', function() {
    it('회원가입이 성공해야 함', async function() {
      const response = await axios.post(`${WALLET_API}/api/auth/register`, testUser);
      expect(response.data).to.have.property('message');
      expect(response.data.user).to.have.property('email', testUser.email);
    });

    it('로그인이 성공해야 함', async function() {
      const response = await axios.post(`${WALLET_API}/api/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });

      expect(response.data).to.have.property('accessToken');
      expect(response.data.user).to.have.property('email', testUser.email);

      authToken = response.data.accessToken;
    });

    it('인증된 사용자 정보 조회가 성공해야 함', async function() {
      const response = await axios.get(`${WALLET_API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.data.user).to.have.property('email', testUser.email);
    });
  });

  /**
   * 2. 지갑 시스템
   */
  describe('2. 지갑 시스템', function() {
    it('지갑 생성이 성공해야 함', async function() {
      const response = await axios.post(
        `${WALLET_API}/api/wallet/create`,
        {
          wallet_type: 'hot',
          label: 'Test Wallet'
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      expect(response.data.wallet).to.have.property('address');
      expect(response.data.wallet.wallet_type).to.equal('hot');

      testWallet = response.data.wallet;
    });

    it('지갑 목록 조회가 성공해야 함', async function() {
      const response = await axios.get(`${WALLET_API}/api/wallet`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(response.data.wallets).to.be.an('array');
      expect(response.data.wallets.length).to.be.greaterThan(0);
    });

    it('지갑 상세 조회가 성공해야 함', async function() {
      const response = await axios.get(
        `${WALLET_API}/api/wallet/${testWallet.address}`,
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      expect(response.data.wallet).to.have.property('address', testWallet.address);
    });

    it('잔액 조회가 성공해야 함', async function() {
      const response = await axios.get(
        `${WALLET_API}/api/balance/${testWallet.address}`,
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      expect(response.data).to.have.property('balances');
      expect(response.data.balances).to.be.an('array');
    });
  });

  /**
   * 3. 거래소 시스템
   */
  describe('3. 거래소 시스템', function() {
    let orderId = null;

    it('헬스 체크가 성공해야 함', async function() {
      const response = await axios.get(`${EXCHANGE_API}/health`);
      expect(response.data).to.have.property('status', 'healthy');
    });

    it('오더북 조회가 성공해야 함', async function() {
      const response = await axios.get(`${EXCHANGE_API}/api/orderbook/KONET-USD`);
      expect(response.data).to.have.property('bids');
      expect(response.data).to.have.property('asks');
    });

    it('지정가 주문이 성공해야 함', async function() {
      const response = await axios.post(`${EXCHANGE_API}/api/orders/limit`, {
        symbol: 'KONET-USD',
        userId: testUser.email,
        type: 'buy',
        price: 1.0,
        amount: 100
      });

      expect(response.data.order).to.have.property('id');
      orderId = response.data.order.id;
    });

    it('주문 취소가 성공해야 함', async function() {
      if (orderId) {
        const response = await axios.delete(
          `${EXCHANGE_API}/api/orders/KONET-USD/${orderId}`
        );
        expect(response.data).to.have.property('message');
      }
    });

    it('거래 통계 조회가 성공해야 함', async function() {
      const response = await axios.get(`${EXCHANGE_API}/api/stats/KONET-USD`);
      expect(response.data).to.have.property('symbol', 'KONET-USD');
    });
  });

  /**
   * 4. Bridge 시스템
   */
  describe('4. Bridge 시스템', function() {
    it('헬스 체크가 성공해야 함', async function() {
      const response = await axios.get(`${BRIDGE_API}/health`);
      expect(response.data).to.have.property('status', 'healthy');
    });

    it('지원 체인 목록 조회가 성공해야 함', async function() {
      const response = await axios.get(`${BRIDGE_API}/api/chains`);
      expect(response.data.chains).to.be.an('array');
      expect(response.data.chains.length).to.be.greaterThan(0);
    });

    it('통계 조회가 성공해야 함', async function() {
      const response = await axios.get(`${BRIDGE_API}/api/stats`);
      expect(response.data).to.have.property('processedTransactions');
    });
  });

  /**
   * 5. 스마트 컨트랙트 (RPC 접속 가능 시)
   */
  describe('5. 스마트 컨트랙트 (선택)', function() {
    let provider;

    before(function() {
      try {
        provider = new ethers.JsonRpcProvider(RPC_URL);
      } catch (error) {
        this.skip(); // RPC 연결 불가 시 스킵
      }
    });

    it('블록체인 연결이 성공해야 함', async function() {
      if (!provider) this.skip();

      const network = await provider.getNetwork();
      expect(network).to.have.property('chainId');
    });

    it('최신 블록 조회가 성공해야 함', async function() {
      if (!provider) this.skip();

      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).to.be.a('number');
      expect(blockNumber).to.be.greaterThan(0);
    });
  });

  /**
   * 6. 성능 테스트
   */
  describe('6. 성능 테스트', function() {
    it('동시 요청 100개를 처리할 수 있어야 함', async function() {
      this.timeout(60000); // 60초

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          axios.get(`${EXCHANGE_API}/health`).catch(() => null)
        );
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r !== null).length;

      expect(successCount).to.be.greaterThan(90); // 90% 이상 성공
    });

    it('API 응답 시간이 100ms 이하여야 함', async function() {
      const startTime = Date.now();
      await axios.get(`${EXCHANGE_API}/health`);
      const responseTime = Date.now() - startTime;

      expect(responseTime).to.be.lessThan(100);
    });
  });

  /**
   * 7. 에러 처리
   */
  describe('7. 에러 처리', function() {
    it('잘못된 인증 토큰을 거부해야 함', async function() {
      try {
        await axios.get(`${WALLET_API}/api/wallet`, {
          headers: { Authorization: 'Bearer invalid-token' }
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(401);
      }
    });

    it('존재하지 않는 엔드포인트는 404를 반환해야 함', async function() {
      try {
        await axios.get(`${WALLET_API}/api/nonexistent`);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.equal(404);
      }
    });

    it('잘못된 요청 데이터는 400을 반환해야 함', async function() {
      try {
        await axios.post(`${WALLET_API}/api/auth/login`, {
          // 필수 필드 누락
          email: ''
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).to.be.oneOf([400, 401]);
      }
    });
  });

  /**
   * 정리
   */
  after(async function() {
    console.log('\n✅ 통합 테스트 완료');
    console.log(`   - 생성된 테스트 사용자: ${testUser.email}`);
    if (testWallet) {
      console.log(`   - 생성된 테스트 지갑: ${testWallet.address}`);
    }
  });
});
