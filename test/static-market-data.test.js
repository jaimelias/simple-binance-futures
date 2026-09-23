import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import BinanceFutures from '../index.js'
import {createPublicClient} from '../src/utilities/MarketDataClient.js'

import {jsonResponse as response, contractInfo as contract, credentials, strategy, mockAppsScript} from './helpers.js'

const candle = [1700000000000, '100', '105', '95', '100', '20', 1700003599999]

const assertPublic = (url, options) => {
  assert.equal(options.method, 'GET')
  assert.deepEqual(options.headers, {})
  for (const name of ['timestamp', 'recvWindow', 'signature']) {
    assert.equal(new URL(url).searchParams.has(name), false)
  }
}

test('static metadata uses native fetch without credentials, crypto, or a symbol', async t => {
  const paths = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assertPublic(url, options)
    const parsed = new URL(url)
    assert.equal(parsed.origin, 'https://fapi.binance.com')
    assert.equal(parsed.searchParams.has('symbol'), false)
    paths.push(parsed.pathname)
    return response(parsed.pathname.endsWith('/time') ? {serverTime: 123} : {symbols: [contract]})
  })

  assert.equal(await BinanceFutures.getServerTime(), 123)
  assert.deepEqual(await BinanceFutures.getExchangeInfo(), {symbols: [contract]})
  assert.deepEqual(await BinanceFutures.getContractInfo('BTCUSDT'), contract)
  assert.deepEqual(paths, ['/fapi/v1/time', '/fapi/v1/exchangeInfo', '/fapi/v1/exchangeInfo'])
})

test('static candles isolate symbols, environments, callbacks, and batch parameters', async () => {
  const requests = []
  const callbacks = {
    fetch: async (url, options) => {
      assertPublic(url, options)
      const parsed = new URL(url)
      requests.push(parsed)
      return response([candle])
    }
  }
  const prices = await BinanceFutures.ohlcv('BTCUSDT', [
    {interval: '5m', limit: 2},
    {interval: '1h', klineType: 'continuousKlines', contractType: 'PERPETUAL'}
  ], {environment: 'testnet', callbacks})
  await BinanceFutures.ohlcv('ETHUSDT', {interval: '1m', klineType: 'indexPriceKlines'}, {
    proxy: 'https://market-proxy.example/api/', callbacks
  })

  assert.equal(prices['5m'][0].volume, 20)
  assert.equal(prices['1h'][0].close, 100)
  assert.equal(requests[0].origin, 'https://testnet.binancefuture.com')
  assert.equal(requests[0].searchParams.get('symbol'), 'BTCUSDT')
  assert.equal(requests[0].searchParams.get('limit'), '2')
  assert.equal(requests[1].searchParams.get('pair'), 'BTCUSDT')
  assert.equal(requests[1].searchParams.has('symbol'), false)
  assert.equal(requests[1].searchParams.get('contractType'), 'PERPETUAL')
  assert.equal(requests[2].pathname, '/api/fapi/v1/indexPriceKlines')
  assert.equal(requests[2].searchParams.get('pair'), 'ETHUSDT')

  const independent = await BinanceFutures.getServerTime({callbacks: {
    fetch: async () => response({serverTime: 456})
  }})
  assert.equal(independent, 456)
  assert.equal(requests.length, 3)
})

test('static options reject invalid inputs before a request and errors reach the logger', async () => {
  let requests = 0
  const callbacks = {fetch: async () => { requests++; return response([]) }}
  await assert.rejects(BinanceFutures.ohlcv(undefined, {interval: '1h'}, {callbacks}), /symbol/)
  await assert.rejects(BinanceFutures.getContractInfo({symbol: 'BTCUSDT'}, {callbacks}), /symbol/)
  await assert.rejects(BinanceFutures.getServerTime({environment: 'invalid', callbacks}), /environment/)
  await assert.rejects(BinanceFutures.getServerTime({proxy: 'invalid', callbacks}), /proxy/)
  await assert.rejects(BinanceFutures.getServerTime({callbacks: null}), /callbacks/)
  await assert.rejects(BinanceFutures.getServerTime({callbacks: {fetch: null}}), /fetch/)
  await assert.rejects(BinanceFutures.getServerTime({debug: 'yes', callbacks}), /debug/)
  await assert.rejects(BinanceFutures.getServerTime({rateLimitCoolDownSeconds: 0, callbacks}), /rateLimitCoolDownSeconds/)
  await assert.rejects(BinanceFutures.getFundingState('BTCUSDT', {}, {
    fundingFeePolicy: {expectedIntervalHours: 0}, callbacks
  }), /expectedIntervalHours/)
  assert.equal(requests, 0)

  const logged = []
  await assert.rejects(BinanceFutures.getServerTime({callbacks: {
    fetch: async () => response({msg: 'down'}, 503),
    errorLogger: message => logged.push(message)
  }}), /503/)
  assert.equal(logged.length, 1)
  assert.match(logged[0], /503/)
})

test('account requests still require credentials and sign with server time', async () => {
  const callbacks = {crypto, fetch: async (url, options) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/time')) {
      assertPublic(url, options)
      return response({serverTime: 1700000000123})
    }
    assert.equal(parsed.pathname, '/fapi/v3/positionRisk')
    assert.equal(options.headers['X-MBX-APIKEY'], 'test-key')
    assert.equal(parsed.searchParams.get('timestamp'), '1700000000123')
    const query = parsed.search.slice(1).split('&signature=')[0]
    assert.equal(parsed.searchParams.get('signature'), crypto.createHmac('sha256', 'test-secret').update(query).digest('hex'))
    return response([])
  }}
  const config = strategy({useServerTime: true})
  assert.throws(() => new BinanceFutures({}, config, callbacks), /credentials/)
  assert.throws(() => new BinanceFutures(credentials, config, {fetch: callbacks.fetch}), /crypto/)
  const exchange = new BinanceFutures(credentials, config, callbacks)
  assert.deepEqual(await exchange.getPositions(), [])
  assert.equal(BinanceFutures.getPositions, undefined)
  await assert.rejects(createPublicClient({callbacks}).fetch('positionRisk'), /authenticated/)
})

test('Apps Script public calls use native services and share the contract cache', async t => {
  const {fetch} = mockAppsScript(t, {body: {symbols: [contract]}})
  assert.deepEqual(await BinanceFutures.getContractInfo('BTCUSDT'), contract)
  assert.deepEqual(await BinanceFutures.getContractInfo('BTCUSDT'), contract)
  assert.equal(fetch.mock.callCount(), 1)
  const [url, options] = fetch.mock.calls[0].arguments
  assertPublic(url, options)
  assert.equal(options.muteHttpExceptions, true)
})
