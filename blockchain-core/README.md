# 🦀 Blockchain Core - Rust 블록체인 엔진

> KONET 블록체인의 핵심 엔진입니다. Rust로 작성되어 빠르고 안전합니다.

---

## 📖 목차

1. [개요](#개요)
2. [빠른 시작](#빠른-시작)
3. [프로젝트 구조](#프로젝트-구조)
4. [API 사용법](#api-사용법)
5. [CLI 명령어](#cli-명령어)
6. [테스트](#테스트)
7. [성능 최적화](#성능-최적화)

---

## 🎯 개요

### 무엇을 하는 프로그램인가요?

이 프로그램은 **블록체인의 핵심 기능**을 제공합니다:

1. **블록 생성 및 채굴**: 새로운 블록을 만들고 작업 증명(PoW)을 수행
2. **트랜잭션 관리**: 거래를 생성하고 검증
3. **체인 검증**: 블록체인이 변조되지 않았는지 확인
4. **잔액 관리**: 각 주소의 잔액을 추적
5. **HTTP API**: REST API를 통해 블록체인과 상호작용

### 왜 Rust를 사용하나요?

- **속도**: C/C++만큼 빠름
- **안전성**: 메모리 안전성 보장 (버퍼 오버플로우 등 방지)
- **동시성**: 멀티스레딩이 안전하고 쉬움
- **모던**: 현대적인 언어 기능

---

## 🚀 빠른 시작

### 1. 빌드

```bash
cd blockchain-core

# 개발 빌드
cargo build

# 릴리스 빌드 (최적화, 더 빠름)
cargo build --release
```

### 2. 실행

#### 서버 모드 (HTTP API)
```bash
# 기본 포트 (8080)
cargo run --release

# 커스텀 포트
cargo run --release -- start --port 3000 --host 0.0.0.0
```

서버가 시작되면 브라우저에서 `http://localhost:8080` 접속

#### CLI 모드

```bash
# 블록체인 정보
cargo run --release -- info

# 블록 채굴
cargo run --release -- mine --address my_address

# 트랜잭션 생성
cargo run --release -- create-tx \
  --from alice \
  --to bob \
  --amount 100 \
  --fee 1
```

### 3. 테스트

```bash
# 모든 테스트 실행
cargo test

# 상세 출력
cargo test -- --nocapture

# 특정 테스트만
cargo test test_create_blockchain
```

---

## 📁 프로젝트 구조

```
blockchain-core/
│
├── src/
│   ├── main.rs          # 🚀 메인 진입점 (HTTP 서버 + CLI)
│   ├── lib.rs           # 📚 라이브러리 인터페이스
│   │
│   ├── block.rs         # 🧱 블록 구조체
│   │   └── Block        # 블록 생성, 채굴, 검증
│   │
│   ├── transaction.rs   # 💸 트랜잭션 구조체
│   │   ├── Transaction  # 거래 생성, 서명, 검증
│   │   └── TransactionPool # 트랜잭션 풀 관리
│   │
│   └── blockchain.rs    # ⛓️ 블록체인 구조체
│       └── Blockchain   # 체인 관리, 검증, 통계
│
├── Cargo.toml           # ⚙️ 의존성 및 설정
├── tests/               # 🧪 통합 테스트
└── benches/             # 📊 벤치마크
```

---

## 🔌 API 사용법

### 서버 시작 후 사용 가능한 API

#### 1. 전체 블록 조회

```bash
curl http://localhost:8080/api/blocks
```

**응답 예시:**
```json
[
  {
    "index": 0,
    "timestamp": "2025-01-15T10:00:00Z",
    "transactions": [],
    "previous_hash": "0",
    "hash": "000a1b2c3d4e5f...",
    "nonce": 12345,
    "difficulty": 4
  }
]
```

---

#### 2. 특정 블록 조회

```bash
curl http://localhost:8080/api/blocks/0
```

---

#### 3. 블록 채굴

```bash
curl -X POST http://localhost:8080/api/mine \
  -H "Content-Type: application/json" \
  -d '{"reward_address": "my_address"}'
```

**응답 예시:**
```json
{
  "message": "블록 채굴 성공",
  "block": {
    "index": 1,
    "hash": "00001234abcd...",
    ...
  }
}
```

---

#### 4. 트랜잭션 추가

```bash
curl -X POST http://localhost:8080/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "from": "alice",
    "to": "bob",
    "amount": 100,
    "fee": 1
  }'
```

**응답 예시:**
```json
{
  "message": "트랜잭션 추가 성공",
  "transaction_id": "abc123def456..."
}
```

---

#### 5. 잔액 조회

```bash
curl http://localhost:8080/api/balance/alice
```

**응답 예시:**
```json
{
  "address": "alice",
  "balance": 150
}
```

---

#### 6. 블록체인 통계

```bash
curl http://localhost:8080/api/stats
```

**응답 예시:**
```json
{
  "total_blocks": 5,
  "total_transactions": 12,
  "total_size_bytes": 4096,
  "difficulty": 4,
  "pending_transactions": 3
}
```

---

#### 7. 블록체인 검증

```bash
curl http://localhost:8080/api/validate
```

**응답 예시:**
```json
{
  "valid": true,
  "message": "블록체인이 유효합니다"
}
```

---

## 🖥️ CLI 명령어

### 정보 조회

```bash
# 블록체인 통계 및 최근 블록 출력
cargo run --release -- info
```

**출력 예시:**
```
==================================================
KONET 블록체인 정보
==================================================
블록체인 통계
├─ 총 블록 수: 1
├─ 총 트랜잭션: 0
├─ 전체 크기: 256 bytes (0.25 KB)
├─ 난이도: 4
└─ 대기 중인 트랜잭션: 0
==================================================

최근 블록:

1. Block #0
  Hash: 000a1b2c3d4e5f67
  Previous: 0000000000000000
  Time: 2025-01-15 10:00:00
  Transactions: 0
  Nonce: 12345
```

---

### 블록 채굴

```bash
cargo run --release -- mine --address miner_address
```

**출력 예시:**
```
[INFO] 블록 채굴 시작...
[INFO] 블록 #1 채굴 시작... (난이도: 4)
[INFO] 블록 #1 채굴 성공! Nonce: 123456, 소요 시간: 2.5s
[INFO] 블록 #1 체인에 추가됨
[INFO] 채굴 완료!
[INFO] 블록 수: 2
[INFO] miner_address 잔액: 50
```

---

### 트랜잭션 생성

```bash
cargo run --release -- create-tx \
  --from alice \
  --to bob \
  --amount 100 \
  --fee 1
```

---

## 🧪 테스트

### 단위 테스트

```bash
# 모든 테스트
cargo test

# 특정 모듈만
cargo test block::tests
cargo test transaction::tests
cargo test blockchain::tests

# 특정 테스트만
cargo test test_create_genesis_block
```

### 테스트 커버리지

```bash
# tarpaulin 설치
cargo install cargo-tarpaulin

# 커버리지 측정
cargo tarpaulin --out Html
```

---

## 📊 벤치마크

### 성능 측정

```bash
# 벤치마크 실행
cargo bench
```

**예상 결과:**
```
블록 생성 시간:       12.5 µs
블록 해시 계산:       8.2 µs
트랜잭션 검증:        3.1 µs
체인 검증 (100블록):  850 µs
```

---

## ⚡ 성능 최적화

### 릴리스 빌드 사용

항상 릴리스 모드로 빌드하세요:
```bash
cargo build --release
cargo run --release
```

**속도 차이:**
- 개발 빌드: ~5초/블록
- 릴리스 빌드: ~0.5초/블록 (10배 빠름!)

---

### 난이도 조정

난이도가 높을수록 채굴 시간이 기하급수적으로 증가합니다:

| 난이도 | 예상 시간 |
|--------|----------|
| 1      | 0.01초   |
| 2      | 0.1초    |
| 3      | 1초      |
| 4      | 10초     |
| 5      | 2분      |
| 6      | 30분     |

코드에서 조정:
```rust
let mut blockchain = Blockchain::new();
blockchain.difficulty = 3; // 쉬운 난이도
```

---

## 🔧 고급 사용법

### 라이브러리로 사용

다른 Rust 프로젝트에서 사용:

`Cargo.toml`:
```toml
[dependencies]
blockchain-core = { path = "../blockchain-core" }
```

코드:
```rust
use blockchain_core::{Blockchain, Transaction, Block};

fn main() {
    let mut blockchain = Blockchain::new();

    let tx = Transaction::new(
        "alice".to_string(),
        "bob".to_string(),
        100,
        1,
    );

    blockchain.add_transaction(tx).unwrap();
    blockchain.mine_pending_transactions("miner".to_string());

    println!("블록 수: {}", blockchain.len());
}
```

---

### 로깅 레벨 조정

```bash
# 디버그 로그 활성화
RUST_LOG=debug cargo run

# 특정 모듈만
RUST_LOG=blockchain_core::blockchain=debug cargo run

# 모든 로그
RUST_LOG=trace cargo run
```

---

## 🐛 디버깅

### VS Code 디버거 설정

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug blockchain-node",
      "cargo": {
        "args": [
          "build",
          "--bin=blockchain-node",
          "--package=blockchain-core"
        ]
      },
      "args": ["start", "--port", "8080"],
      "cwd": "${workspaceFolder}/blockchain-core"
    }
  ]
}
```

---

## 📚 코드 예제

### 예제 1: 간단한 블록체인

```rust
use blockchain_core::Blockchain;

fn main() {
    let mut blockchain = Blockchain::new();

    // 블록 3개 채굴
    for i in 1..=3 {
        blockchain.mine_pending_transactions(format!("miner{}", i));
    }

    // 검증
    println!("유효한가? {}", blockchain.is_valid());

    // 통계
    println!("{}", blockchain.get_stats());
}
```

---

### 예제 2: 송금 시나리오

```rust
use blockchain_core::{Blockchain, Transaction};

fn main() {
    let mut blockchain = Blockchain::new();

    // Alice가 채굴 보상 받음
    blockchain.mine_pending_transactions("alice".to_string());

    // Alice -> Bob 송금
    let tx = Transaction::new(
        "alice".to_string(),
        "bob".to_string(),
        30,
        1,
    );
    blockchain.add_transaction(tx).unwrap();

    // 채굴하여 트랜잭션 확정
    blockchain.mine_pending_transactions("miner".to_string());

    // 잔액 확인
    println!("Alice: {}", blockchain.get_balance("alice"));
    println!("Bob: {}", blockchain.get_balance("bob"));
}
```

---

## 🔍 문제 해결

### "error: linker `cc` not found"

**해결:**
```bash
# Ubuntu/WSL2
sudo apt install build-essential

# Mac
xcode-select --install
```

---

### 채굴이 너무 오래 걸림

**해결:**
- 난이도를 낮추세요
- 릴리스 빌드를 사용하세요 (`cargo build --release`)

---

### 포트가 이미 사용 중

**해결:**
```bash
# 프로세스 찾기
lsof -i :8080

# 프로세스 종료
kill -9 <PID>

# 또는 다른 포트 사용
cargo run -- start --port 3000
```

---

## 📖 추가 자료

- [Rust 공식 문서](https://doc.rust-lang.org/book/)
- [Actix-web 문서](https://actix.rs/docs/)
- [SHA-256 설명](https://en.wikipedia.org/wiki/SHA-2)
- [작업 증명(PoW) 설명](https://en.bitcoin.it/wiki/Proof_of_work)

---

## 🤝 기여

버그 발견 시:
1. GitHub Issues에 등록
2. 재현 방법 상세히 작성
3. 로그 첨부

---

## 📄 라이선스

MIT License

---

<div align="center">

**🦀 Rust로 만든 빠르고 안전한 블록체인! 🦀**

[메인 README로 돌아가기](../README.md)

</div>
