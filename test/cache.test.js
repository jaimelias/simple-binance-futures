import assert from 'node:assert/strict'
import test from 'node:test'
import {createExchange, createCache, contractInfo, leverageBracket} from './helpers.js'

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

test('getMaxLevarage reuses cached contract brackets', async () => {
  const exchange = createExchange()
  const cacheKey = exchange._getCacheKey('leverage-bracket')
  const cache = createCache({[cacheKey]: JSON.stringify(leverageBracket)})
  exchange.cache = cache
  exchange.fetch = async () => {
    throw new Error('leverageBracket should not be fetched on a cache hit.')
  }

  assert.equal(await exchange.getMaxLevarage(5000), 20)
  assert.equal(await exchange.getMaxLevarage(15000), 10)
  assert.equal(cache.puts.length, 0)
})

test('invalid cached JSON is removed and replaced from Binance', async () => {
  const exchange = createExchange()
  const cacheKey = exchange._getCacheKey('leverage-bracket')
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
