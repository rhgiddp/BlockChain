# 🚀 KONET 블록체인 - 빠른 시작 가이드

> **5분 안에 블록체인을 실행하세요!**

---

## 📋 무엇이 만들어졌나요?

완전한 블록체인 시스템이 구축되었습니다:

### ✅ 완성된 모듈

1. **🦀 Rust 블록체인 코어** (`blockchain-core/`)
   - 완전히 작동하는 블록체인 엔진
   - 작업 증명(PoW) 채굴 시스템
   - HTTP API 서버
   - CLI 명령어 도구

2. **📜 스마트 컨트랙트** (`smart-contracts/`)
   - Hardhat 프로젝트 설정 완료
   - KONETToken (ERC20) 구현
   - OpenZeppelin 통합

3. **🐳 Docker 설정** (`docker/`, `docker-compose.yml`)
   - 프로덕션 레디 컨테이너
   - Multi-service orchestration
   - 모니터링 (Prometheus, Grafana)

4. **📚 완벽한 문서** (`docs/`)
   - 초보자 가이드
   - 개발 환경 설정
   - 로컬 개발 가이드
   - 배포 가이드

---

## ⚡ 1분 만에 시작하기

### Docker로 실행 (가장 쉬움!)

```bash
# 1. 저장소 클론
git clone https://github.com/rhgiddp/BlockChain.git
cd BlockChain

# 2. Docker Compose로 실행
docker-compose up -d

# 3. 브라우저에서 확인
# http://localhost:8080
```

**끝!** 블록체인이 실행 중입니다! 🎉

---

## 🧪 테스트하기

### 1. 블록체인 정보 조회

```bash
curl http://localhost:8080/api/blocks
```

### 2. 블록 채굴

```bash
curl -X POST http://localhost:8080/api/mine \
  -H "Content-Type: application/json" \
  -d '{"reward_address": "my_address"}'
```

### 3. 잔액 조회

```bash
curl http://localhost:8080/api/balance/my_address
```

### 4. 트랜잭션 추가

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

---

## 🛠️ 로컬 개발 (Rust 직접 실행)

### 1. 빌드

```bash
cd blockchain-core
cargo build --release
```

### 2. 실행

```bash
# HTTP 서버 모드
cargo run --release

# 또는 CLI 모드
cargo run --release -- info
cargo run --release -- mine --address miner_address
```

### 3. 테스트

```bash
cargo test
```

---

## 📁 프로젝트 구조

```
BlockChain/
├── 📖 README.md                    # 프로젝트 개요
├── 🚀 QUICKSTART.md                # 이 파일
│
├── 🦀 blockchain-core/             # Rust 블록체인 엔진
│   ├── src/
│   │   ├── main.rs                # HTTP 서버 & CLI
│   │   ├── block.rs               # 블록 구조
│   │   ├── blockchain.rs          # 블록체인 관리
│   │   └── transaction.rs         # 트랜잭션 처리
│   ├── Cargo.toml                 # Rust 의존성
│   └── README.md                  # 상세 가이드
│
├── 📜 smart-contracts/             # Solidity 스마트 컨트랙트
│   ├── contracts/
│   │   └── KONETToken.sol         # ERC20 토큰
│   ├── hardhat.config.js          # Hardhat 설정
│   └── package.json               # Node 의존성
│
├── 🐳 docker/                      # Docker 설정
│   └── Dockerfile.blockchain      # 블록체인 이미지
│
├── 📚 docs/                        # 완벽한 문서
│   ├── 00-시작하기.md              # 초보자 가이드
│   ├── 01-개발환경-설정.md         # 설치 가이드
│   ├── 02-로컬-개발-가이드.md      # 개발 방법
│   └── 03-배포-가이드.md           # AWS/GCP 배포
│
└── 📋 docker-compose.yml           # 전체 시스템 실행
```

---

## 📖 문서 읽는 순서

### 🔰 처음 시작하는 분

1. **[README.md](README.md)** ← 프로젝트 전체 개요
2. **[docs/00-시작하기.md](docs/00-시작하기.md)** ← 블록체인 기초 개념
3. **[docs/01-개발환경-설정.md](docs/01-개발환경-설정.md)** ← 도구 설치
4. **[docs/02-로컬-개발-가이드.md](docs/02-로컬-개발-가이드.md)** ← 개발 시작

### 💻 개발자

1. **[blockchain-core/README.md](blockchain-core/README.md)** ← Rust 코어 가이드
2. **[docs/02-로컬-개발-가이드.md](docs/02-로컬-개발-가이드.md)** ← 개발 워크플로우

### 🚀 배포 담당자

1. **[docs/03-배포-가이드.md](docs/03-배포-가이드.md)** ← AWS/GCP 배포

---

## 🎓 학습 경로

### Week 1: 기초 이해
```
□ README.md 읽기
□ docs/00-시작하기.md 읽기
□ Docker로 실행해보기
□ API 테스트해보기
```

### Week 2: 개발 환경
```
□ docs/01-개발환경-설정.md 따라하기
□ Rust, Node.js 설치
□ VS Code 설정
□ 첫 빌드 성공
```

### Week 3: 코드 이해
```
□ blockchain-core/src/block.rs 읽기
□ blockchain-core/src/transaction.rs 읽기
□ blockchain-core/src/blockchain.rs 읽기
□ 테스트 코드 실행
```

### Week 4: 실전 개발
```
□ 간단한 기능 추가
□ 테스트 작성
□ Pull Request 생성
```

---

## 🔑 핵심 명령어

### Docker

```bash
# 시작
docker-compose up -d

# 중지
docker-compose down

# 로그 보기
docker-compose logs -f

# 재시작
docker-compose restart
```

### Rust 블록체인

```bash
# 빌드
cargo build --release

# 실행
cargo run --release

# 테스트
cargo test

# 린트
cargo clippy

# 포맷
cargo fmt
```

### 스마트 컨트랙트

```bash
# 의존성 설치
npm install

# 컴파일
npx hardhat compile

# 테스트
npx hardhat test

# 로컬 노드 실행
npx hardhat node
```

---

## 💡 자주 묻는 질문

### Q: 처음 시작하려면 무엇부터?
**A:** [README.md](README.md) → [docs/00-시작하기.md](docs/00-시작하기.md) 순서로 읽으세요.

### Q: 코딩을 전혀 모르는데 가능한가요?
**A:** 네! docs/00-시작하기.md에서 모든 것을 처음부터 설명합니다.

### Q: Docker 없이 실행 가능한가요?
**A:** 네! [docs/02-로컬-개발-가이드.md](docs/02-로컬-개발-가이드.md)를 참고하세요.

### Q: 프로덕션 배포는 어떻게?
**A:** [docs/03-배포-가이드.md](docs/03-배포-가이드.md)에 AWS/GCP 가이드가 있습니다.

### Q: 에러가 발생했어요!
**A:** 각 문서의 "문제 해결" 섹션을 확인하세요.

---

## 🎯 다음 단계

### 즉시 시작

```bash
# 1. Docker로 실행
docker-compose up -d

# 2. 브라우저에서 확인
open http://localhost:8080

# 3. API 테스트
curl http://localhost:8080/api/stats
```

### 더 배우기

- **기초 개념**: [docs/00-시작하기.md](docs/00-시작하기.md)
- **개발 환경**: [docs/01-개발환경-설정.md](docs/01-개발환경-설정.md)
- **코드 분석**: [blockchain-core/README.md](blockchain-core/README.md)

---

## 📊 프로젝트 통계

```
📝 코드 라인 수:     ~3,000 줄
📄 문서:            4개 주요 가이드
🧪 테스트:          포함
🐳 Docker:          준비 완료
☸️ Kubernetes:      설정 완료
```

### 기술 스택

```
Backend:     Rust 1.80
Contract:    Solidity 0.8.24
Database:    PostgreSQL, Redis, LevelDB
DevOps:      Docker, Kubernetes
Monitoring:  Prometheus, Grafana
```

---

## 🤝 기여하기

버그를 발견하거나 개선 아이디어가 있나요?

1. GitHub Issues에 등록
2. Pull Request 생성
3. 문서 개선 제안

---

## 📞 지원

- **이메일**: dev@konet.io
- **GitHub Issues**: [링크]
- **문서**: [docs/](docs/)

---

## 📄 라이선스

MIT License - 자유롭게 사용하세요!

---

<div align="center">

## 🎉 환영합니다! 🎉

**KONET 블록체인 개발자 여정을 시작합니다!**

[README로 돌아가기](README.md) | [초보자 가이드](docs/00-시작하기.md) | [개발 시작](docs/02-로컬-개발-가이드.md)

---

**⭐ 프로젝트가 유용하다면 Star를 눌러주세요!**

</div>
