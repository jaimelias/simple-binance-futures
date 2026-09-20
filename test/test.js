import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

import BinanceFutures from '../index.js'
import { CREDENTIALS } from './test-credentials.js'

export class BinanceFuturesActionsTest {
  constructor({
    amountInUSD = Number(process.env.BINANCE_TEST_AMOUNT_USD ?? 25),
    leverage = Number(process.env.BINANCE_TEST_LEVERAGE ?? 5)
  } = {}) {
    if (!Number.isFinite(amountInUSD) || amountInUSD <= 0) {
      throw new Error('BINANCE_TEST_AMOUNT_USD must be a positive number.')
    }

    if (!Number.isFinite(leverage) || leverage <= 0) {
      throw new Error('BINANCE_TEST_LEVERAGE must be a positive number.')
    }

    this.amountInUSD = amountInUSD
    this.leverage = leverage
    this.regularOrderIds = new Set()
    this.algoOrderIds = new Set()

    this.exchange = new BinanceFutures(
      CREDENTIALS,
      {
        environment: 'testnet',
        symbol: 'BTC',
        settlementCurrency: 'USDT',
        marginType: 'ISOLATED',
        useServerTime: true,
        useMarkPrice: true,
        debug: true
      },
      {
        fetch,
        crypto,
        errorLogger: message => console.error(`[Binance] ${message}`)
      }
    )
  }

  async run() {
    console.log('Starting Binance Futures action tests on BTCUSDT testnet.')

    await this.ensureNoOpenPosition()

    try {
      const prices = await this.getRecentPrices()
      const notional = this.amountInUSD * this.leverage

      await this.exchange.changeLeverage(this.leverage, notional)
      console.log(`Leverage set to ${this.exchange.leverage}x.`)

      await this.testLimitAndModifyOrders(prices.close)
      await this.testStopLimitOrder(prices.close)
      await this.testMarketAndReduceOrders()

      console.log('All src/actions tests passed.')
    } finally {
      await this.cleanup()
    }
  }

  async getRecentPrices() {
    const candles = await this.exchange.ohlcv({
      interval: '1m',
      limit: 5,
      klineType: 'markPriceKlines'
    })

    const latest = candles.at(-1)
    const prices = {
      close: latest.close,
      high: Math.max(...candles.map(candle => candle.high)),
      low: Math.min(...candles.map(candle => candle.low))
    }

    console.log('Recent BTC mark prices:', prices)
    return prices
  }

  async testLimitAndModifyOrders(recentPrice) {
    const created = await this.exchange.createLimitOrder({
      side: 'BUY',
      amountInUSD: this.amountInUSD,
      entryPrice: recentPrice * 0.97,
      handleExistingOrders: 'ADD',
      expirationInMinutes: 11,
      orders: []
    })
    this.regularOrderIds.add(created.orderId)
    console.log('createLimitOrder passed:', created.orderId)

    const openOrders = await this.exchange.getOrders()
    const createdOrder = openOrders.find(order => order.orderId === created.orderId)

    if (!createdOrder) {
      throw new Error(`Created limit order ${created.orderId} was not returned by getOrders().`)
    }

    const modified = await this.exchange.modifyLimitOrder({
      orders: [createdOrder],
      entryPrice: recentPrice * 0.96,
      side: 'BUY',
      expirationInMinutes: 11
    })
    console.log('modifyLimitOrder passed:', modified.orderId)

    await this.exchange.cancelOrder({orderId: modified.orderId})
    this.regularOrderIds.delete(modified.orderId)
  }

  async testStopLimitOrder(recentPrice) {
    const created = await this.exchange.createStopLimitOrder({
      side: 'BUY',
      amountInUSD: this.amountInUSD,
      stopPrice: recentPrice * 1.02,
      limitPrice: recentPrice * 1.021,
      handleExistingOrders: 'ADD',
      expirationInMinutes: 11,
      orders: []
    })
    this.algoOrderIds.add(created.algoId)
    console.log('createStopLimitOrder passed:', created.algoId)

    await this.exchange.cancelAlgoOrder({algoId: created.algoId})
    this.algoOrderIds.delete(created.algoId)
  }

  async testMarketAndReduceOrders() {
    const marketOrder = await this.exchange.createMarketOrder({
      side: 'BUY',
      amountInUSD: this.amountInUSD
    })
    console.log('createMarketOrder passed:', marketOrder.orderId)

    const position = await this.waitForPosition('BUY')
    const entryPrice = Number(position.entryPrice)

    const stopLoss = await this.exchange.createStopLossOrder({
      triggerPrice: entryPrice * 0.98,
      handleExistingOrders: 'REPLACE',
      positions: [position],
      orders: []
    })
    this.algoOrderIds.add(stopLoss.algoId)
    console.log('createStopLossOrder passed:', stopLoss.algoId)

    const takeProfit = await this.exchange.createTakeProfitOrder({
      triggerPrice: entryPrice * 1.02,
      handleExistingOrders: 'REPLACE',
      positions: [position],
      orders: []
    })
    this.algoOrderIds.add(takeProfit.algoId)
    console.log('createTakeProfitOrder passed:', takeProfit.algoId)

    await this.exchange.cancelAlgoOrder({algoId: stopLoss.algoId})
    this.algoOrderIds.delete(stopLoss.algoId)
    await this.exchange.cancelAlgoOrder({algoId: takeProfit.algoId})
    this.algoOrderIds.delete(takeProfit.algoId)

    const closed = await this.exchange.closePosition({
      positions: [position],
      side: 'BUY'
    })
    console.log('closePosition passed:', closed.orderId)

    await this.waitForFlatPosition()
  }

  async ensureNoOpenPosition() {
    const position = (await this.exchange.getPositions()).find(candidate => (
      candidate.symbol === this.exchange.contractName && Number(candidate.positionAmt) !== 0
    ))

    if (position) {
      throw new Error(
        `Refusing to run: ${this.exchange.contractName} already has an open position of ${position.positionAmt}.`
      )
    }
  }

  async waitForPosition(side, attempts = 20) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const positions = await this.exchange.getPositions()
      const position = positions.find(candidate => {
        if (candidate.symbol !== this.exchange.contractName) return false
        const amount = Number(candidate.positionAmt)
        return side === 'BUY' ? amount > 0 : amount < 0
      })

      if (position) return position
      await this.wait(500)
    }

    throw new Error(`Timed out waiting for a ${side} ${this.exchange.contractName} position.`)
  }

  async waitForFlatPosition(attempts = 20) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const position = (await this.exchange.getPositions()).find(candidate => (
        candidate.symbol === this.exchange.contractName && Number(candidate.positionAmt) !== 0
      ))

      if (!position) return
      await this.wait(500)
    }

    throw new Error(`Timed out waiting for ${this.exchange.contractName} to close.`)
  }

  async cleanup() {
    for (const orderId of [...this.regularOrderIds]) {
      try {
        await this.exchange.cancelOrder({orderId})
      } catch (error) {
        console.error(`Could not cancel order ${orderId}:`, error.message)
      }
    }
    this.regularOrderIds.clear()

    for (const algoId of [...this.algoOrderIds]) {
      try {
        await this.exchange.cancelAlgoOrder({algoId})
      } catch (error) {
        console.error(`Could not cancel algo order ${algoId}:`, error.message)
      }
    }
    this.algoOrderIds.clear()

    try {
      const positions = await this.exchange.getPositions()
      const position = positions.find(candidate => (
        candidate.symbol === this.exchange.contractName && Number(candidate.positionAmt) !== 0
      ))

      if (position) {
        await this.exchange.closePosition({
          positions: [position],
          side: Number(position.positionAmt) > 0 ? 'BUY' : 'SELL'
        })
      }
    } catch (error) {
      console.error('Could not close the test position during cleanup:', error.message)
    }
  }

  wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const actionTest = new BinanceFuturesActionsTest()

  actionTest.run().catch(error => {
    console.error('Action test failed:', error)
    process.exitCode = 1
  })
}
