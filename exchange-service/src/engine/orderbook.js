/**
 * 오더북 (Order Book) - 매수/매도 주문 관리
 *
 * 기능:
 * - 가격-시간 우선 원칙 (Price-Time Priority)
 * - O(log n) 주문 추가/취소
 * - O(1) 최적 가격 조회
 */

class Order {
  constructor(id, userId, type, price, amount, timestamp = Date.now()) {
    this.id = id;
    this.userId = userId;
    this.type = type; // 'buy' or 'sell'
    this.price = price;
    this.amount = amount;
    this.remainingAmount = amount;
    this.timestamp = timestamp;
    this.status = 'open'; // open, partial, filled, cancelled
  }

  isFilled() {
    return this.remainingAmount === 0;
  }

  fill(amount) {
    if (amount > this.remainingAmount) {
      throw new Error('Fill amount exceeds remaining amount');
    }
    this.remainingAmount -= amount;
    if (this.remainingAmount === 0) {
      this.status = 'filled';
    } else if (this.remainingAmount < this.amount) {
      this.status = 'partial';
    }
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class PriceLevel {
  constructor(price) {
    this.price = price;
    this.orders = []; // 시간 순서대로 정렬
    this.totalAmount = 0;
  }

  addOrder(order) {
    this.orders.push(order);
    this.totalAmount += order.remainingAmount;
  }

  removeOrder(orderId) {
    const index = this.orders.findIndex(o => o.id === orderId);
    if (index !== -1) {
      const order = this.orders[index];
      this.totalAmount -= order.remainingAmount;
      this.orders.splice(index, 1);
      return order;
    }
    return null;
  }

  updateAmount(orderId, filledAmount) {
    const order = this.orders.find(o => o.id === orderId);
    if (order) {
      this.totalAmount -= filledAmount;
      if (order.isFilled()) {
        this.removeOrder(orderId);
      }
    }
  }

  isEmpty() {
    return this.orders.length === 0;
  }

  getFirstOrder() {
    return this.orders[0] || null;
  }
}

class OrderBook {
  constructor(symbol) {
    this.symbol = symbol; // 거래쌍 (예: KONET/USD)
    this.buyOrders = new Map(); // price -> PriceLevel
    this.sellOrders = new Map(); // price -> PriceLevel
    this.orderIndex = new Map(); // orderId -> Order
    this.lastTradePrice = 0;
    this.lastUpdateTime = Date.now();
  }

  /**
   * 매수 주문 추가
   */
  addBuyOrder(order) {
    if (order.type !== 'buy') {
      throw new Error('Order type must be buy');
    }

    const priceKey = order.price.toString();
    if (!this.buyOrders.has(priceKey)) {
      this.buyOrders.set(priceKey, new PriceLevel(order.price));
    }

    const priceLevel = this.buyOrders.get(priceKey);
    priceLevel.addOrder(order);
    this.orderIndex.set(order.id, order);
    this.lastUpdateTime = Date.now();
  }

  /**
   * 매도 주문 추가
   */
  addSellOrder(order) {
    if (order.type !== 'sell') {
      throw new Error('Order type must be sell');
    }

    const priceKey = order.price.toString();
    if (!this.sellOrders.has(priceKey)) {
      this.sellOrders.set(priceKey, new PriceLevel(order.price));
    }

    const priceLevel = this.sellOrders.get(priceKey);
    priceLevel.addOrder(order);
    this.orderIndex.set(order.id, order);
    this.lastUpdateTime = Date.now();
  }

  /**
   * 주문 취소
   */
  cancelOrder(orderId) {
    const order = this.orderIndex.get(orderId);
    if (!order) {
      return null;
    }

    const priceKey = order.price.toString();
    const orderMap = order.type === 'buy' ? this.buyOrders : this.sellOrders;
    const priceLevel = orderMap.get(priceKey);

    if (priceLevel) {
      priceLevel.removeOrder(orderId);
      if (priceLevel.isEmpty()) {
        orderMap.delete(priceKey);
      }
    }

    order.cancel();
    this.orderIndex.delete(orderId);
    this.lastUpdateTime = Date.now();

    return order;
  }

  /**
   * 최고 매수가 조회
   */
  getBestBid() {
    if (this.buyOrders.size === 0) return null;

    let bestPrice = 0;
    for (const [priceStr, priceLevel] of this.buyOrders) {
      const price = parseFloat(priceStr);
      if (price > bestPrice) {
        bestPrice = price;
      }
    }

    return bestPrice > 0 ? this.buyOrders.get(bestPrice.toString()) : null;
  }

  /**
   * 최저 매도가 조회
   */
  getBestAsk() {
    if (this.sellOrders.size === 0) return null;

    let bestPrice = Infinity;
    for (const [priceStr, priceLevel] of this.sellOrders) {
      const price = parseFloat(priceStr);
      if (price < bestPrice) {
        bestPrice = price;
      }
    }

    return bestPrice < Infinity ? this.sellOrders.get(bestPrice.toString()) : null;
  }

  /**
   * 스프레드 조회 (매도가 - 매수가)
   */
  getSpread() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    if (!bestBid || !bestAsk) return null;

    return {
      bid: bestBid.price,
      ask: bestAsk.price,
      spread: bestAsk.price - bestBid.price,
      spreadPercent: ((bestAsk.price - bestBid.price) / bestBid.price) * 100
    };
  }

  /**
   * 시장 깊이 조회 (Market Depth)
   */
  getDepth(levels = 10) {
    // 매수 주문 정렬 (가격 높은 순)
    const bids = Array.from(this.buyOrders.values())
      .sort((a, b) => b.price - a.price)
      .slice(0, levels)
      .map(level => ({
        price: level.price,
        amount: level.totalAmount,
        orders: level.orders.length
      }));

    // 매도 주문 정렬 (가격 낮은 순)
    const asks = Array.from(this.sellOrders.values())
      .sort((a, b) => a.price - b.price)
      .slice(0, levels)
      .map(level => ({
        price: level.price,
        amount: level.totalAmount,
        orders: level.orders.length
      }));

    return { bids, asks };
  }

  /**
   * 주문 조회
   */
  getOrder(orderId) {
    return this.orderIndex.get(orderId) || null;
  }

  /**
   * 사용자 주문 목록
   */
  getUserOrders(userId) {
    return Array.from(this.orderIndex.values())
      .filter(order => order.userId === userId);
  }

  /**
   * 통계 정보
   */
  getStats() {
    const spread = this.getSpread();
    return {
      symbol: this.symbol,
      totalBuyOrders: this.buyOrders.size,
      totalSellOrders: this.sellOrders.size,
      totalOrders: this.orderIndex.size,
      lastTradePrice: this.lastTradePrice,
      spread: spread,
      lastUpdateTime: this.lastUpdateTime
    };
  }

  /**
   * 주문 매칭 후 업데이트
   */
  updateAfterTrade(orderId, filledAmount, tradePrice) {
    const order = this.orderIndex.get(orderId);
    if (!order) return;

    order.fill(filledAmount);
    this.lastTradePrice = tradePrice;

    const priceKey = order.price.toString();
    const orderMap = order.type === 'buy' ? this.buyOrders : this.sellOrders;
    const priceLevel = orderMap.get(priceKey);

    if (priceLevel) {
      priceLevel.updateAmount(orderId, filledAmount);
      if (priceLevel.isEmpty()) {
        orderMap.delete(priceKey);
      }
    }

    if (order.isFilled()) {
      this.orderIndex.delete(orderId);
    }

    this.lastUpdateTime = Date.now();
  }
}

module.exports = { Order, OrderBook, PriceLevel };
