import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Pages
import Dashboard from './pages/Dashboard';
import WalletPage from './pages/WalletPage';
import SendPage from './pages/SendPage';
import ReceivePage from './pages/ReceivePage';
import SwapPage from './pages/SwapPage';
import BridgePage from './pages/BridgePage';
import StakingPage from './pages/StakingPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

// Components
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';

// Hooks
import { useAuthStore } from './hooks/useAuthStore';

// Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="send" element={<SendPage />} />
            <Route path="receive" element={<ReceivePage />} />
            <Route path="swap" element={<SwapPage />} />
            <Route path="bridge" element={<BridgePage />} />
            <Route path="staking" element={<StakingPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
