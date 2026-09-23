import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import BinanceFutures from '../index.js'

const createExchange = () => new BinanceFutures(
  {testnet: {API_KEY: 'test-key', API_SECRET: 'test-secret'}},
  {environment: 'testnet', symbol: 'BTC', settlementCurrency: 'USDT'},
  {crypto, fetch: async () => { throw new Error('Unexpected network request.') }}
)

const row = (time, high, low, close, volume = '10', closeTime = time + 59999) => [
  time, String(close), String(high), String(low), String(close), String(volume), closeTime
]

test('estimates levels from mark prices and drops levels touched by later mark candles', async () => {
  const exchange = createExchange()
  const time = 1600000000000
  const requests = []
  exchange.fetch = async (endpoint, method, args) => {
    requests.push({endpoint, method, args})
    if(endpoint === 'klines') return [
      row(time, 101, 99, 100, '10'),
      row(time + 60000, 101, 89, 100, '20')
    ]
    return [
      row(time, 101, 99, 100, '0'),
      row(time + 60000, 101, 89, 100, '0')
    ]
  }

  const levels = await exchange.getLiquidationLevels({interval: '1m', limit: 2, step: 1, leverages: [10], maintenanceMarginRate: 0})
  assert.deepEqual(requests, [
    {endpoint: 'klines', method: 'GET', args: {interval: '1m', limit: 2}},
    {endpoint: 'markPriceKlines', method: 'GET', args: {interval: '1m', limit: 2}}
  ])
  assert.deepEqual(levels, {
    method: 'volumeProxy',
    step: 1,
    candleCount: 2,
    longLiquidations: [{price: 90, score: 10}],
    shortLiquidations: [{price: 110, score: 15}]
  })
  assert.equal(exchange.latestPrice, 0)
})

test('uses the isolated-margin maintenance equation for modeled prices', async () => {
  const exchange = createExchange()
  const candle = row(1600000000000, 101, 99, 100, '10')
  exchange.fetch = async () => [candle]
  const levels = await exchange.getLiquidationLevels({
    step: 0.01,
    leverages: [10],
    maintenanceMarginRate: 0.004
  })

  assert.equal(levels.longLiquidations[0].price.toFixed(2), '90.36')
  assert.equal(levels.shortLiquidations[0].price.toFixed(2), '109.56')
})

test('uses mark prices, ignores open candles, and rejects misaligned candle responses', async () => {
  const exchange = createExchange()
  const time = 1600000000000
  const openTime = Date.now() - 1000
  exchange.fetch = async endpoint => endpoint === 'klines'
    ? [row(time, 101, 99, 100, '10'), row(openTime, 101, 99, 100, '1000', Date.now() + 60000)]
    : [row(time, 101, 99, 100, '0'), row(openTime, 101, 99, 100, '0', Date.now() + 60000)]

  const levels = await exchange.getLiquidationLevels({step: 1, leverages: [10], maintenanceMarginRate: 0})
  assert.equal(levels.candleCount, 1)
  assert.deepEqual(levels.longLiquidations, [{price: 90, score: 5}])

  exchange.fetch = async endpoint => endpoint === 'klines'
    ? [row(time, 101, 99, 100, '10'), row(openTime, 101, 89, 100, '1000', Date.now() + 60000)]
    : [row(time, 101, 99, 100, '0'), row(openTime, 101, 89, 100, '0', Date.now() + 60000)]
  const touched = await exchange.getLiquidationLevels({step: 1, leverages: [10], maintenanceMarginRate: 0})
  assert.deepEqual(touched.longLiquidations, [])

  exchange.fetch = async endpoint => endpoint === 'klines'
    ? [row(time, 101, 99, 100)]
    : [row(time + 60000, 101, 99, 100)]
  await assert.rejects(exchange.getLiquidationLevels(), /not aligned by open time/)
})

test('rejects invalid options before fetching', async () => {
  const exchange = createExchange()
  let calls = 0
  exchange.fetch = async () => { calls++; return [] }

  await assert.rejects(exchange.getLiquidationLevels({step: 0}), /"step"/)
  await assert.rejects(exchange.getLiquidationLevels({leverages: [10, 10]}), /"leverages"/)
  await assert.rejects(exchange.getLiquidationLevels({maintenanceMarginRate: 0.02}), /"maintenanceMarginRate"/)
  await assert.rejects(exchange.getLiquidationLevels({limit: 1501}), /"limit"/)
  assert.equal(calls, 0)
})
