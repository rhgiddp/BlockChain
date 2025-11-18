# 🔐 KONET 블록체인 관리자 페이지 가이드

## 📋 목차

1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [설치 및 실행](#설치-및-실행)
4. [주요 기능](#주요-기능)
5. [API 문서](#api-문서)
6. [권한 관리](#권한-관리)
7. [보안](#보안)
8. [문제 해결](#문제-해결)

---

## 개요

KONET 블록체인 관리자 페이지는 블록체인 시스템의 모든 측면을 모니터링하고 관리할 수 있는 포괄적인 관리 도구입니다.

### 주요 특징

- ✅ **실시간 대시보드**: 시스템 전체 현황 모니터링
- ✅ **사용자 관리**: 사용자 조회, 제재, KYC 승인
- ✅ **거래 모니터링**: 의심 거래 탐지 및 플래그
- ✅ **노드 관리**: 블록체인 노드 상태 모니터링
- ✅ **시스템 설정**: 플랫폼 설정 관리
- ✅ **활동 로그**: 모든 관리자 활동 자동 기록
- ✅ **역할 기반 권한**: RBAC (Role-Based Access Control)

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────┐
│          관리자 프론트엔드 (React)               │
│              Port: 3005 (Nginx)                 │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/HTTPS
┌──────────────────▼──────────────────────────────┐
│         관리자 서비스 (Node.js)                  │
│              Port: 3004                         │
└──────────────────┬──────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼─────┐ ┌──▼──────┐ ┌─▼──────┐
│ PostgreSQL │ │  Redis  │ │  Logs  │
│  Port: 5432│ │Port: 6379│ │        │
└────────────┘ └─────────┘ └────────┘
```

### 기술 스택

**백엔드**:
- Node.js 18
- Express.js
- PostgreSQL 15
- Redis 7
- JWT 인증

**프론트엔드**:
- React 18
- TailwindCSS
- React Query
- Axios
- Lucide Icons

**배포**:
- Docker & Docker Compose
- Nginx
- 멀티 스테이지 빌드

---

## 설치 및 실행

### 1. 사전 요구사항

- Docker & Docker Compose
- Node.js 18+ (로컬 개발 시)
- PostgreSQL 15+ (로컬 개발 시)

### 2. 환경 변수 설정

`.env` 파일 생성:

```bash
# 데이터베이스
DB_HOST=localhost
DB_PORT=5432
DB_NAME=konet_wallet
DB_USER=postgres
DB_PASSWORD=your_secure_password

# JWT
JWT_SECRET=your_jwt_secret_key

# 관리자 서비스
ADMIN_PORT=3004
NODE_ENV=production

# 프론트엔드
REACT_APP_ADMIN_API_BASE_URL=http://localhost:3004/api/admin
```

### 3. Docker로 실행 (권장)

```bash
# 관리자 시스템 시작
docker-compose -f docker-compose.admin.yml up -d

# 로그 확인
docker-compose -f docker-compose.admin.yml logs -f

# 중지
docker-compose -f docker-compose.admin.yml down
```

### 4. 로컬 개발 환경

#### 백엔드

```bash
cd admin-service
npm install
npm run dev  # nodemon으로 개발
```

#### 프론트엔드

```bash
cd admin-frontend
npm install
npm start  # 개발 서버 시작 (포트 3000)
```

### 5. 데이터베이스 초기화

```bash
# PostgreSQL 접속
psql -U postgres -d konet_wallet

# 관리자 스키마 실행
\i scripts/init-admin-db.sql
```

### 6. 첫 관리자 계정 생성

```sql
-- 먼저 일반 사용자 계정 필요 (이미 있다면 스킵)
INSERT INTO users (email, password_hash, username, role)
VALUES ('admin@konet.com', 'hashed_password', 'admin', 'admin');

-- 관리자 권한 부여
INSERT INTO admin_users (user_id, role, permissions)
SELECT id, 'super_admin', '{}'::jsonb
FROM users
WHERE email = 'admin@konet.com';
```

---

## 주요 기능

### 1. 대시보드

**경로**: `/admin/dashboard`

**기능**:
- 실시간 통계 (사용자, 지갑, 거래, 알림)
- 최근 24시간 신규 사용자
- 거래량 및 거래 수
- 활동 로그 (최근 10건)
- 시스템 알림
- 상위 사용자 (거래량 기준)
- 노드 상태

**자동 갱신**:
- 통계: 30초마다
- 활동 로그: 5초마다
- 알림: 10초마다

### 2. 사용자 관리

**경로**: `/admin/users`

**기능**:
- 전체 사용자 목록
- 검색 (이메일, 사용자명)
- 필터링:
  - 상태 (활성/비활성)
  - KYC 상태 (대기/승인/거부)
- 사용자 상세 정보 조회
- 사용자 활성화/비활성화
- 사용자 제재:
  - 경고 (warning)
  - 정지 (suspension)
  - 차단 (ban)
  - 자산 동결 (freeze_assets)
- 제재 해제
- 사용자 삭제 (GDPR 준수 익명화)

**API 예시**:
```bash
# 사용자 목록 조회
GET /api/admin/users?page=1&limit=20&search=user@example.com

# 사용자 비활성화
PATCH /api/admin/users/{userId}/status
{
  "is_active": false
}

# 사용자 제재
POST /api/admin/users/{userId}/sanction
{
  "type": "suspension",
  "reason": "부적절한 거래",
  "duration_hours": 72
}
```

### 3. KYC 관리

**경로**: `/admin/kyc`

**기능**:
- KYC 신청 목록
- 상태별 필터 (pending, approved, rejected)
- 문서 확인
- 승인 (레벨 1-3 선택)
- 거부 (사유 입력)

**KYC 레벨**:
- **레벨 0**: KYC 미제출
- **레벨 1**: 기본 인증 (이메일, 전화번호)
- **레벨 2**: 신원 확인 (신분증)
- **레벨 3**: 고급 인증 (주소 확인, 소득 증명)

**API 예시**:
```bash
# KYC 승인
POST /api/admin/kyc/{userId}/approve
{
  "level": 2
}

# KYC 거부
POST /api/admin/kyc/{userId}/reject
{
  "reason": "제출된 문서가 불분명합니다"
}
```

### 4. 거래 모니터링

**경로**: `/admin/transactions`

**기능**:
- 모든 거래 내역 조회
- 의심 거래 플래그
- 고액 거래 모니터링
- 거래 패턴 분석

**플래그 타입**:
- `suspicious`: 의심 거래
- `high_value`: 고액 거래
- `money_laundering`: 자금 세탁 의심
- `fraud`: 사기 의심

### 5. 시스템 설정

**경로**: `/admin/settings`

**설정 카테고리**:
- **general**: 플랫폼 이름, 유지보수 모드
- **security**: 로그인 시도 제한, 세션 타임아웃
- **transaction**: 최소/최대 거래 금액, 수수료
- **kyc**: KYC 필수 여부, 한도

**API 예시**:
```bash
# 설정 조회
GET /api/admin/settings?category=security

# 설정 변경
PATCH /api/admin/settings/{key}
{
  "value": 10
}
```

### 6. 활동 로그

**자동 기록 항목**:
- 모든 관리자 활동
- IP 주소
- User Agent
- 타임스탬프
- 작업 대상 (resource_type, resource_id)
- 작업 내용 (details)

**보관 기간**: 무제한 (용량 제한 시 설정 가능)

---

## API 문서

### 인증

모든 API 요청에는 JWT 토큰이 필요합니다.

**헤더**:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### 엔드포인트

#### 대시보드
- `GET /api/admin/dashboard/stats` - 전체 통계
- `GET /api/admin/dashboard/activity` - 활동 로그
- `GET /api/admin/dashboard/alerts` - 시스템 알림
- `POST /api/admin/dashboard/alerts/:alertId/resolve` - 알림 해결
- `GET /api/admin/dashboard/charts/transactions` - 거래 차트
- `GET /api/admin/dashboard/charts/users` - 사용자 차트

#### 사용자 관리
- `GET /api/admin/users` - 사용자 목록
- `GET /api/admin/users/:userId` - 사용자 상세
- `PATCH /api/admin/users/:userId/status` - 상태 변경
- `POST /api/admin/users/:userId/sanction` - 제재 등록
- `POST /api/admin/users/:userId/sanctions/:sanctionId/lift` - 제재 해제
- `DELETE /api/admin/users/:userId` - 사용자 삭제

#### KYC 관리
- `GET /api/admin/kyc` - KYC 목록
- `POST /api/admin/kyc/:userId/approve` - KYC 승인
- `POST /api/admin/kyc/:userId/reject` - KYC 거부

### 에러 코드

- `200 OK`: 성공
- `201 Created`: 생성 성공
- `400 Bad Request`: 잘못된 요청
- `401 Unauthorized`: 인증 필요
- `403 Forbidden`: 권한 없음
- `404 Not Found`: 리소스 없음
- `500 Internal Server Error`: 서버 오류

---

## 권한 관리

### 역할 (Role)

| 역할 | 권한 | 설명 |
|------|------|------|
| **super_admin** | 모든 권한 | 시스템 전체 관리 |
| **admin** | 대부분 권한 | 일반 관리 업무 |
| **moderator** | 사용자 관리 | 사용자/KYC 관리만 |
| **support** | 읽기 + 사용자 지원 | 사용자 문의 대응 |
| **analyst** | 읽기 전용 | 통계 및 분석만 |

### 권한 예시

```json
{
  "users": {
    "read": true,
    "write": true,
    "delete": false
  },
  "transactions": {
    "read": true,
    "write": false,
    "flag": true
  },
  "settings": {
    "read": true,
    "write": false
  }
}
```

### 역할 부여

```sql
-- 관리자 역할 부여
UPDATE admin_users
SET role = 'admin', permissions = '{
  "users": {"read": true, "write": true},
  "transactions": {"read": true, "flag": true}
}'::jsonb
WHERE user_id = 'USER_ID';
```

---

## 보안

### 구현된 보안 기능

1. **인증**:
   - JWT 기반 토큰
   - 토큰 만료 시간 (1시간)
   - Refresh 토큰 (7일)

2. **권한 제어**:
   - 역할 기반 (RBAC)
   - 세밀한 권한 제어
   - 모든 작업 권한 확인

3. **활동 로깅**:
   - 모든 관리자 활동 기록
   - IP 주소 기록
   - User Agent 기록

4. **보안 헤더**:
   - Helmet.js
   - CORS 설정
   - Rate Limiting

5. **데이터 보호**:
   - 사용자 삭제 시 익명화 (GDPR)
   - 민감한 정보 암호화

### 보안 권장사항

1. **강력한 비밀번호 사용**
2. **JWT_SECRET 정기 변경**
3. **HTTPS 사용 (프로덕션)**
4. **VPN 또는 IP 화이트리스트**
5. **2FA 활성화 (향후 추가)**
6. **정기적인 로그 검토**
7. **권한 최소화 원칙**

---

## 문제 해결

### 1. 로그인 불가

**문제**: 401 Unauthorized

**해결**:
```bash
# 토큰 확인
localStorage.getItem('admin_token')

# 토큰 재발급
# 로그아웃 후 재로그인
```

### 2. 권한 없음

**문제**: 403 Forbidden

**해결**:
```sql
-- 권한 확인
SELECT role, permissions
FROM admin_users
WHERE user_id = 'YOUR_USER_ID';

-- 권한 업데이트 (super_admin만 가능)
UPDATE admin_users
SET role = 'admin'
WHERE user_id = 'YOUR_USER_ID';
```

### 3. 데이터베이스 연결 실패

**문제**: Connection refused

**해결**:
```bash
# PostgreSQL 상태 확인
docker-compose -f docker-compose.admin.yml ps

# 로그 확인
docker-compose -f docker-compose.admin.yml logs postgres

# 재시작
docker-compose -f docker-compose.admin.yml restart postgres
```

### 4. 통계가 업데이트되지 않음

**문제**: 캐시 문제

**해결**:
```bash
# Redis 캐시 클리어
docker exec -it konet-redis redis-cli FLUSHDB
```

---

## 성능 최적화

### 1. 데이터베이스

- 인덱스 최적화됨
- 뷰(View) 사용 (admin_dashboard_stats)
- 페이지네이션 구현

### 2. API

- Redis 캐싱 (30초)
- Rate Limiting
- 압축 (Gzip)

### 3. 프론트엔드

- React Query 캐싱
- 자동 갱신 간격 최적화
- Lazy Loading

---

## 모니터링

### 로그 확인

```bash
# 백엔드 로그
docker-compose -f docker-compose.admin.yml logs -f admin-service

# 프론트엔드 로그
docker-compose -f docker-compose.admin.yml logs -f admin-frontend

# 데이터베이스 로그
docker-compose -f docker-compose.admin.yml logs -f postgres
```

### 활동 로그 조회

```sql
-- 최근 활동
SELECT * FROM admin_activity_logs
ORDER BY created_at DESC
LIMIT 100;

-- 특정 관리자 활동
SELECT * FROM admin_activity_logs
WHERE admin_user_id = 'ADMIN_ID'
ORDER BY created_at DESC;

-- 특정 액션
SELECT * FROM admin_activity_logs
WHERE action = 'approve_kyc'
AND created_at > NOW() - INTERVAL '24 hours';
```

---

## 백업 및 복구

### 데이터베이스 백업

```bash
# 백업 생성
docker exec konet-postgres pg_dump -U postgres konet_wallet > backup_$(date +%Y%m%d).sql

# 복구
docker exec -i konet-postgres psql -U postgres konet_wallet < backup_20250117.sql
```

---

## 라이센스

MIT License

---

## 지원

문제가 발생하거나 질문이 있으시면:

- **이메일**: support@konet.com
- **GitHub Issues**: https://github.com/konet/blockchain/issues
- **문서**: https://docs.konet.com

---

**작성일**: 2025-01-17
**버전**: 1.0.0
**상태**: ✅ 프로덕션 레디
