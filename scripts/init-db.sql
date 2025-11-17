-- KONET 블록체인 PostgreSQL 스키마
-- 초기화 스크립트

-- Extension 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 사용자 및 지갑
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    kyc_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address VARCHAR(66) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    wallet_type VARCHAR(20) NOT NULL CHECK (wallet_type IN ('hot', 'cold', 'multisig')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_address ON wallets(address);

-- ==========================================
-- 트랜잭션 기록
-- ==========================================

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    from_address VARCHAR(66) NOT NULL,
    to_address VARCHAR(66) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    fee NUMERIC(36, 18) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
    block_number BIGINT,
    block_hash VARCHAR(66),
    gas_used BIGINT,
    nonce BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_transactions_from ON transactions(from_address);
CREATE INDEX idx_transactions_to ON transactions(to_address);
CREATE INDEX idx_transactions_hash ON transactions(tx_hash);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- ==========================================
-- 잔액 (계정별)
-- ==========================================

CREATE TABLE IF NOT EXISTS balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(66) UNIQUE NOT NULL,
    balance NUMERIC(36, 18) DEFAULT 0 NOT NULL,
    locked_balance NUMERIC(36, 18) DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_balances_address ON balances(address);

-- ==========================================
-- 거래소 주문
-- ==========================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('buy', 'sell')),
    pair VARCHAR(20) NOT NULL,
    price NUMERIC(36, 18) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    filled_amount NUMERIC(36, 18) DEFAULT 0 NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'partial', 'filled', 'canceled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_pair ON orders(pair);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_price ON orders(price);

-- ==========================================
-- 거래 체결 내역
-- ==========================================

CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buy_order_id UUID NOT NULL REFERENCES orders(id),
    sell_order_id UUID NOT NULL REFERENCES orders(id),
    pair VARCHAR(20) NOT NULL,
    price NUMERIC(36, 18) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    buyer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trades_pair ON trades(pair);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

-- ==========================================
-- NFT 메타데이터
-- ==========================================

CREATE TABLE IF NOT EXISTS nfts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id BIGINT NOT NULL,
    contract_address VARCHAR(66) NOT NULL,
    owner_address VARCHAR(66) NOT NULL,
    creator_address VARCHAR(66) NOT NULL,
    token_uri TEXT,
    metadata JSONB,
    rarity VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(contract_address, token_id)
);

CREATE INDEX idx_nfts_owner ON nfts(owner_address);
CREATE INDEX idx_nfts_creator ON nfts(creator_address);
CREATE INDEX idx_nfts_contract ON nfts(contract_address);

-- ==========================================
-- API 키 관리
-- ==========================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    name VARCHAR(100),
    permissions JSONB,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- ==========================================
-- 감사 로그
-- ==========================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ==========================================
-- 세션 관리
-- ==========================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);

-- ==========================================
-- 통계 테이블 (집계용)
-- ==========================================

CREATE TABLE IF NOT EXISTS daily_stats (
    date DATE PRIMARY KEY,
    total_transactions BIGINT DEFAULT 0,
    total_volume NUMERIC(36, 18) DEFAULT 0,
    unique_addresses BIGINT DEFAULT 0,
    new_users BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 트리거: updated_at 자동 갱신
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_balances_updated_at
    BEFORE UPDATE ON balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 뷰: 사용자 지갑 요약
-- ==========================================

CREATE OR REPLACE VIEW user_wallet_summary AS
SELECT
    u.id AS user_id,
    u.username,
    w.address,
    b.balance,
    b.locked_balance,
    (b.balance + b.locked_balance) AS total_balance
FROM users u
LEFT JOIN wallets w ON u.id = w.user_id
LEFT JOIN balances b ON w.address = b.address;

-- ==========================================
-- 뷰: 거래소 호가창
-- ==========================================

CREATE OR REPLACE VIEW order_book AS
SELECT
    pair,
    order_type,
    price,
    SUM(amount - filled_amount) AS total_amount
FROM orders
WHERE status IN ('open', 'partial')
GROUP BY pair, order_type, price
ORDER BY pair, order_type, price DESC;

-- ==========================================
-- 초기 데이터
-- ==========================================

-- 테스트 사용자 (개발 환경용)
INSERT INTO users (email, username, password_hash) VALUES
('admin@konet.io', 'admin', crypt('admin123', gen_salt('bf')))
ON CONFLICT (email) DO NOTHING;

-- 시스템 계정
INSERT INTO users (email, username, password_hash) VALUES
('system@konet.io', 'system', crypt('system', gen_salt('bf')))
ON CONFLICT (email) DO NOTHING;

COMMENT ON TABLE users IS '사용자 계정';
COMMENT ON TABLE wallets IS '암호화폐 지갑';
COMMENT ON TABLE transactions IS '블록체인 트랜잭션 기록';
COMMENT ON TABLE balances IS '계정별 잔액';
COMMENT ON TABLE orders IS '거래소 주문';
COMMENT ON TABLE trades IS '체결된 거래';
COMMENT ON TABLE nfts IS 'NFT 메타데이터';
COMMENT ON TABLE api_keys IS 'API 인증 키';
COMMENT ON TABLE audit_logs IS '감사 로그';
COMMENT ON TABLE sessions IS '사용자 세션';
