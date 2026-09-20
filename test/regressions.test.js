import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import BinanceFutures from '../index.js'
import { createStopLimitOrder } from '../src/actions/createStopLimitOrder.js'
import { createStopLossOrder } from '../src/actions/createStopLossOrder.js'
import { createTakeProfitOrder } from '../src/actions/createTakeProfitOrder.js'
import { closePosition } from '../src/actions/closePosition.js'
import { modifyLimitOrder } from '../src/actions/modifyLimitOrder.js'
import { getSignature } from '../src/utilities/getSignature.js'
import { universalFetch } from '../src/utilities/universalFetch.js'
import { validateReduceOrders } from '../src/utilities/validators.js'

const contractInfo = {
  pricePrecision: 2,
  quantityPrecision: 3,
  filters: [
    {filterType: 'PRICE_FILTER', tickSize: '0.10'},
    {filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.001'},
    {filterType: 'MIN_NOTIONAL', notional: '5'}
  ]
}

const makeExchange = strategy => new BinanceFutures(
  {testnet: {API_KEY: 'key', API_SECRET: 'secret'}},
  {
    environment: 'testnet',
    symbol: 'BTC',
    settlementCurrency: 'USDT',
    ...strategy
  },
  {fetch: globalThis.fetch, crypto}
)

test('maximum leverage remains numeric above the final bracket', async () => {
  const exchange = makeExchange({
    leverageBracket: {
      brackets: [{notionalFloor: 0, notionalCap: 100, initialLeverage: 50}]
    }
  })
  let leveragePayload
  exchange.fetch = async (endpoint, method, payload) => {
    assert.equal(endpoint, 'leverage')
    assert.equal(method, 'POST')
    leveragePayload = payload
    return {leverage: payload.leverage}
  }

  assert.equal(await exchange.getMaxLevarage(100), 50)
  assert.equal(await exchange.changeLeverage(Infinity, 100), 50)
  assert.equal(leveragePayload.leverage, 50)
})

test('failed leverage changes do not corrupt local leverage state', async () => {
  const exchange = makeExchange({
    leverageBracket: {
      brackets: [{notionalFloor: 0, notionalCap: 1000, initialLeverage: 50}]
    }
  })
  exchange.leverage = 10
  exchange.fetch = async () => {
    throw new Error('request failed')
  }

  await assert.rejects(exchange.changeLeverage(20, 100), /request failed/)
  assert.equal(exchange.leverage, 10)
})

test('SELL limit orders can be selected and modified', async () => {
  let request
  const main = {
    contractName: 'BTCUSDT',
    debug: false,
    useServerTime: false,
    getContractInfo: async () => contractInfo,
    fetch: async (...args) => {
      request = args
      return {orderId: 7}
    }
  }

  const response = await modifyLimitOrder({
    main,
    orders: [{
      symbol: 'BTCUSDT',
      type: 'LIMIT',
      side: 'SELL',
      orderId: 7,
      origQty: '2',
      executedQty: '0.5',
      price: '101'
    }],
    entryPrice: 102,
    side: 'SELL'
  })

  assert.equal(response.orderId, 7)
  assert.deepEqual(request.slice(0, 2), ['order', 'PUT'])
  assert.equal(request[2].side, 'SELL')
  assert.equal(request[2].quantity, 1.5)
})

test('take-profit uses the algo endpoint and configured working type', async () => {
  let request
  const main = {
    contractName: 'BTCUSDT',
    workingType: 'CONTRACT_PRICE',
    debug: false,
    getContractInfo: async () => contractInfo,
    getAlgoOrders: async () => [],
    fetch: async (...args) => {
      request = args
      return {algoId: 11}
    }
  }

  const response = await createTakeProfitOrder({
    main,
    triggerPrice: 110,
    handleExistingOrders: 'REPLACE',
    positions: [{symbol: 'BTCUSDT', positionAmt: '1', entryPrice: '100'}]
  })

  assert.equal(response.algoId, 11)
  assert.deepEqual(request.slice(0, 2), ['algoOrder', 'POST'])
  assert.equal(request[2].algoType, 'CONDITIONAL')
  assert.equal(request[2].triggerPrice, 110)
  assert.equal(request[2].workingType, 'CONTRACT_PRICE')
  assert.equal(request[2].closePosition, true)
  assert.equal('quantity' in request[2], false)
  assert.equal('reduceOnly' in request[2], false)
})

test('stop-loss only replaces matching-symbol algo orders', async () => {
  const canceled = []
  let request
  const main = {
    contractName: 'BTCUSDT',
    workingType: 'MARK_PRICE',
    debug: false,
    getContractInfo: async () => contractInfo,
    cancelAlgoOrder: async order => {
      canceled.push(order.algoId)
      return {algoId: order.algoId}
    },
    fetch: async (...args) => {
      request = args
      return {algoId: 12}
    }
  }
  const orders = [
    {algoId: 1, symbol: 'ETHUSDT', orderType: 'STOP_MARKET', closePosition: true, triggerPrice: '90'},
    {algoId: 2, symbol: 'BTCUSDT', orderType: 'STOP_MARKET', closePosition: true, triggerPrice: '92'},
    {algoId: 3, symbol: 'BTCUSDT', orderType: 'STOP_MARKET', closePosition: true, triggerPrice: '93'}
  ]

  await createStopLossOrder({
    main,
    triggerPrice: 90,
    handleExistingOrders: 'REPLACE',
    positions: [{symbol: 'BTCUSDT', positionAmt: '1', entryPrice: '100'}],
    orders
  })

  assert.deepEqual(canceled, [2, 3])
  assert.deepEqual(request.slice(0, 2), ['algoOrder', 'POST'])
  assert.equal(request[2].triggerPrice, 90)
  assert.equal('quantity' in request[2], false)
})

test('stop-limit orders use the algo endpoint and algo response id', async () => {
  let request
  const main = {
    contractName: 'BTCUSDT',
    latestPrice: 100,
    leverage: 2,
    workingType: 'CONTRACT_PRICE',
    useServerTime: false,
    debug: false,
    getContractInfo: async () => contractInfo,
    fetch: async (...args) => {
      request = args
      return {algoId: 13}
    }
  }

  const response = await createStopLimitOrder({
    main,
    side: 'SELL',
    amountInUSD: 100,
    stopPrice: 95,
    limitPrice: 94,
    handleExistingOrders: 'ADD',
    orders: []
  })

  assert.equal(response.algoId, 13)
  assert.deepEqual(request.slice(0, 2), ['algoOrder', 'POST'])
  assert.equal(request[2].algoType, 'CONDITIONAL')
  assert.equal(request[2].triggerPrice, 95)
})

test('parsed orders include close-all algo orders with reduceOnly false', async () => {
  const exchange = makeExchange()
  exchange.fetch = async endpoint => {
    if (endpoint === 'openOrders') {
      return [{symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', reduceOnly: false, closePosition: false}]
    }
    if (endpoint === 'openAlgoOrders') {
      return [
        {symbol: 'BTCUSDT', orderType: 'STOP_MARKET', side: 'SELL', reduceOnly: false, closePosition: true},
        {symbol: 'BTCUSDT', orderType: 'TAKE_PROFIT_MARKET', side: 'SELL', reduceOnly: false, closePosition: true}
      ]
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`)
  }

  const parsed = await exchange.getParsedOrders()

  assert.equal(parsed.orders.BUY.length, 1)
  assert.equal(parsed.sl.SELL.length, 1)
  assert.equal(parsed.tp.SELL.length, 1)
})

test('OHLCV date ranges are sent as epoch milliseconds', async () => {
  const exchange = makeExchange()
  let payload
  exchange.fetch = async (endpoint, method, args) => {
    payload = args
    return [[1000, '1', '2', '0.5', '1.5', '10']]
  }

  await exchange.ohlcv({
    interval: '5m',
    startTime: new Date(1000),
    endTime: '1970-01-01T00:00:02.000Z'
  })

  assert.equal(payload.startTime, 1000)
  assert.equal(payload.endTime, 2000)
})

test('OHLCV sends endpoint-specific symbol parameters', async () => {
  const exchange = makeExchange()
  const requests = []
  exchange.fetch = async (endpoint, method, payload) => {
    requests.push({endpoint, payload})
    return [[1000, '1', '2', '0.5', '1.5', '10']]
  }

  await exchange.ohlcv({interval: '5m', limit: 1, klineType: 'klines'})
  await exchange.ohlcv({interval: '5m', limit: 1, klineType: 'indexPriceKlines'})
  await exchange.ohlcv({interval: '5m', limit: 1, klineType: 'continuousKlines'})

  assert.equal('pair' in requests[0].payload, false)
  assert.equal(requests[1].payload.pair, 'BTCUSDT')
  assert.equal(requests[2].payload.pair, 'BTCUSDT')
  assert.equal(requests[2].payload.contractType, 'PERPETUAL')
})

test('public endpoints are unsigned and receive only supported symbol fields', async () => {
  const urls = []
  const main = {
    endpoint: 'https://example.test/fapi',
    contractName: 'BTCUSDT',
    useServerTime: false,
    engine: 'node',
    API_KEY: 'key',
    API_SECRET: 'secret',
    callbacks: {
      crypto: {
        createHmac: () => {
          throw new Error('Public endpoint must not create a signature')
        }
      },
      fetch: async url => {
        urls.push(url)
        return {status: 200, statusText: 'OK', text: async () => '[]'}
      }
    }
  }

  await universalFetch(main, 'klines', 'GET', {interval: '5m', limit: 1}, 'v1')
  await universalFetch(main, 'indexPriceKlines', 'GET', {pair: 'BTCUSDT', interval: '5m', limit: 1}, 'v1')

  assert.match(urls[0], /symbol=BTCUSDT/)
  assert.doesNotMatch(urls[0], /timestamp|signature|pair=/)
  assert.match(urls[1], /pair=BTCUSDT/)
  assert.doesNotMatch(urls[1], /timestamp|signature|symbol=/)
})

test('algo cancellation signs algoId without adding unsupported symbol', async () => {
  let url
  const main = {
    endpoint: 'https://example.test/fapi',
    contractName: 'BTCUSDT',
    useServerTime: false,
    engine: 'node',
    API_KEY: 'key',
    API_SECRET: 'secret',
    callbacks: {
      crypto,
      fetch: async requestUrl => {
        url = requestUrl
        return {status: 200, statusText: 'OK', text: async () => '{"algoId":42}'}
      }
    }
  }

  await universalFetch(main, 'algoOrder', 'DELETE', {algoId: 42}, 'v1')

  assert.match(url, /algoId=42/)
  assert.match(url, /timestamp=/)
  assert.match(url, /signature=/)
  assert.doesNotMatch(url, /symbol=/)
})

test('close-position payload contains only supported order parameters', async () => {
  let payload
  const main = {
    contractName: 'BTCUSDT',
    debug: false,
    fetch: async (endpoint, method, requestPayload) => {
      assert.deepEqual([endpoint, method], ['order', 'POST'])
      payload = requestPayload
      return {orderId: 99}
    }
  }

  await closePosition({
    main,
    side: 'BUY',
    positions: [{symbol: 'BTCUSDT', positionAmt: '1.25'}]
  })

  assert.equal(payload.side, 'SELL')
  assert.equal(payload.quantity, 1.25)
  assert.equal(payload.reduceOnly, true)
  assert.equal('isolated' in payload, false)
  assert.equal('placeType' in payload, false)
})

test('Web Crypto produces the same HMAC signature as Node crypto', async () => {
  const query = 'symbol=BTCUSDT&timestamp=1'
  const nodeSignature = await getSignature({
    engine: 'node',
    API_SECRET: 'secret',
    callbacks: {crypto}
  }, query)
  const webCryptoSignature = await getSignature({
    engine: 'node',
    API_SECRET: 'secret',
    callbacks: {crypto: crypto.webcrypto}
  }, query)

  assert.equal(webCryptoSignature, nodeSignature)
})

test('reduce-order validation accepts positive prices below 10', () => {
  assert.equal(validateReduceOrders(0.5, 'REPLACE'), undefined)
  assert.throws(() => validateReduceOrders(0, 'REPLACE'), /triggerPrice/)
})
