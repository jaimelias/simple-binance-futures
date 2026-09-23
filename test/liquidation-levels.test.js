import assert from 'node:assert/strict'
import test from 'node:test'
import BinanceFutures from '../index.js'
import {jsonResponse, unexpectedRequest} from './helpers.js'

const time = 1600000000000
const row = (openTime, low = 99, volume = 10, closeTime = openTime + 59999) => (
  [openTime, '100', '101', String(low), '100', String(volume), closeTime]
)
const params = {interval: '1m', limit: 2, step: 1, leverages: [10], maintenanceMarginRate: 0}

test('static liquidation levels use mark prices to invalidate older levels', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async url => jsonResponse(
    new URL(url).pathname.endsWith('/klines')
      ? [row(time), row(time + 60000, 99, 20)]
      : [row(time, 99, 0), row(time + 60000, 89, 0)]
  ))
  const levels = await BinanceFutures.getLiquidationLevels('BTCUSDT', params)
  assert.deepEqual(levels, {
    method: 'volumeProxy', step: 1, candleCount: 2,
    longLiquidations: [{price: 90, score: 10}],
    shortLiquidations: [{price: 110, score: 15}]
  })
  assert.deepEqual(fetch.mock.calls.map(({arguments: [url, options]}) => {
    const parsed = new URL(url)
    assert.equal(options.method, 'GET')
    assert.deepEqual(options.headers, {})
    assert.deepEqual(Object.fromEntries(parsed.searchParams), {symbol: 'BTCUSDT', interval: '1m', limit: '2'})
    return parsed.pathname
  }), ['/fapi/v1/klines', '/fapi/v1/markPriceKlines'])
})

test('liquidation estimates apply maintenance margin to the isolated-margin equation', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse([row(time)]))
  const levels = await BinanceFutures.getLiquidationLevels('BTCUSDT', {
    ...params, step: 0.01, maintenanceMarginRate: 0.004
  })
  assert.equal(levels.longLiquidations[0].price.toFixed(2), '90.36')
  assert.equal(levels.shortLiquidations[0].price.toFixed(2), '109.56')
})

test('an open candle invalidates old levels but contributes no new score', async t => {
  const now = time + 60000
  t.mock.method(Date, 'now', () => now)
  let low = 99
  t.mock.method(globalThis, 'fetch', async () => jsonResponse([
    row(time), row(now, low, 1000)
  ]))
  const levels = await BinanceFutures.getLiquidationLevels('BTCUSDT', params)
  assert.equal(levels.candleCount, 1)
  assert.deepEqual(levels.longLiquidations, [{price: 90, score: 5}])
  low = 89
  const touched = await BinanceFutures.getLiquidationLevels('BTCUSDT', params)
  assert.deepEqual(touched.longLiquidations, [])
})

test('liquidation estimates reject misaligned trade and mark candles', async t => {
  t.mock.method(globalThis, 'fetch', async url => jsonResponse([
    row(new URL(url).pathname.endsWith('/klines') ? time : time + 60000)
  ]))
  await assert.rejects(BinanceFutures.getLiquidationLevels('BTCUSDT'), /not aligned by open time/)
})

test('invalid liquidation parameters are rejected before fetching', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', unexpectedRequest)
  for (const [invalid, error] of [
    [{step: 0}, /"step"/], [{leverages: [10, 10]}, /"leverages"/],
    [{maintenanceMarginRate: 0.02}, /"maintenanceMarginRate"/], [{limit: 1501}, /"limit"/]
  ]) {
    await assert.rejects(BinanceFutures.getLiquidationLevels('BTCUSDT', invalid), error)
  }
  assert.equal(fetch.mock.callCount(), 0)
})
