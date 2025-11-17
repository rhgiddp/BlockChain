/**
 * KONET 거래소 서비스
 */

const express = require('express');
const cors = require('cors');
const { MatchingEngine } = require('./engine/matching-engine');

const app = express();
const PORT = process.env.PORT || 3001;

// 매칭 엔진 인스턴스
const matchingEngine = new MatchingEngine();

// 미들웨어
app.use(cors());
app.use(express.json());

// 이벤트 리스너
matchingEngine.on('trade', (trade) => {
  console.log('Trade executed:', trade);
});

matchingEngine.on('orderPlaced', (order) => {
  console.log('Order placed:', order.id);
});

matchingEngine.on('orderCancelled', (order) => {
  console.log('Order cancelled:', order.id);
});

// ==========================================
// API 라우트
// ==========================================

/**
 * 헬스 체크
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    symbols: matchingEngine.getAllSymbols()
  });
});

/**
 * 지정가 주문
 * POST /api/orders/limit
 */
app.post('/api/orders/limit', (req, res) => {
  try {
    const { symbol, userId, type, price, amount } = req.body;

    if (!symbol || !userId || !type || !price || !amount) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    let result;
    if (type === 'buy') {
      result = matchingEngine.placeLimitBuyOrder(symbol, userId, parseFloat(price), parseFloat(amount));
    } else if (type === 'sell') {
      result = matchingEngine.placeLimitSellOrder(symbol, userId, parseFloat(price), parseFloat(amount));
    } else {
      return res.status(400).json({
        error: 'Invalid order type'
      });
    }

    res.status(201).json({
      order: {
        id: result.order.id,
        symbol,
        type,
        price: result.order.price,
        amount: result.order.amount,
        remainingAmount: result.order.remainingAmount,
        status: result.order.status
      },
      trades: result.trades.map(t => ({
        id: t.id,
        price: t.price,
        amount: t.amount,
        timestamp: t.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 시장가 주문
 * POST /api/orders/market
 */
app.post('/api/orders/market', (req, res) => {
  try {
    const { symbol, userId, type, amount } = req.body;

    if (!symbol || !userId || !type || !amount) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    let result;
    if (type === 'buy') {
      result = matchingEngine.placeMarketBuyOrder(symbol, userId, parseFloat(amount));
    } else if (type === 'sell') {
      result = matchingEngine.placeMarketSellOrder(symbol, userId, parseFloat(amount));
    } else {
      return res.status(400).json({
        error: 'Invalid order type'
      });
    }

    res.status(201).json({
      order: {
        id: result.order.id,
        symbol,
        type,
        amount: result.order.amount,
        status: result.order.status
      },
      trades: result.trades
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 주문 취소
 * DELETE /api/orders/:symbol/:orderId
 */
app.delete('/api/orders/:symbol/:orderId', (req, res) => {
  try {
    const { symbol, orderId } = req.params;
    const order = matchingEngine.cancelOrder(symbol, orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    res.json({
      message: 'Order cancelled',
      order: {
        id: order.id,
        status: order.status
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 오더북 조회
 * GET /api/orderbook/:symbol
 */
app.get('/api/orderbook/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const levels = parseInt(req.query.levels) || 20;

    const depth = matchingEngine.getOrderBookDepth(symbol, levels);

    res.json({
      symbol,
      bids: depth.bids,
      asks: depth.asks
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 최근 거래 내역
 * GET /api/trades/:symbol
 */
app.get('/api/trades/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const trades = matchingEngine.getRecentTrades(symbol, limit);

    res.json({
      symbol,
      trades: trades.map(t => ({
        id: t.id,
        price: t.price,
        amount: t.amount,
        timestamp: t.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 주문 상태 조회
 * GET /api/orders/:symbol/:orderId
 */
app.get('/api/orders/:symbol/:orderId', (req, res) => {
  try {
    const { symbol, orderId } = req.params;
    const order = matchingEngine.getOrderStatus(symbol, orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    res.json({
      order: {
        id: order.id,
        type: order.type,
        price: order.price,
        amount: order.amount,
        remainingAmount: order.remainingAmount,
        status: order.status,
        timestamp: order.timestamp
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 사용자 주문 목록
 * GET /api/orders/:symbol/user/:userId
 */
app.get('/api/orders/:symbol/user/:userId', (req, res) => {
  try {
    const { symbol, userId } = req.params;
    const orders = matchingEngine.getUserOrders(symbol, userId);

    res.json({
      symbol,
      userId,
      orders: orders.map(o => ({
        id: o.id,
        type: o.type,
        price: o.price,
        amount: o.amount,
        remainingAmount: o.remainingAmount,
        status: o.status,
        timestamp: o.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 거래쌍 통계
 * GET /api/stats/:symbol
 */
app.get('/api/stats/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const stats = matchingEngine.getStats(symbol);

    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 모든 거래쌍 목록
 * GET /api/symbols
 */
app.get('/api/symbols', (req, res) => {
  try {
    const symbols = matchingEngine.getAllSymbols();

    res.json({
      symbols: symbols.map(symbol => {
        const stats = matchingEngine.getStats(symbol);
        return {
          symbol,
          lastPrice: stats.lastTradePrice,
          priceChange: stats.priceChange24h,
          volume: stats.volume24h
        };
      })
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found'
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 거래소 서비스 시작: http://localhost:${PORT}`);
  console.log(`환경: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, matchingEngine };
