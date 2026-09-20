import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import { createMarketOrder } from '../src/actions/createMarketOrder.js'
import { createLimitOrder } from '../src/actions/createLimitOrder.js'
import { createStopLimitOrder } from '../src/actions/createStopLimitOrder.js'
import { getOrderExpirationParams } from '../src/utilities/utilities.js'
import {
  assertNonNegativeFiniteNumber,
  assertPositiveFiniteNumber,
  isValidContractInfo,
  isValidLeverageBracket,
  validateCallbacks,
  validateCredentials,
  validateExpirationInMinutes,
  validateStrategy
} from '../src/utilities/validators.js'

const contractInfo = {
  symbol: 'BTCUSDT',
  pricePrecision: 2,
  quantityPrecision: 3,
  filters: [
    {filterType: 'PRICE_FILTER', tickSize: '0.10'},
    {filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.001'},
    {filterType: 'MIN_NOTIONAL', notional: '5'}
  ]
}

const leverageBracket = {
  symbol: 'BTCUSDT',
  notionalCoef: 1,
  brackets: [{notionalFloor: 0, notionalCap: 50000, initialLeverage: 20}]
}

const strategy = overrides => ({
  environment: 'testnet',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  ...overrides
})

test('numeric validators reject NaN, Infinity, and invalid signs', () => {
  for(const value of [NaN, Infinity, -Infinity, 0, -1]) {
    assert.throws(() => assertPositiveFiniteNumber(value, 'value'), /finite number greater than 0/)
  }

  for(const value of [NaN, Infinity, -Infinity, -1]) {
    assert.throws(() => assertNonNegativeFiniteNumber(value, 'value'), /finite, non-negative number/)
  }

  assert.equal(assertPositiveFiniteNumber(1, 'value'), 1)
  assert.equal(assertNonNegativeFiniteNumber(0, 'value'), 0)
})

test('credentials and callbacks require usable nested values', () => {
  assert.throws(() => validateCredentials({testnet: null}, 'testnet'), /Invalid credentials/)
  assert.throws(
    () => validateCredentials({testnet: {API_KEY: '', API_SECRET: 'secret'}}, 'testnet'),
    /API_KEY/
  )
  assert.throws(() => validateCallbacks(null, 'node'), /callbacks/)
  assert.throws(() => validateCallbacks({fetch: {}, crypto}, 'node'), /callbacks.fetch/)
  assert.throws(
    () => validateCallbacks({fetch: async () => {}, crypto: {}}, 'node'),
    /callbacks.crypto/
  )
  assert.doesNotThrow(() => validateCallbacks({fetch: async () => {}, crypto}, 'node'))
})

test('strategy validates funding nullability and preloaded exchange structures', () => {
  assert.doesNotThrow(() => validateStrategy(strategy({
    fundingFeePolicy: {enabled: false, maxFundingRatePerHour: null},
    contractInfo,
    leverageBracket,
    balance: 0
  })))

  assert.throws(
    () => validateStrategy(strategy({fundingFeePolicy: {enabled: true, maxFundingRatePerHour: null}})),
    /maxFundingRatePerHour/
  )
  assert.throws(() => validateStrategy(strategy({balance: NaN})), /balance/)
  assert.throws(() => validateStrategy(strategy({contractInfo: {symbol: 'BTCUSDT'}})), /contractInfo/)
  assert.throws(() => validateStrategy(strategy({leverageBracket: {brackets: []}})), /leverageBracket/)
})

test('contract and leverage validators reject incomplete or mismatched data', () => {
  assert.equal(isValidContractInfo(contractInfo, 'BTCUSDT'), true)
  assert.equal(isValidContractInfo(contractInfo, 'ETHUSDT'), false)
  assert.equal(isValidContractInfo({...contractInfo, filters: []}, 'BTCUSDT'), false)
  assert.equal(isValidLeverageBracket(leverageBracket, 'BTCUSDT'), true)
  assert.equal(isValidLeverageBracket({...leverageBracket, brackets: []}, 'BTCUSDT'), false)
})

test('expiration validation enforces Binance GTD minimum and second precision', async () => {
  assert.throws(() => validateExpirationInMinutes(10, 'test'), /greater than or equal to 10.1/)
  assert.throws(() => validateExpirationInMinutes(Infinity, 'test'), /finite number/)

  const now = 1789862400123
  const result = await getOrderExpirationParams({
    main: {useServerTime: true, getServerTime: async () => now},
    expirationInMinutes: 10.1
  })

  assert.deepEqual(result, {
    timeInForce: 'GTD',
    goodTillDate: 1789863006000
  })
})

test('market order validation rejects non-finite trading values before submission', async () => {
  const main = {
    latestPrice: Infinity,
    leverage: 1,
    workingType: 'MARK_PRICE'
  }

  await assert.rejects(
    createMarketOrder({main, side: 'BUY', amountInUSD: 10}),
    /latestPrice.*finite number/
  )

  main.latestPrice = 60000
  await assert.rejects(
    createMarketOrder({main, side: 'BUY', amountInUSD: NaN}),
    /amountInUSD.*finite number/
  )
})

test('entry actions apply safe defaults and reject invalid collections', async () => {
  const requests = []
  const main = {
    latestPrice: 60000,
    leverage: 2,
    contractName: 'BTCUSDT',
    workingType: 'MARK_PRICE',
    debug: false,
    useServerTime: true,
    getServerTime: async () => 1789862400123,
    getContractInfo: async () => contractInfo,
    getOrders: async () => [],
    getAlgoOrders: async () => [],
    assertFundingEntryAllowed: async () => true,
    fetch: async (endpoint, method, payload) => {
      requests.push({endpoint, method, payload})
      return endpoint === 'order' ? {orderId: 1} : {algoId: 2}
    }
  }

  await createLimitOrder({main, amountInUSD: 100, entryPrice: 59000})
  await createStopLimitOrder({main, amountInUSD: 100, stopPrice: 61000, limitPrice: 61100})

  assert.equal(requests[0].payload.timeInForce, 'GTD')
  assert.equal(requests[0].payload.goodTillDate, 1789863006000)
  assert.equal(requests[1].payload.timeInForce, 'GTD')
  assert.equal(requests[1].payload.goodTillDate, 1789863006000)

  await assert.rejects(
    createLimitOrder({main, amountInUSD: 100, entryPrice: 59000, orders: {}}),
    /"orders" must be an array/
  )
})
