import axios from 'axios';

const ADMIN_API_BASE_URL = process.env.REACT_APP_ADMIN_API_BASE_URL || 'http://localhost:3004/api/admin';

/**
 * Axios 인스턴스
 */
const adminClient = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
adminClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
adminClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

/**
 * 대시보드 API
 */
export const adminAPI = {
  // 대시보드 통계
  getDashboardStats: () => adminClient.get('/dashboard/stats'),

  getActivity: (params) => adminClient.get('/dashboard/activity', { params }),

  getAlerts: (params) => adminClient.get('/dashboard/alerts', { params }),

  resolveAlert: (alertId) => adminClient.post(`/dashboard/alerts/${alertId}/resolve`),

  getChartData: (type, params) => adminClient.get(`/dashboard/charts/${type}`, { params }),

  // 사용자 관리
  getUsers: (params) => adminClient.get('/users', { params }),

  getUserDetails: (userId) => adminClient.get(`/users/${userId}`),

  updateUserStatus: (userId, is_active) =>
    adminClient.patch(`/users/${userId}/status`, { is_active }),

  createSanction: (userId, data) =>
    adminClient.post(`/users/${userId}/sanction`, data),

  liftSanction: (userId, sanctionId) =>
    adminClient.post(`/users/${userId}/sanctions/${sanctionId}/lift`),

  deleteUser: (userId, confirm) =>
    adminClient.delete(`/users/${userId}`, { data: { confirm } }),

  // KYC 관리
  getKYCApplications: (params) => adminClient.get('/kyc', { params }),

  approveKYC: (userId, level) =>
    adminClient.post(`/kyc/${userId}/approve`, { level }),

  rejectKYC: (userId, reason) =>
    adminClient.post(`/kyc/${userId}/reject`, { reason }),
};

export default adminClient;
