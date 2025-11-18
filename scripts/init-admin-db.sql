-- ========================================
-- KONET 블록체인 관리자 페이지 스키마
-- ========================================

-- 관리자 사용자 테이블
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator', 'support', 'analyst')),
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 관리자 활동 로그
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20) CHECK (status IN ('success', 'failed', 'pending')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 시스템 설정
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    updated_by UUID REFERENCES admin_users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- 사용자 KYC (Know Your Customer)
CREATE TABLE IF NOT EXISTS user_kyc (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
    status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'rejected', 'expired')) DEFAULT 'pending',
    level INTEGER DEFAULT 0 CHECK (level >= 0 AND level <= 3),
    full_name VARCHAR(255),
    date_of_birth DATE,
    nationality VARCHAR(3),
    document_type VARCHAR(50),
    document_number VARCHAR(100),
    document_front_url TEXT,
    document_back_url TEXT,
    selfie_url TEXT,
    proof_of_address_url TEXT,
    verified_by UUID REFERENCES admin_users(id),
    verified_at TIMESTAMP,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 사용자 제재 내역
CREATE TABLE IF NOT EXISTS user_sanctions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) CHECK (type IN ('warning', 'suspension', 'ban', 'freeze_assets')),
    reason TEXT NOT NULL,
    duration_hours INTEGER,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    is_permanent BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES admin_users(id),
    lifted_by UUID REFERENCES admin_users(id),
    lifted_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 거래 플래그 (의심 거래)
CREATE TABLE IF NOT EXISTS transaction_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash VARCHAR(66) NOT NULL,
    flag_type VARCHAR(50) CHECK (flag_type IN ('suspicious', 'high_value', 'money_laundering', 'fraud', 'other')),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    description TEXT,
    auto_detected BOOLEAN DEFAULT false,
    flagged_by UUID REFERENCES admin_users(id),
    status VARCHAR(20) CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')) DEFAULT 'open',
    assigned_to UUID REFERENCES admin_users(id),
    resolution TEXT,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 블록체인 노드 관리
CREATE TABLE IF NOT EXISTS blockchain_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_name VARCHAR(100) NOT NULL,
    node_type VARCHAR(50) CHECK (node_type IN ('validator', 'full', 'light', 'archive')),
    ip_address INET NOT NULL,
    port INTEGER NOT NULL,
    peer_id TEXT,
    is_active BOOLEAN DEFAULT true,
    is_synced BOOLEAN DEFAULT false,
    block_height BIGINT DEFAULT 0,
    last_ping TIMESTAMP,
    uptime_percentage DECIMAL(5,2) DEFAULT 0,
    version VARCHAR(50),
    location VARCHAR(100),
    added_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 시스템 알림
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(50) CHECK (alert_type IN ('security', 'performance', 'error', 'warning', 'info')),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(100),
    is_read BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES admin_users(id),
    resolved_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API 사용량 통계
CREATE TABLE IF NOT EXISTS api_usage_stats (
    id BIGSERIAL PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 실시간 통계 뷰
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours') as new_users_24h,
    (SELECT COUNT(*) FROM wallets) as total_wallets,
    (SELECT COUNT(*) FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours') as transactions_24h,
    (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours') as volume_24h,
    (SELECT COUNT(*) FROM transaction_flags WHERE status = 'open') as open_flags,
    (SELECT COUNT(*) FROM user_kyc WHERE status = 'pending') as pending_kyc,
    (SELECT COUNT(*) FROM blockchain_nodes WHERE is_active = true) as active_nodes,
    (SELECT COUNT(*) FROM system_alerts WHERE is_resolved = false) as unresolved_alerts;

-- 인덱스 생성
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_is_active ON admin_users(is_active);
CREATE INDEX idx_admin_activity_logs_admin_user_id ON admin_activity_logs(admin_user_id);
CREATE INDEX idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);
CREATE INDEX idx_admin_activity_logs_action ON admin_activity_logs(action);
CREATE INDEX idx_system_settings_category ON system_settings(category);
CREATE INDEX idx_user_kyc_status ON user_kyc(status);
CREATE INDEX idx_user_kyc_user_id ON user_kyc(user_id);
CREATE INDEX idx_user_sanctions_user_id ON user_sanctions(user_id);
CREATE INDEX idx_user_sanctions_is_active ON user_sanctions(is_active);
CREATE INDEX idx_transaction_flags_status ON transaction_flags(status);
CREATE INDEX idx_transaction_flags_severity ON transaction_flags(severity);
CREATE INDEX idx_blockchain_nodes_is_active ON blockchain_nodes(is_active);
CREATE INDEX idx_system_alerts_is_resolved ON system_alerts(is_resolved);
CREATE INDEX idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX idx_api_usage_stats_created_at ON api_usage_stats(created_at);
CREATE INDEX idx_api_usage_stats_endpoint ON api_usage_stats(endpoint);

-- 트리거: 관리자 활동 로그 자동 기록
CREATE OR REPLACE FUNCTION log_admin_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        INSERT INTO admin_activity_logs (
            admin_user_id,
            action,
            resource_type,
            resource_id,
            details
        ) VALUES (
            NEW.verified_by,
            'kyc_status_change',
            'user_kyc',
            NEW.user_id::TEXT,
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_kyc_changes
AFTER UPDATE ON user_kyc
FOR EACH ROW
EXECUTE FUNCTION log_admin_activity();

-- 샘플 시스템 설정
INSERT INTO system_settings (category, key, value, description, is_public) VALUES
('general', 'platform_name', '"KONET Blockchain"', 'Platform name', true),
('general', 'maintenance_mode', 'false', 'Enable/disable maintenance mode', false),
('security', 'max_login_attempts', '5', 'Maximum login attempts before lockout', false),
('security', 'session_timeout_minutes', '30', 'Session timeout in minutes', false),
('transaction', 'min_transaction_amount', '0.0001', 'Minimum transaction amount', true),
('transaction', 'max_transaction_amount', '1000000', 'Maximum transaction amount', true),
('transaction', 'transaction_fee_percentage', '0.1', 'Transaction fee percentage', true),
('kyc', 'kyc_required', 'true', 'Require KYC verification', true),
('kyc', 'max_withdrawal_without_kyc', '1000', 'Maximum withdrawal without KYC (USD)', true)
ON CONFLICT (category, key) DO NOTHING;

-- 권한 템플릿
COMMENT ON TABLE admin_users IS 'Administrator users with various roles and permissions';
COMMENT ON COLUMN admin_users.role IS 'super_admin: Full access | admin: Most access | moderator: User management | support: User support | analyst: Read-only analytics';
COMMENT ON COLUMN admin_users.permissions IS 'Custom permissions JSON: {users: {read: true, write: true}, transactions: {read: true, write: false}}';
