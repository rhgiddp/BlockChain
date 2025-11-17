import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000/api';

/**
 * Axios 인스턴스
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor (토큰 추가)
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (에러 처리)
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // 토큰 만료
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * 인증 API
 */
export const authAPI = {
  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),

  register: (email, password, username) =>
    apiClient.post('/auth/register', { email, password, username }),

  logout: () =>
    apiClient.post('/auth/logout'),

  me: () =>
    apiClient.get('/auth/me'),

  refresh: (refreshToken) =>
    apiClient.post('/auth/refresh', { refreshToken }),
};

/**
 * 지갑 API
 */
export const walletAPI = {
  createWallet: (walletType, label) =>
    apiClient.post('/wallet/create', { wallet_type: walletType, label }),

  getWallets: () =>
    apiClient.get('/wallet'),

  getWallet: (address) =>
    apiClient.get(`/wallet/${address}`),

  exportPrivateKey: (address, password) =>
    apiClient.post(`/wallet/${address}/export`, { password }),

  deleteWallet: (address) =>
    apiClient.delete(`/wallet/${address}`),

  getBalances: () =>
    apiClient.get('/balance/user/summary'),

  getBalance: (address) =>
    apiClient.get(`/balance/${address}`),

  refreshBalance: (address) =>
    apiClient.post(`/balance/${address}/refresh`),
};

/**
 * 거래 API
 */
export const transactionAPI = {
  send: (fromAddress, toAddress, amount, tokenSymbol, memo) =>
    apiClient.post('/transactions/send', {
      from_address: fromAddress,
      to_address: toAddress,
      amount,
      token_symbol: tokenSymbol,
      memo,
    }),

  getTransactions: (address, page = 1, limit = 20) =>
    apiClient.get(`/transactions/${address}`, { params: { page, limit } }),

  getTransactionStatus: (txHash) =>
    apiClient.get(`/transactions/${txHash}/status`),

  cancelTransaction: (txHash) =>
    apiClient.post(`/transactions/${txHash}/cancel`),
};

/**
 * 거래소 API
 */
export const exchangeAPI = {
  placeOrder: (symbol, type, side, price, amount) =>
    apiClient.post('/exchange/orders/limit', {
      symbol,
      userId: 'current-user',
      type: side,
      price,
      amount,
    }),

  placeMarketOrder: (symbol, side, amount) =>
    apiClient.post('/exchange/orders/market', {
      symbol,
      userId: 'current-user',
      type: side,
      amount,
    }),

  cancelOrder: (symbol, orderId) =>
    apiClient.delete(`/exchange/orders/${symbol}/${orderId}`),

  getOrderBook: (symbol, levels = 20) =>
    apiClient.get(`/exchange/orderbook/${symbol}`, { params: { levels } }),

  getTrades: (symbol, limit = 100) =>
    apiClient.get(`/exchange/trades/${symbol}`, { params: { limit } }),

  getStats: (symbol) =>
    apiClient.get(`/exchange/stats/${symbol}`),
};

/**
 * 브릿지 API
 */
export const bridgeAPI = {
  deposit: (token, amount, targetChain) =>
    apiClient.post('/bridge/deposit', { token, amount, targetChain }),

  getTransaction: (txId) =>
    apiClient.get(`/bridge/transaction/${txId}`),

  getStats: () =>
    apiClient.get('/bridge/stats'),

  getChains: () =>
    apiClient.get('/bridge/chains'),
};

export default apiClient;
