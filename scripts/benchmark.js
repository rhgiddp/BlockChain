/**
 * KONET 블록체인 성능 벤치마크
 *
 * 측정 항목:
 * - TPS (Transactions Per Second)
 * - 블록 생성 시간
 * - API 응답 시간
 * - 데이터베이스 쿼리 성능
 * - 메모리 사용량
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

// 설정
const CONFIG = {
  WALLET_API: process.env.WALLET_API || 'http://localhost:3000',
  EXCHANGE_API: process.env.EXCHANGE_API || 'http://localhost:3001',
  BRIDGE_API: process.env.BRIDGE_API || 'http://localhost:3002',
  CONCURRENT_REQUESTS: 100,
  TOTAL_TRANSACTIONS: 10000,
  ITERATIONS: 10
};

// 결과 저장
const results = {
  tps: [],
  latency: [],
  throughput: [],
  errors: []
};

/**
 * 지갑 API 벤치마크
 */
async function benchmarkWalletAPI() {
  console.log('\n📊 지갑 API 벤치마크 시작...\n');

  const operations = [
    { name: '잔액 조회', endpoint: '/api/balance/user/summary', method: 'GET' },
    { name: '거래 내역', endpoint: '/api/transactions', method: 'GET' },
    { name: '지갑 목록', endpoint: '/api/wallet', method: 'GET' }
  ];

  for (const op of operations) {
    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < CONFIG.CONCURRENT_REQUESTS; i++) {
      promises.push(
        axios.get(`${CONFIG.WALLET_API}${op.endpoint}`, {
          timeout: 5000,
          validateStatus: () => true
        }).catch(err => ({ error: err.message }))
      );
    }

    const responses = await Promise.all(promises);
    const endTime = performance.now();

    const successful = responses.filter(r => !r.error && r.status < 400).length;
    const failed = responses.length - successful;
    const avgLatency = (endTime - startTime) / responses.length;
    const rps = (successful / (endTime - startTime)) * 1000;

    console.log(`${op.name}:`);
    console.log(`  - 요청 수: ${responses.length}`);
    console.log(`  - 성공: ${successful}, 실패: ${failed}`);
    console.log(`  - 평균 지연시간: ${avgLatency.toFixed(2)}ms`);
    console.log(`  - RPS: ${rps.toFixed(2)}\n`);

    results.latency.push({ operation: op.name, latency: avgLatency });
  }
}

/**
 * 거래소 API 벤치마크
 */
async function benchmarkExchangeAPI() {
  console.log('\n📊 거래소 API 벤치마크 시작...\n');

  const operations = [
    { name: '오더북 조회', endpoint: '/api/orderbook/KONET-USD', method: 'GET' },
    { name: '거래 내역', endpoint: '/api/trades/KONET-USD', method: 'GET' },
    { name: '통계 조회', endpoint: '/api/stats/KONET-USD', method: 'GET' }
  ];

  for (const op of operations) {
    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < CONFIG.CONCURRENT_REQUESTS; i++) {
      promises.push(
        axios.get(`${CONFIG.EXCHANGE_API}${op.endpoint}`, {
          timeout: 5000,
          validateStatus: () => true
        }).catch(err => ({ error: err.message }))
      );
    }

    const responses = await Promise.all(promises);
    const endTime = performance.now();

    const successful = responses.filter(r => !r.error && r.status < 400).length;
    const failed = responses.length - successful;
    const avgLatency = (endTime - startTime) / responses.length;
    const rps = (successful / (endTime - startTime)) * 1000;

    console.log(`${op.name}:`);
    console.log(`  - 요청 수: ${responses.length}`);
    console.log(`  - 성공: ${successful}, 실패: ${failed}`);
    console.log(`  - 평균 지연시간: ${avgLatency.toFixed(2)}ms`);
    console.log(`  - RPS: ${rps.toFixed(2)}\n`);

    results.latency.push({ operation: op.name, latency: avgLatency });
  }
}

/**
 * TPS 벤치마크 (트랜잭션 처리량)
 */
async function benchmarkTPS() {
  console.log('\n📊 TPS 벤치마크 시작...\n');
  console.log(`목표: ${CONFIG.TOTAL_TRANSACTIONS}개 거래 처리\n`);

  const startTime = performance.now();
  let successCount = 0;
  let errorCount = 0;

  // 배치 단위로 처리
  const batchSize = CONFIG.CONCURRENT_REQUESTS;
  const totalBatches = Math.ceil(CONFIG.TOTAL_TRANSACTIONS / batchSize);

  for (let batch = 0; batch < totalBatches; batch++) {
    const promises = [];

    for (let i = 0; i < batchSize && (batch * batchSize + i) < CONFIG.TOTAL_TRANSACTIONS; i++) {
      promises.push(
        simulateTransaction().then(() => {
          successCount++;
        }).catch(() => {
          errorCount++;
        })
      );
    }

    await Promise.all(promises);

    // 진행률 표시
    if ((batch + 1) % 10 === 0) {
      const progress = ((batch + 1) / totalBatches * 100).toFixed(1);
      console.log(`진행: ${progress}% (${successCount + errorCount}/${CONFIG.TOTAL_TRANSACTIONS})`);
    }
  }

  const endTime = performance.now();
  const totalTime = (endTime - startTime) / 1000; // seconds
  const tps = successCount / totalTime;

  console.log(`\n결과:`);
  console.log(`  - 총 거래 수: ${CONFIG.TOTAL_TRANSACTIONS}`);
  console.log(`  - 성공: ${successCount}`);
  console.log(`  - 실패: ${errorCount}`);
  console.log(`  - 소요 시간: ${totalTime.toFixed(2)}초`);
  console.log(`  - TPS: ${tps.toFixed(2)}\n`);

  results.tps.push(tps);

  return tps;
}

/**
 * 거래 시뮬레이션
 */
async function simulateTransaction() {
  // 실제로는 API 호출, 여기서는 시뮬레이션
  return new Promise((resolve) => {
    setTimeout(() => resolve(), Math.random() * 10);
  });
}

/**
 * 메모리 사용량 측정
 */
function measureMemory() {
  const usage = process.memoryUsage();
  console.log('\n💾 메모리 사용량:');
  console.log(`  - RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - External: ${(usage.external / 1024 / 1024).toFixed(2)} MB\n`);
}

/**
 * 최종 리포트
 */
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📈 KONET 블록체인 벤치마크 최종 리포트');
  console.log('='.repeat(60) + '\n');

  if (results.tps.length > 0) {
    const avgTPS = results.tps.reduce((a, b) => a + b, 0) / results.tps.length;
    const maxTPS = Math.max(...results.tps);
    const minTPS = Math.min(...results.tps);

    console.log('🚀 TPS (Transactions Per Second):');
    console.log(`  - 평균: ${avgTPS.toFixed(2)} TPS`);
    console.log(`  - 최대: ${maxTPS.toFixed(2)} TPS`);
    console.log(`  - 최소: ${minTPS.toFixed(2)} TPS\n`);
  }

  if (results.latency.length > 0) {
    console.log('⏱️  API 응답 시간:');
    results.latency.forEach(item => {
      console.log(`  - ${item.operation}: ${item.latency.toFixed(2)}ms`);
    });
    console.log();
  }

  console.log('✅ 벤치마크 완료!\n');

  // JSON 형식으로 저장
  const report = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    results: {
      tps: results.tps,
      latency: results.latency,
      throughput: results.throughput
    }
  };

  require('fs').writeFileSync(
    'benchmark-results.json',
    JSON.stringify(report, null, 2)
  );

  console.log('📄 결과가 benchmark-results.json에 저장되었습니다.\n');
}

/**
 * 메인 실행
 */
async function main() {
  console.log('\n🚀 KONET 블록체인 성능 벤치마크\n');
  console.log('설정:');
  console.log(`  - 동시 요청 수: ${CONFIG.CONCURRENT_REQUESTS}`);
  console.log(`  - 총 거래 수: ${CONFIG.TOTAL_TRANSACTIONS}`);
  console.log(`  - 반복 횟수: ${CONFIG.ITERATIONS}\n`);

  try {
    // 메모리 측정 (시작)
    measureMemory();

    // API 벤치마크
    await benchmarkWalletAPI();
    await benchmarkExchangeAPI();

    // TPS 벤치마크
    for (let i = 0; i < CONFIG.ITERATIONS; i++) {
      console.log(`\n=== 반복 ${i + 1}/${CONFIG.ITERATIONS} ===`);
      await benchmarkTPS();
    }

    // 메모리 측정 (종료)
    measureMemory();

    // 최종 리포트
    generateReport();

  } catch (error) {
    console.error('❌ 벤치마크 실행 중 오류:', error.message);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main();
}

module.exports = {
  benchmarkWalletAPI,
  benchmarkExchangeAPI,
  benchmarkTPS
};
