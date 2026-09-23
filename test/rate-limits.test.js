import assert from 'node:assert/strict'
import test from 'node:test'
import BinanceFutures, {RateLimitError} from '../index.js'
import {createExchange, jsonResponse, mockAppsScript} from './helpers.js'

for (const status of [429, 418]) {
  test(`${status} starts a cooldown and blocks repeat requests`, async t => {
    const fetch = t.mock.fn(async () => jsonResponse({code: -1003}, status, {
      'retry-after': '120', 'x-mbx-used-weight-1m': '2400'
    }))
    const exchange = createExchange({fetch})
    await assert.rejects(exchange.getServerTime(), {
      name: 'RateLimitError', status, retryAfterSeconds: 120, isLocalCooldown: false
    })
    assert.equal(exchange.rateLimitUsage['x-mbx-used-weight-1m'], 2400)
    await assert.rejects(exchange.getServerTime(), {
      name: 'RateLimitError', status, isLocalCooldown: true
    })
    assert.equal(fetch.mock.callCount(), 1)
  })
}

test('missing Retry-After uses the configured cooldown', async () => {
  const exchange = createExchange({
    strategy: {rateLimitCoolDownSeconds: 17},
    fetch: async () => jsonResponse({code: -1003}, 429)
  })
  await assert.rejects(exchange.getServerTime(), {retryAfterSeconds: 17})
})

test('a shorter response never shortens an active lock', () => {
  const exchange = createExchange()
  const first = exchange.lockRateLimit({status: 418, retryAfterSeconds: 300})
  const second = exchange.lockRateLimit({status: 429, retryAfterSeconds: 5})
  assert.equal(second.lockedUntil, first.lockedUntil)
})

test('successful responses expose weight and order-count headers', async () => {
  const exchange = createExchange({fetch: async () => jsonResponse({serverTime: 1}, 200, {
    'X-MBX-USED-WEIGHT-1M': '42', 'X-MBX-ORDER-COUNT-10S': '3'
  })})
  await exchange.getServerTime()
  assert.equal(exchange.rateLimitUsage['x-mbx-used-weight-1m'], 42)
  assert.equal(exchange.rateLimitUsage['x-mbx-order-count-10s'], 3)
  assert.ok(Number.isFinite(exchange.rateLimitUsage.observedAt))
})

test('Apps Script persists the cooldown for later clients', async t => {
  const {cache, properties, fetch} = mockAppsScript(t, {
    body: {code: -1003}, status: 429, headers: {'Retry-After': '11'}
  })
  const exchange = createExchange()
  await assert.rejects(exchange.getServerTime(), {name: 'RateLimitError', retryAfterSeconds: 11})
  assert.equal(fetch.mock.calls[0].arguments[1].muteHttpExceptions, true)
  assert.ok(Number(properties.get(exchange.rateLimitStateKey)) > Date.now())
  cache.values.clear()
  const nextExecution = createExchange()
  await assert.rejects(nextExecution.getServerTime(), {name: 'RateLimitError', isLocalCooldown: true})
  assert.equal(fetch.mock.callCount(), 1)
})

test('static cooldown survives new calls for other symbols on the same endpoint', async t => {
  let now = 1800000000000
  t.mock.method(Date, 'now', () => now)
  let requests = 0
  const options = {proxy: 'https://cooldown.example', callbacks: {fetch: async () => {
    requests++
    return jsonResponse({}, 418, {'retry-after': '10'})
  }}}
  await assert.rejects(BinanceFutures.getServerTime(options), error => (
    error instanceof RateLimitError && error.status === 418 && !error.isLocalCooldown
  ))
  await assert.rejects(BinanceFutures.ohlcv('ETHUSDT', {interval: '1m'}, options), error => (
    error instanceof RateLimitError && error.status === 418 && error.isLocalCooldown
  ))
  assert.equal(requests, 1)
  assert.equal(BinanceFutures.getRateLimitRemainingSeconds(options), 10)
  assert.equal(BinanceFutures.getRateLimitRemainingSeconds({environment: 'testnet'}), 0)
  now += 10001
  assert.equal(BinanceFutures.getRateLimitRemainingSeconds(options), 0)
  assert.equal(await BinanceFutures.getServerTime({...options, callbacks: {
    fetch: async () => jsonResponse({serverTime: 789})
  }}), 789)
})
