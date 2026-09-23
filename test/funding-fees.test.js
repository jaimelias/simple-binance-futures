import assert from 'node:assert/strict'
import test from 'node:test'

import BinanceFutures from '../index.js'
import {
  applyFundingSide,
  checkFundingRisk,
  normalizeFundingFeePolicy
} from '../src/utilities/fundingFees.js'
import {validateFundingFeePolicy} from '../src/utilities/validators.js'
import {createExchange, contractInfo, jsonResponse} from './helpers.js'

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
  assert.equal(BinanceFutures.evaluateFundingRisk(eightHourState, policy).allowed, true)
  assert.equal(BinanceFutures.evaluateFundingRisk(oneHourState, policy).allowed, false)
})

test('favorable and zero funding do not block an entry', () => {
  const policy = normalizeFundingFeePolicy({
    enabled: true,
    maxFundingRatePerHour: 0
  })
  const shortState = applyFundingSide(baseFundingState({rate: 0.0005}), {side: 'SELL'})
  const zeroState = applyFundingSide(baseFundingState({rate: 0}), {side: 'BUY'})

  assert.equal(BinanceFutures.evaluateFundingRisk(shortState, policy).allowed, true)
  assert.equal(BinanceFutures.evaluateFundingRisk(zeroState, policy).allowed, true)
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
  const decision = BinanceFutures.evaluateFundingRisk(state, policy)

  assert.deepEqual(decision.blockingReasons, [
    'MAX_FUNDING_RATE_PER_SETTLEMENT_EXCEEDED',
    'FUNDING_SETTLEMENT_WINDOW'
  ])
})

test('enabled policies require a non-negative hourly maximum', () => {
  assert.throws(
    () => validateFundingFeePolicy({enabled: true, expectedIntervalHours: 8}),
    /maxFundingRatePerHour/
  )
  assert.throws(
    () => validateFundingFeePolicy({enabled: true, maxFundingRatePerHour: -0.1}),
    /maxFundingRatePerHour/
  )
})

test('static funding state reports interval changes and estimated fees without authentication', async t => {
  const bodies = {
    '/fapi/v1/premiumIndex': {
      symbol: 'BTCUSDT', markPrice: '100000', lastFundingRate: '0.0002',
      nextFundingTime: 2000000, time: 1000000
    },
    '/fapi/v1/fundingInfo': [{symbol: 'BTCUSDT', fundingIntervalHours: 1}]
  }
  const fetch = t.mock.method(globalThis, 'fetch', async url => jsonResponse(bodies[new URL(url).pathname]))
  const state = await BinanceFutures.getFundingState('BTCUSDT', {side: 'BUY', quantity: 0.01})
  assert.equal(state.actualIntervalHours, 1)
  assert.equal(state.intervalChanged, true)
  assert.equal(state.fundingRatePerHour, 0.0002)
  assert.equal(state.estimatedFundingFee, 0.2)
  assert.deepEqual(fetch.mock.calls.map(({arguments: [url, options]}) => {
    assert.deepEqual(options.headers, {})
    return Object.fromEntries(new URL(url).searchParams)
  }), [{symbol: 'BTCUSDT'}, {}])
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

test('entry methods enforce funding protection before submitting an order', async t => {
  const exchange = createExchange({strategy: {contractInfo}})
  exchange.latestPrice = 100
  exchange.leverage = 1
  const guard = t.mock.method(exchange, 'assertFundingEntryAllowed', async () => {
    throw new Error('funding blocked')
  })
  const fetch = t.mock.method(exchange, 'fetch', async () => ({orderId: 1, algoId: 1}))
  const order = {symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', orderId: 1,
    origQty: '1', executedQty: '0', price: '90'}
  for (const [method, params] of [
    ['createMarketOrder', {amountInUSD: 10}],
    ['createLimitOrder', {amountInUSD: 10, entryPrice: 90, orders: []}],
    ['createStopLimitOrder', {amountInUSD: 10, stopPrice: 110, limitPrice: 111, orders: []}],
    ['modifyLimitOrder', {entryPrice: 80, orders: [order]}]
  ]) {
    await assert.rejects(exchange[method]({side: 'BUY', ...params}), /funding blocked/)
  }
  assert.equal(guard.mock.callCount(), 4)
  assert.equal(fetch.mock.callCount(), 0)
})
