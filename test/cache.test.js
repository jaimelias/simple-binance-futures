import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import BinanceFutures from '../index.js'

const createExchange = () => new BinanceFutures(
  {
    testnet: {
      API_KEY: 'cache-test-api-key',
      API_SECRET: 'cache-test-api-secret'
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

const createCache = initialValues => {
  const values = new Map(Object.entries(initialValues ?? {}))
  const puts = []
  const removals = []

  return {
    values,
    puts,
    removals,
    get: key => values.has(key) ? values.get(key) : null,
    put: (key, value, expirationInSeconds) => {
      values.set(key, value)
      puts.push({key, value, expirationInSeconds})
    },
    remove: key => {
      values.delete(key)
      removals.push(key)
    }
  }
}

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
  brackets: [
    {notionalFloor: 0, notionalCap: 10000, initialLeverage: 20},
    {notionalFloor: 10000, notionalCap: 50000, initialLeverage: 10}
  ]
}

test('non-Apps-Script engines do not initialize CacheService', () => {
  const exchange = createExchange()
  assert.equal(exchange.cache, null)
})

test('getContractInfo uses a valid cached symbol without loading exchangeInfo', async () => {
  const exchange = createExchange()
  const cacheKey = exchange._getCacheKey('contract-info')
  exchange.cache = createCache({[cacheKey]: JSON.stringify(contractInfo)})
  exchange.getExchangeInfo = async () => {
    throw new Error('exchangeInfo should not be loaded on a cache hit.')
  }

  const result = await exchange.getContractInfo()

  assert.deepEqual(result, contractInfo)
  assert.deepEqual(exchange.contractInfo, contractInfo)
})

test('getContractInfo caches only the extracted contract for six hours', async () => {
  const exchange = createExchange()
  const cache = createCache()
  exchange.cache = cache
  exchange.getExchangeInfo = async () => ({symbols: [contractInfo, {symbol: 'ETHUSDT'}]})

  const result = await exchange.getContractInfo()

  assert.deepEqual(result, contractInfo)
  assert.equal(cache.puts.length, 1)
  assert.equal(cache.puts[0].expirationInSeconds, 21600)
  assert.deepEqual(JSON.parse(cache.puts[0].value), contractInfo)
})

test('getLeverageBracket uses an account-specific cache and getMaxLevarage reuses it', async () => {
  const exchange = createExchange()
  const cacheKey = exchange._getCacheKey('leverage-bracket', true)
  const cache = createCache({[cacheKey]: JSON.stringify(leverageBracket)})
  exchange.cache = cache
  exchange.fetch = async () => {
    throw new Error('leverageBracket should not be fetched on a cache hit.')
  }

  assert.doesNotMatch(cacheKey, /cache-test-api-key/)
  assert.equal(await exchange.getMaxLevarage(5000), 20)
  assert.equal(await exchange.getMaxLevarage(15000), 10)
  assert.equal(cache.puts.length, 0)
})

test('invalid cached JSON is removed and replaced from Binance', async () => {
  const exchange = createExchange()
  const cacheKey = exchange._getCacheKey('leverage-bracket', true)
  const cache = createCache({[cacheKey]: '{invalid-json'})
  exchange.cache = cache
  exchange.fetch = async endpoint => {
    assert.equal(endpoint, 'leverageBracket')
    return [leverageBracket]
  }

  const result = await exchange.getLeverageBracket()

  assert.deepEqual(result, leverageBracket)
  assert.deepEqual(cache.removals, [cacheKey])
  assert.equal(cache.puts.length, 1)
  assert.equal(cache.puts[0].expirationInSeconds, 600)
})
