import assert from 'node:assert/strict'
import test from 'node:test'
import BinanceFutures from '../index.js'
import {createExchange, jsonResponse, unexpectedRequest} from './helpers.js'

const candle = (close = '60000') => [1789862400000, '59000', '61000', '58000', close, '12.5']

test('static ohlcv normalizes dates and sends Binance timestamps in milliseconds', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => jsonResponse([candle()]))
  const candles = await BinanceFutures.ohlcv('BTCUSDT', {
    interval: '1h', limit: 20,
    startTime: '2026-09-20T00:00:00Z', endTime: new Date('2026-09-20T08:00:00Z')
  })
  const url = new URL(fetch.mock.calls[0].arguments[0])
  assert.equal(url.pathname, '/fapi/v1/klines')
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    symbol: 'BTCUSDT', interval: '1h', limit: '20',
    startTime: '1789862400000', endTime: '1789891200000'
  })
  assert.deepEqual(candles, [{
    date: 1789862400000, open: 59000, high: 61000, low: 58000, close: 60000, volume: 12.5
  }])
})

test('static ohlcv accepts independently optional start and end times', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => jsonResponse([candle()]))
  for (const times of [{}, {startTime: 1789862400000}, {endTime: 1789891200000}]) {
    await BinanceFutures.ohlcv('BTCUSDT', {interval: '1m', ...times})
  }
  const times = fetch.mock.calls.map(({arguments: [url]}) => {
    const query = new URL(url).searchParams
    return [query.get('startTime'), query.get('endTime'), query.get('limit')]
  })
  assert.deepEqual(times, [[null, null, null], ['1789862400000', null, null], [null, '1789891200000', null]])
})

test('static ohlcv rejects invalid timestamps, limits, and duplicate intervals before fetching', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', unexpectedRequest)
  for (const [params, error] of [
    [{interval: '1m', startTime: 1710000000}, /epoch timestamp in milliseconds/],
    [{interval: '1m', startTime: '2026-09-20 00:00:00'}, /explicit timezone/],
    [{interval: '1m', limit: 1.5}, /must be an integer/],
    [[{interval: '1h'}, {interval: '1h', klineType: 'markPriceKlines'}], /Duplicate "interval"/]
  ]) {
    await assert.rejects(BinanceFutures.ohlcv('BTCUSDT', params), error)
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test('instance ohlcv updates latestPrice only for recent price candles', async () => {
  const exchange = createExchange()
  exchange.latestPrice = 50000
  exchange.fetch = async () => [candle('0.0005')]
  await exchange.ohlcv({interval: '1h', startTime: '2026-09-20T00:00:00Z'})
  assert.equal(exchange.latestPrice, 50000)
  const premium = await exchange.ohlcv({interval: '1h', klineType: 'premiumIndexKlines'})
  assert.equal(exchange.latestPrice, 50000)
  assert.equal('volume' in premium[0], false)

  exchange.fetch = async () => [candle('61000')]
  await exchange.ohlcv({interval: '1h', klineType: 'markPriceKlines'})
  assert.equal(exchange.latestPrice, 61000)

  exchange.fetch = async () => []
  assert.deepEqual(await exchange.ohlcv({interval: '1m'}), [])
  assert.equal(exchange.latestPrice, 61000)
})
