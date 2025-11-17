import React from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ArrowUpRight, ArrowDownLeft, Repeat, Bridge, TrendingUp, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { walletAPI } from '../services/api';

/**
 * 대시보드 페이지
 */
export default function Dashboard() {
  // 잔액 조회
  const { data: balances, isLoading } = useQuery({
    queryKey: ['balances'],
    queryFn: walletAPI.getBalances,
  });

  // 최근 거래 조회
  const { data: transactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: walletAPI.getTransactions,
  });

  // 총 잔액 계산
  const totalBalance = balances?.reduce((sum, b) => sum + parseFloat(b.balance), 0) || 0;
  const totalValueUSD = totalBalance * 1.0; // 간단히 $1로 가정

  return (
    <div className="space-y-6">
      {/* 총 잔액 */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
        <div className="text-sm font-medium opacity-90">총 자산 가치</div>
        <div className="text-5xl font-bold mt-2">
          {isLoading ? (
            <div className="animate-pulse bg-white/20 h-12 w-48 rounded" />
          ) : (
            `$${totalValueUSD.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}`
          )}
        </div>
        <div className="text-sm mt-2 opacity-80">
          {totalBalance.toLocaleString()} KONET
        </div>

        {/* 빠른 액션 */}
        <div className="grid grid-cols-4 gap-3 mt-6">
          <QuickAction to="/send" icon={<ArrowUpRight />} label="보내기" />
          <QuickAction to="/receive" icon={<ArrowDownLeft />} label="받기" />
          <QuickAction to="/swap" icon={<Repeat />} label="스왑" />
          <QuickAction to="/bridge" icon={<Bridge />} label="브릿지" />
        </div>
      </div>

      {/* 토큰 목록 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">내 토큰</h2>
          <Link to="/wallet" className="text-blue-600 text-sm hover:underline">
            전체 보기 →
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="space-y-2">
                    <div className="w-20 h-4 bg-gray-200 rounded" />
                    <div className="w-16 h-3 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="w-24 h-4 bg-gray-200 rounded ml-auto" />
                  <div className="w-16 h-3 bg-gray-200 rounded ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {balances?.map((token, index) => (
              <TokenRow key={index} token={token} />
            ))}
          </div>
        )}
      </div>

      {/* 최근 거래 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">최근 거래</h2>
          <Link to="/wallet" className="text-blue-600 text-sm hover:underline">
            전체 보기 →
          </Link>
        </div>

        <div className="space-y-2">
          {transactions?.slice(0, 5).map((tx, index) => (
            <TransactionRow key={index} transaction={tx} />
          ))}
        </div>

        {(!transactions || transactions.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            거래 내역이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 빠른 액션 버튼
 */
function QuickAction({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center p-4 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
    >
      <div className="w-8 h-8 mb-2">{icon}</div>
      <div className="text-xs font-medium">{label}</div>
    </Link>
  );
}

/**
 * 토큰 행
 */
function TokenRow({ token }) {
  const priceUSD = 1.0; // 간단히 $1로 가정
  const valueUSD = parseFloat(token.balance) * priceUSD;

  return (
    <div className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
          {token.token?.[0] || 'K'}
        </div>
        <div>
          <div className="font-semibold">{token.token || 'KONET'}</div>
          <div className="text-sm text-gray-500">{token.balance} tokens</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold">${valueUSD.toFixed(2)}</div>
        <div className="text-sm text-green-600">+0.0%</div>
      </div>
    </div>
  );
}

/**
 * 거래 행
 */
function TransactionRow({ transaction }) {
  const isReceive = transaction.type === 'receive';

  return (
    <div className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isReceive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
        }`}>
          {isReceive ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
        </div>
        <div>
          <div className="font-semibold">
            {isReceive ? '받기' : '보내기'}
          </div>
          <div className="text-sm text-gray-500">
            {transaction.tx_hash?.slice(0, 10)}...{transaction.tx_hash?.slice(-8)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`font-semibold ${isReceive ? 'text-green-600' : 'text-red-600'}`}>
          {isReceive ? '+' : '-'}{transaction.amount} {transaction.token_symbol}
        </div>
        <div className="text-sm text-gray-500">
          {transaction.status === 'confirmed' ? '완료' : '대기 중'}
        </div>
      </div>
    </div>
  );
}
