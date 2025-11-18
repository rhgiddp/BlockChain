import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Wallet, TrendingUp, AlertTriangle, Activity, DollarSign, Shield, Clock
} from 'lucide-react';
import { adminAPI } from '../services/adminAPI';

/**
 * 관리자 대시보드
 */
export default function AdminDashboard() {
  // 전체 통계 조회
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: adminAPI.getDashboardStats,
    refetchInterval: 30000 // 30초마다 갱신
  });

  // 알림 조회
  const { data: alertsData } = useQuery({
    queryKey: ['admin', 'alerts'],
    queryFn: adminAPI.getAlerts,
    refetchInterval: 10000 // 10초마다 갱신
  });

  // 활동 로그 조회
  const { data: activityData } = useQuery({
    queryKey: ['admin', 'activity'],
    queryFn: () => adminAPI.getActivity({ limit: 10 }),
    refetchInterval: 5000 // 5초마다 갱신
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const overview = stats?.overview || {};
  const alerts = alertsData?.alerts || [];
  const activities = activityData?.activities || [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">관리자 대시보드</h1>
        <p className="text-gray-600 mt-2">KONET 블록체인 시스템 전체 현황</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Users className="text-blue-600" />}
          title="전체 사용자"
          value={overview.active_users?.toLocaleString()}
          change="+{overview.new_users_24h} (24h)"
          changeType="increase"
        />
        <StatCard
          icon={<Wallet className="text-green-600" />}
          title="총 지갑 수"
          value={overview.total_wallets?.toLocaleString()}
          subtitle="활성 지갑"
        />
        <StatCard
          icon={<TrendingUp className="text-purple-600" />}
          title="24시간 거래"
          value={overview.transactions_24h?.toLocaleString()}
          subtitle={`₩${overview.volume_24h?.toLocaleString() || 0}`}
        />
        <StatCard
          icon={<AlertTriangle className="text-red-600" />}
          title="경고"
          value={overview.unresolved_alerts}
          subtitle={`${overview.pending_kyc} KYC 대기`}
          changeType="warning"
        />
      </div>

      {/* 차트 & 활동 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 최근 활동 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">최근 활동</h2>
            <Activity size={20} className="text-gray-400" />
          </div>
          <div className="space-y-3">
            {activities.map((activity, index) => (
              <ActivityItem key={index} activity={activity} />
            ))}
          </div>
        </div>

        {/* 시스템 알림 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">시스템 알림</h2>
            <Shield size={20} className="text-gray-400" />
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert, index) => (
              <AlertItem key={index} alert={alert} />
            ))}
          </div>
        </div>
      </div>

      {/* 상위 사용자 & 노드 상태 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 상위 사용자 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">상위 사용자 (거래량)</h2>
          <div className="space-y-3">
            {stats?.topUsers?.slice(0, 5).map((user, index) => (
              <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{user.email}</div>
                    <div className="text-sm text-gray-500">{user.tx_count} 거래</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">₩{parseFloat(user.volume || 0).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 시스템 상태 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">시스템 상태</h2>
          <div className="space-y-4">
            <StatusRow
              label="활성 노드"
              value={`${stats?.systemHealth?.active_nodes || 0}개`}
              status="good"
            />
            <StatusRow
              label="동기화된 노드"
              value={`${stats?.systemHealth?.synced_nodes || 0}개`}
              status="good"
            />
            <StatusRow
              label="평균 가동률"
              value={`${parseFloat(stats?.systemHealth?.avg_uptime || 0).toFixed(1)}%`}
              status={stats?.systemHealth?.avg_uptime > 95 ? 'good' : 'warning'}
            />
            <StatusRow
              label="미해결 플래그"
              value={`${overview.open_flags || 0}건`}
              status={overview.open_flags > 5 ? 'warning' : 'good'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 통계 카드
 */
function StatCard({ icon, title, value, subtitle, change, changeType }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-gray-50 rounded-lg">
          {icon}
        </div>
        {changeType && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            changeType === 'increase' ? 'bg-green-100 text-green-700' :
            changeType === 'warning' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {change}
          </span>
        )}
      </div>
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="text-2xl font-bold">{value || '0'}</div>
      {subtitle && <div className="text-sm text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}

/**
 * 활동 항목
 */
function ActivityItem({ activity }) {
  const actionLabels = {
    'view_dashboard': '대시보드 조회',
    'view_user_details': '사용자 상세 조회',
    'approve_kyc': 'KYC 승인',
    'reject_kyc': 'KYC 거부',
    'create_sanction': '사용자 제재',
    'activate_user': '사용자 활성화',
    'deactivate_user': '사용자 비활성화'
  };

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg">
      <Clock size={16} className="text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {activity.admin_email} - {actionLabels[activity.action] || activity.action}
        </div>
        <div className="text-xs text-gray-500">
          {new Date(activity.created_at).toLocaleString('ko-KR')}
        </div>
      </div>
    </div>
  );
}

/**
 * 알림 항목
 */
function AlertItem({ alert }) {
  const severityColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200'
  };

  return (
    <div className={`p-3 rounded-lg border ${severityColors[alert.severity] || severityColors.low}`}>
      <div className="text-sm font-medium">{alert.title}</div>
      <div className="text-xs mt-1">{alert.message}</div>
    </div>
  );
}

/**
 * 상태 행
 */
function StatusRow({ label, value, status }) {
  const statusColors = {
    good: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600'
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${statusColors[status] || statusColors.good}`}>
        {value}
      </span>
    </div>
  );
}
