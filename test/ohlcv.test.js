import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import BinanceFutures from '../index.js'
import { millisecondsToDateStr } from '../src/utilities/utilities.js'

const createExchange = () => new BinanceFutures(
  {
    testnet: {
      API_KEY: 'ohlcv-test-api-key',
      API_SECRET: 'ohlcv-test-api-secret'
    }
  },
  {
    environment: 'testnet',
    symbol: 'BTC',
    settlementCurrency: 'USDT'
  },
  {
    crypto,
    fetch: async () => {
      throw new Error('Unexpected network request.')
    }
  }
)

const candle = ({time = 1789862400000, close = '60000.00'} = {}) => [
  time,
  '59000.00',
  '61000.00',
  '58000.00',
  close,
  '12.50',
  time + 59999,
  '0',
  1,
  '0',
  '0',
  '0'
]

test('ohlcv sends Binance timestamps as epoch milliseconds and preserves limit', async () => {
  const exchange = createExchange()
  let request

  exchange.fetch = async (endpoint, method, args) => {
    request = {endpoint, method, args}
    return [candle()]
  }

  await exchange.ohlcv({
    interval: '1h',
    startTime: '2026-09-20T00:00:00Z',
    endTime: new Date('2026-09-20T08:00:00Z'),
    limit: 20
  })

  assert.deepEqual(request, {
    endpoint: 'klines',
    method: 'GET',
    args: {
      interval: '1h',
      limit: 20,
      startTime: 1789862400000,
      endTime: 1789891200000
    }
  })
})

test('ohlcv accepts independently optional time parameters and rejects ambiguous times', async () => {
  const exchange = createExchange()
  const requests = []

  exchange.fetch = async (endpoint, method, args) => {
    requests.push(args)
    return [candle()]
  }

  await exchange.ohlcv({interval: '1m'})
  await exchange.ohlcv({interval: '1m', startTime: 1789862400000})
  await exchange.ohlcv({interval: '1m', endTime: 1789891200000})

  assert.deepEqual(requests, [
    {interval: '1m'},
    {interval: '1m', startTime: 1789862400000},
    {interval: '1m', endTime: 1789891200000}
  ])

  await assert.rejects(
    exchange.ohlcv({interval: '1m', startTime: 1710000000}),
    /epoch timestamp in milliseconds/
  )
  await assert.rejects(
    exchange.ohlcv({interval: '1m', startTime: '2026-09-20 00:00:00'}),
    /explicit timezone/
  )
  await assert.rejects(
    exchange.ohlcv({interval: '1m', limit: 1.5}),
    /must be an integer/
  )
})

test('ohlcv does not replace latestPrice with historical or premium-index values', async () => {
  const exchange = createExchange()
  exchange.latestPrice = 50000
  exchange.fetch = async () => [candle({close: '0.0005'})]

  await exchange.ohlcv({
    interval: '1h',
    startTime: '2026-09-20T00:00:00Z',
    endTime: '2026-09-20T08:00:00Z'
  })
  assert.equal(exchange.latestPrice, 50000)

  await exchange.ohlcv({interval: '1h', limit: 1, klineType: 'premiumIndexKlines'})
  assert.equal(exchange.latestPrice, 50000)

  exchange.fetch = async () => [candle({close: '61000.00'})]
  await exchange.ohlcv({interval: '1h', limit: 1, klineType: 'markPriceKlines'})
  assert.equal(exchange.latestPrice, 61000)
})

test('ohlcv accepts an empty response without changing latestPrice', async () => {
  const exchange = createExchange()
  exchange.latestPrice = 50000
  exchange.fetch = async () => []

  assert.deepEqual(await exchange.ohlcv({interval: '1m', limit: 1}), [])
  assert.equal(exchange.latestPrice, 50000)
})

test('ohlcv rejects duplicate batch intervals instead of overwriting results', async () => {
  const exchange = createExchange()
  let requestCount = 0
  exchange.fetch = async () => {
    requestCount += 1
    return [candle()]
  }

  await assert.rejects(
    exchange.ohlcv([
      {interval: '1h', limit: 1, klineType: 'klines'},
      {interval: '1h', limit: 1, klineType: 'markPriceKlines'}
    ]),
    /Duplicate "interval"/
  )
  assert.equal(requestCount, 0)
})

test('millisecondsToDateStr always formats UTC', () => {
  assert.equal(millisecondsToDateStr(1789862400000), '2026-09-20 00:00:00')
})
