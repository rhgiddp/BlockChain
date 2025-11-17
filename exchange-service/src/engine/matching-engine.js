/**
 * 매칭 엔진 (Matching Engine)
 *
 * 기능:
 * - 실시간 주문 매칭
 * - 가격-시간 우선 원칙
 * - 시장가/지정가 주문 지원
 * - 부분 체결 지원
 * - 체결 이벤트 발행
 */

const { Order, OrderBook } = require('./orderbook');
const EventEmitter = require('events');

class Trade {
  constructor(buyOrderId, sellOrderId, price, amount, symbol, timestamp = Date.now()) {
    this.id = `${buyOrderId}-${sellOrderId}-${timestamp}`;
    this.buyOrderId = buyOrderId;
    this.sellOrderId = sellOrderId;
    this.price = price;
    this.amount = amount;
    this.symbol = symbol;
    this.timestamp = timestamp;
  }
}

class MatchingEngine extends EventEmitter {
  constructor() {
    super();
    this.orderBooks = new Map(); // symbol -> OrderBook
    this.tradeHistory = []; // 최근 거래 내역
    this.maxTradeHistory = 10000;
    this.orderIdCounter = 0;
  }

  /**
   * 오더북 가져오기 (없으면 생성)
   */
  getOrderBook(symbol) {
    if (!this.orderBooks.has(symbol)) {
      this.orderBooks.set(symbol, new OrderBook(symbol));
      this.emit('orderbookCreated', symbol);
    }
    return this.orderBooks.get(symbol);
  }

  /**
   * 주문 ID 생성
   */
  generateOrderId() {
    return `ORD-${Date.now()}-${++this.orderIdCounter}`;
  }

  /**
   * 지정가 매수 주문
   */
  placeLimitBuyOrder(symbol, userId, price, amount) {
    const orderBook = this.getOrderBook(symbol);
    const order = new Order(
      this.generateOrderId(),
      userId,
      'buy',
      price,
      amount
    );

    // 매도 주문과 매칭 시도
    const trades = this.matchBuyOrder(orderBook, order);

    // 남은 수량이 있으면 오더북에 추가
    if (order.remainingAmount > 0) {
      orderBook.addBuyOrder(order);
      this.emit('orderPlaced', order);
    }

    // 거래 발생 시 이벤트 발행
    if (trades.length > 0) {
      trades.forEach(trade => {
        this.recordTrade(trade);
        this.emit('trade', trade);
      });
    }

    return {
      order,
      trades,
      status: order.status
    };
  }

  /**
   * 지정가 매도 주문
   */
  placeLimitSellOrder(symbol, userId, price, amount) {
    const orderBook = this.getOrderBook(symbol);
    const order = new Order(
      this.generateOrderId(),
      userId,
      'sell',
      price,
      amount
    );

    // 매수 주문과 매칭 시도
    const trades = this.matchSellOrder(orderBook, order);

    // 남은 수량이 있으면 오더북에 추가
    if (order.remainingAmount > 0) {
      orderBook.addSellOrder(order);
      this.emit('orderPlaced', order);
    }

    // 거래 발생 시 이벤트 발행
    if (trades.length > 0) {
      trades.forEach(trade => {
        this.recordTrade(trade);
        this.emit('trade', trade);
      });
    }

    return {
      order,
      trades,
      status: order.status
    };
  }

  /**
   * 시장가 매수 주문 (현재 최저가로 즉시 체결)
   */
  placeMarketBuyOrder(symbol, userId, amount) {
    const orderBook = this.getOrderBook(symbol);
    const bestAsk = orderBook.getBestAsk();

    if (!bestAsk) {
      throw new Error('No sell orders available');
    }

    // 최저 매도가로 주문
    return this.placeLimitBuyOrder(symbol, userId, bestAsk.price * 1.1, amount);
  }

  /**
   * 시장가 매도 주문 (현재 최고가로 즉시 체결)
   */
  placeMarketSellOrder(symbol, userId, amount) {
    const orderBook = this.getOrderBook(symbol);
    const bestBid = orderBook.getBestBid();

    if (!bestBid) {
      throw new Error('No buy orders available');
    }

    // 최고 매수가로 주문
    return this.placeLimitSellOrder(symbol, userId, bestBid.price * 0.9, amount);
  }

  /**
   * 매수 주문 매칭
   */
  matchBuyOrder(orderBook, buyOrder) {
    const trades = [];

    while (buyOrder.remainingAmount > 0) {
      const bestAsk = orderBook.getBestAsk();

      // 매칭 가능한 매도 주문이 없거나 가격이 맞지 않으면 종료
      if (!bestAsk || bestAsk.price > buyOrder.price) {
        break;
      }

      const sellOrder = bestAsk.getFirstOrder();
      if (!sellOrder) break;

      // 체결 수량 결정
      const tradeAmount = Math.min(
        buyOrder.remainingAmount,
        sellOrder.remainingAmount
      );

      // 체결 가격은 오더북에 먼저 있던 주문의 가격 (Maker 가격)
      const tradePrice = sellOrder.price;

      // 거래 생성
      const trade = new Trade(
        buyOrder.id,
        sellOrder.id,
        tradePrice,
        tradeAmount,
        orderBook.symbol
      );
      trades.push(trade);

      // 주문 업데이트
      buyOrder.fill(tradeAmount);
      sellOrder.fill(tradeAmount);

      // 오더북 업데이트
      orderBook.updateAfterTrade(sellOrder.id, tradeAmount, tradePrice);
    }

    return trades;
  }

  /**
   * 매도 주문 매칭
   */
  matchSellOrder(orderBook, sellOrder) {
    const trades = [];

    while (sellOrder.remainingAmount > 0) {
      const bestBid = orderBook.getBestBid();

      // 매칭 가능한 매수 주문이 없거나 가격이 맞지 않으면 종료
      if (!bestBid || bestBid.price < sellOrder.price) {
        break;
      }

      const buyOrder = bestBid.getFirstOrder();
      if (!buyOrder) break;

      // 체결 수량 결정
      const tradeAmount = Math.min(
        sellOrder.remainingAmount,
        buyOrder.remainingAmount
      );

      // 체결 가격은 오더북에 먼저 있던 주문의 가격 (Maker 가격)
      const tradePrice = buyOrder.price;

      // 거래 생성
      const trade = new Trade(
        buyOrder.id,
        sellOrder.id,
        tradePrice,
        tradeAmount,
        orderBook.symbol
      );
      trades.push(trade);

      // 주문 업데이트
      sellOrder.fill(tradeAmount);
      buyOrder.fill(tradeAmount);

      // 오더북 업데이트
      orderBook.updateAfterTrade(buyOrder.id, tradeAmount, tradePrice);
    }

    return trades;
  }

  /**
   * 주문 취소
   */
  cancelOrder(symbol, orderId) {
    const orderBook = this.getOrderBook(symbol);
    const order = orderBook.cancelOrder(orderId);

    if (order) {
      this.emit('orderCancelled', order);
    }

    return order;
  }

  /**
   * 거래 기록 저장
   */
  recordTrade(trade) {
    this.tradeHistory.unshift(trade);

    // 최대 개수 제한
    if (this.tradeHistory.length > this.maxTradeHistory) {
      this.tradeHistory = this.tradeHistory.slice(0, this.maxTradeHistory);
    }
  }

  /**
   * 최근 거래 내역
   */
  getRecentTrades(symbol, limit = 100) {
    return this.tradeHistory
      .filter(trade => trade.symbol === symbol)
      .slice(0, limit);
  }

  /**
   * 오더북 조회
   */
  getOrderBookDepth(symbol, levels = 20) {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.getDepth(levels);
  }

  /**
   * 주문 상태 조회
   */
  getOrderStatus(symbol, orderId) {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.getOrder(orderId);
  }

  /**
   * 사용자 주문 목록
   */
  getUserOrders(symbol, userId) {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.getUserOrders(userId);
  }

  /**
   * 통계 정보
   */
  getStats(symbol) {
    const orderBook = this.getOrderBook(symbol);
    const recentTrades = this.getRecentTrades(symbol, 100);

    const stats = orderBook.getStats();

    // 24시간 거래량 계산 (간단한 구현)
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const trades24h = recentTrades.filter(t => t.timestamp > last24h);
    const volume24h = trades24h.reduce((sum, t) => sum + (t.amount * t.price), 0);
    const tradeCount24h = trades24h.length;

    // 가격 변동
    const priceChange = trades24h.length > 0
      ? ((stats.lastTradePrice - trades24h[trades24h.length - 1].price) /
         trades24h[trades24h.length - 1].price) * 100
      : 0;

    return {
      ...stats,
      volume24h,
      tradeCount24h,
      priceChange24h: priceChange,
      highPrice24h: Math.max(...trades24h.map(t => t.price), 0),
      lowPrice24h: Math.min(...trades24h.map(t => t.price), Infinity)
    };
  }

  /**
   * 모든 거래쌍 목록
   */
  getAllSymbols() {
    return Array.from(this.orderBooks.keys());
  }
}

module.exports = { MatchingEngine, Trade };
