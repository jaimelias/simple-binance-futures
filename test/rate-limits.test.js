import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import BinanceFutures from '../index.js'
import RateLimitError from '../src/utilities/RateLimitError.js'
import {validateStrategy} from '../src/utilities/validators.js'

const credentials = {
  testnet: {
    API_KEY: 'rate-limit-test-key',
    API_SECRET: 'rate-limit-test-secret'
  }
}

const strategy = overrides => ({
  environment: 'testnet',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  ...overrides
})

const response = ({status, body, headers = {}, statusText = ''}) => ({
  status,
  statusText,
  headers,
  text: async () => JSON.stringify(body)
})

const createExchange = ({fetch, rateLimitCoolDownSeconds = 60} = {}) => new BinanceFutures(
  credentials,
  strategy({rateLimitCoolDownSeconds}),
  {
    crypto,
    fetch: fetch ?? (async () => response({status: 200, body: {serverTime: 1}}))
  }
)

test('429 Retry-After locks the instance and preserves structured errors', async () => {
  let requests = 0
  const exchange = createExchange({
    fetch: async () => {
      requests++
      return response({
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'retry-after': '120',
          'x-mbx-used-weight-1m': '2400'
        },
        body: {code: -1003, msg: 'Too many requests'}
      })
    }
  })

  await assert.rejects(
    exchange.getServerTime(),
    error => {
      assert.ok(error instanceof RateLimitError)
      assert.equal(error.status, 429)
      assert.equal(error.retryAfterSeconds, 120)
      assert.equal(error.rateLimitUsage['x-mbx-used-weight-1m'], 2400)
      assert.equal(error.isLocalCooldown, false)
      return true
    }
  )

  await assert.rejects(
    exchange.getServerTime(),
    error => {
      assert.ok(error instanceof RateLimitError)
      assert.equal(error.isLocalCooldown, true)
      assert.ok(error.retryAfterSeconds > 0)
      return true
    }
  )
  assert.equal(requests, 1)
})

test('missing Retry-After uses rateLimitCoolDownSeconds', async () => {
  const exchange = createExchange({
    rateLimitCoolDownSeconds: 17,
    fetch: async () => response({
      status: 429,
      body: {code: -1003, msg: 'Too many requests'}
    })
  })

  await assert.rejects(
    exchange.fetch('time'),
    error => {
      assert.equal(error.retryAfterSeconds, 17)
      return true
    }
  )
})

test('418 responses create an IP-ban cooldown', async () => {
  const exchange = createExchange({
    fetch: async () => response({
      status: 418,
      headers: {'retry-after': '180'},
      body: {code: -1003, msg: 'IP banned'}
    })
  })

  await assert.rejects(
    exchange.fetch('time'),
    error => {
      assert.ok(error instanceof RateLimitError)
      assert.equal(error.status, 418)
      assert.equal(error.retryAfterSeconds, 180)
      return true
    }
  )
})

test('a shorter rate-limit response never shortens an active lock', () => {
  const exchange = createExchange()
  const firstLock = exchange.lockRateLimit({status: 418, retryAfterSeconds: 300})
  const secondLock = exchange.lockRateLimit({status: 429, retryAfterSeconds: 5})

  assert.ok(secondLock.lockedUntil >= firstLock.lockedUntil)
  assert.ok(secondLock.retryAfterSeconds >= 299)
})

test('successful responses expose Binance weight and order-count headers', async () => {
  const exchange = createExchange({
    fetch: async () => response({
      status: 200,
      headers: {
        'X-MBX-USED-WEIGHT-1M': '42',
        'X-MBX-ORDER-COUNT-10S': '3'
      },
      body: {serverTime: 1}
    })
  })

  await exchange.getServerTime()

  assert.equal(exchange.rateLimitUsage['x-mbx-used-weight-1m'], 42)
  assert.equal(exchange.rateLimitUsage['x-mbx-order-count-10s'], 3)
  assert.ok(Number.isFinite(exchange.rateLimitUsage.observedAt))
})

test('Apps Script GET requests inspect errors using muteHttpExceptions', async () => {
  const originalUrlFetchApp = globalThis.UrlFetchApp
  let receivedOptions
  const exchange = createExchange({rateLimitCoolDownSeconds: 9})
  const storedProperties = new Map()
  exchange.engine = 'google-apps-script'
  exchange.isGAS = true
  exchange.cache = null
  exchange.PropertiesService = {
    getProperty: key => storedProperties.get(key) ?? null,
    setProperty: (key, value) => storedProperties.set(key, value),
    deleteProperty: key => storedProperties.delete(key)
  }
  globalThis.UrlFetchApp = {
    fetch: (url, options) => {
      receivedOptions = options
      return {
        getResponseCode: () => 429,
        getContentText: () => JSON.stringify({code: -1003}),
        getAllHeaders: () => ({'Retry-After': '11'})
      }
    }
  }

  try {
    await assert.rejects(
      exchange.fetch('time'),
      error => {
        assert.ok(error instanceof RateLimitError)
        assert.equal(error.retryAfterSeconds, 11)
        return true
      }
    )
    assert.equal(receivedOptions.muteHttpExceptions, true)
    assert.ok(Number(storedProperties.get(exchange.rateLimitStateKey)) > Date.now())

    const nextExecution = createExchange()
    nextExecution.cache = null
    nextExecution.PropertiesService = exchange.PropertiesService
    assert.throws(
      () => nextExecution.assertRateLimitAvailable(),
      error => {
        assert.ok(error instanceof RateLimitError)
        assert.equal(error.isLocalCooldown, true)
        return true
      }
    )
  } finally {
    if(originalUrlFetchApp === undefined) delete globalThis.UrlFetchApp
    else globalThis.UrlFetchApp = originalUrlFetchApp
  }
})

test('rateLimitCoolDownSeconds must be a positive integer', () => {
  assert.throws(
    () => validateStrategy(strategy({rateLimitCoolDownSeconds: 0})),
    /rateLimitCoolDownSeconds/
  )
  assert.throws(
    () => validateStrategy(strategy({rateLimitCoolDownSeconds: 1.5})),
    /rateLimitCoolDownSeconds/
  )
})
