import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import BinanceFutures from '../index.js'
import {createLimitOrder} from '../src/actions/createLimitOrder.js'
import {createMarketOrder} from '../src/actions/createMarketOrder.js'
import {createStopLimitOrder} from '../src/actions/createStopLimitOrder.js'
import {modifyLimitOrder} from '../src/actions/modifyLimitOrder.js'
import {
  applyFundingSide,
  checkFundingRisk,
  evaluateFundingRisk,
  normalizeFundingFeePolicy
} from '../src/utilities/fundingFees.js'
import {validateStrategy} from '../src/utilities/validators.js'

const strategy = fundingFeePolicy => ({
  environment: 'testnet',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  ...(fundingFeePolicy ? {fundingFeePolicy} : {})
})

const credentials = {
  testnet: {
    API_KEY: 'test-key',
    API_SECRET: 'test-secret'
  }
}

const jsonResponse = body => ({
  status: 200,
  statusText: 'OK',
  text: async () => JSON.stringify(body)
})

const baseFundingState = ({rate = 0.0005, intervalHours = 8, msToFunding = 3600000} = {}) => ({
  symbol: 'BTCUSDT',
  fundingRate: rate,
  markPrice: 100000,
  nextFundingTime: 1000000 + msToFunding,
  observedAt: 1000000,
  msToFunding,
  expectedIntervalHours: 8,
  actualIntervalHours: intervalHours,
  intervalChanged: intervalHours !== 8,
  adjustedFundingCap: null,
  adjustedFundingFloor: null
})

test('funding rates are normalized per actual funding interval', () => {
  const policy = normalizeFundingFeePolicy({
    enabled: true,
    maxFundingRatePerHour: 0.0000625
  })
  const eightHourState = applyFundingSide(baseFundingState(), {side: 'BUY', positionNotional: 1000})
  const oneHourState = applyFundingSide(
    baseFundingState({rate: 0.0002, intervalHours: 1}),
    {side: 'BUY', positionNotional: 1000}
  )

  assert.equal(eightHourState.fundingRatePerHour, 0.0000625)
  assert.equal(eightHourState.estimatedFundingFee, 0.5)
  assert.equal(evaluateFundingRisk(eightHourState, policy).allowed, true)
  assert.equal(evaluateFundingRisk(oneHourState, policy).allowed, false)
})

test('favorable and zero funding do not block an entry', () => {
  const policy = normalizeFundingFeePolicy({
    enabled: true,
    maxFundingRatePerHour: 0
  })
  const shortState = applyFundingSide(baseFundingState({rate: 0.0005}), {side: 'SELL'})
  const zeroState = applyFundingSide(baseFundingState({rate: 0}), {side: 'BUY'})

  assert.equal(evaluateFundingRisk(shortState, policy).allowed, true)
  assert.equal(evaluateFundingRisk(zeroState, policy).allowed, true)
})

test('settlement cap and pre-funding blackout independently block entries', () => {
  const policy = normalizeFundingFeePolicy({
    enabled: true,
    maxFundingRatePerHour: 1,
    maxFundingRatePerSettlement: 0.0004,
    entryBlackoutMinutes: 2
  })
  const state = applyFundingSide(
    baseFundingState({rate: 0.0005, msToFunding: 60000}),
    {side: 'BUY'}
  )
  const decision = evaluateFundingRisk(state, policy)

  assert.deepEqual(decision.blockingReasons, [
    'MAX_FUNDING_RATE_PER_SETTLEMENT_EXCEEDED',
    'FUNDING_SETTLEMENT_WINDOW'
  ])
})

test('enabled policies require a non-negative hourly maximum', () => {
  assert.throws(
    () => validateStrategy(strategy({enabled: true, expectedIntervalHours: 8})),
    /maxFundingRatePerHour/
  )
  assert.throws(
    () => validateStrategy(strategy({enabled: true, maxFundingRatePerHour: -0.1})),
    /maxFundingRatePerHour/
  )
})

test('funding state uses public endpoints and detects Binance interval changes', async () => {
  const requestedUrls = []
  const exchange = new BinanceFutures(
    credentials,
    strategy({
      enabled: true,
      expectedIntervalHours: 8,
      maxFundingRatePerHour: 0.001
    }),
    {
      crypto,
      fetch: async url => {
        requestedUrls.push(url)

        if (url.includes('/premiumIndex')) {
          return jsonResponse({
            symbol: 'BTCUSDT',
            markPrice: '100000',
            lastFundingRate: '0.0002',
            nextFundingTime: 2000000,
            time: 1000000
          })
        }

        return jsonResponse([{
          symbol: 'BTCUSDT',
          adjustedFundingRateCap: '0.01',
          adjustedFundingRateFloor: '-0.01',
          fundingIntervalHours: 1
        }])
      }
    }
  )

  const state = await exchange.getFundingState({side: 'BUY', quantity: 0.01})

  assert.equal(state.actualIntervalHours, 1)
  assert.equal(state.intervalChanged, true)
  assert.equal(state.fundingRatePerHour, 0.0002)
  assert.equal(state.estimatedFundingFee, 0.2)
  assert.equal(requestedUrls.length, 2)
  assert.ok(requestedUrls.every(url => !url.includes('timestamp=')))
  assert.ok(requestedUrls.every(url => !url.includes('signature=')))
  assert.match(requestedUrls.find(url => url.includes('/premiumIndex')), /symbol=BTCUSDT/)
  assert.doesNotMatch(requestedUrls.find(url => url.includes('/fundingInfo')), /symbol=/)
})

test('checkFundingRisk cancels risky entries, preserves reduce orders, and alerts on positions', async () => {
  const canceledOrders = []
  const alerts = []
  const main = {
    contractName: 'BTCUSDT',
    fundingFeePolicy: normalizeFundingFeePolicy({
      enabled: true,
      expectedIntervalHours: 8,
      maxFundingRatePerHour: 0.00005,
      entryBlackoutMinutes: 0,
      pendingOrderAction: 'CANCEL',
      openPositionAction: 'ALERT'
    }),
    callbacks: {
      fundingRiskAlert: event => alerts.push(event)
    },
    debug: false,
    fetch: async endpoint => endpoint === 'premiumIndex'
      ? {
          symbol: 'BTCUSDT',
          markPrice: '100000',
          lastFundingRate: '0.0005',
          nextFundingTime: 5000000,
          time: 1000000
        }
      : [],
    cancelOrder: async ({orderId}) => {
      canceledOrders.push(orderId)
      return {orderId}
    }
  }
  const entryOrder = {
    symbol: 'BTCUSDT',
    orderId: 10,
    side: 'BUY',
    origQty: '0.01',
    executedQty: '0',
    reduceOnly: false,
    closePosition: false
  }
  const reduceOrder = {
    symbol: 'BTCUSDT',
    orderId: 11,
    side: 'SELL',
    origQty: '0.01',
    executedQty: '0',
    reduceOnly: true,
    closePosition: false
  }
  const position = {symbol: 'BTCUSDT', positionAmt: '0.01'}

  const result = await checkFundingRisk({
    main,
    orders: [entryOrder, reduceOrder],
    algoOrders: [],
    positions: [position]
  })

  assert.deepEqual(canceledOrders, [10])
  assert.equal(result.pendingOrders.length, 1)
  assert.equal(result.openPositions.length, 1)
  assert.deepEqual(result.actions.map(action => action.type), [
    'PENDING_ORDER_CANCELED',
    'POSITION_ALERTED'
  ])
  assert.equal(alerts.length, 2)
})

test('createMarketOrder is exposed on the BinanceFutures class', () => {
  assert.equal(typeof BinanceFutures.prototype.createMarketOrder, 'function')
})

test('all entry actions enforce the funding guard before exchange submission', async () => {
  const guardedCalls = []
  let exchangeSubmissions = 0
  const fundingError = new Error('funding blocked')
  const main = {
    contractName: 'BTCUSDT',
    latestPrice: 100,
    leverage: 1,
    workingType: 'MARK_PRICE',
    useServerTime: false,
    debug: false,
    getContractInfo: async () => ({
      pricePrecision: 2,
      quantityPrecision: 3,
      filters: [
        {filterType: 'PRICE_FILTER', tickSize: '0.01'},
        {filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.001'},
        {filterType: 'MIN_NOTIONAL', notional: '1'}
      ]
    }),
    assertFundingEntryAllowed: async params => {
      guardedCalls.push(params)
      throw fundingError
    },
    fetch: async () => {
      exchangeSubmissions++
      return {orderId: 1, algoId: 1}
    }
  }

  await assert.rejects(
    createMarketOrder({main, side: 'BUY', amountInUSD: 10}),
    /funding blocked/
  )
  await assert.rejects(
    createLimitOrder({
      main,
      side: 'BUY',
      amountInUSD: 10,
      entryPrice: 90,
      handleExistingOrders: 'ADD',
      orders: [],
      ignoreImmediateExecErr: false
    }),
    /funding blocked/
  )
  await assert.rejects(
    createStopLimitOrder({
      main,
      side: 'BUY',
      amountInUSD: 10,
      stopPrice: 110,
      limitPrice: 111,
      handleExistingOrders: 'ADD',
      orders: []
    }),
    /funding blocked/
  )
  await assert.rejects(
    modifyLimitOrder({
      main,
      side: 'BUY',
      entryPrice: 80,
      orders: [{
        symbol: 'BTCUSDT',
        type: 'LIMIT',
        side: 'BUY',
        orderId: 1,
        origQty: '1',
        executedQty: '0',
        price: '90'
      }]
    }),
    /funding blocked/
  )

  assert.equal(guardedCalls.length, 4)
  assert.equal(exchangeSubmissions, 0)
})
