import assert from 'node:assert/strict'
import test from 'node:test'
import {createExchange, contractInfo} from './helpers.js'

const tradingExchange = () => {
  const exchange = createExchange({strategy: {contractInfo, useMarkPrice: true}})
  exchange.leverage = 2
  exchange.latestPrice = 100
  return exchange
}

// Requests are intercepted before transport; these tests never submit orders.
test('a market order loads the instance price before sizing its quantity', async t => {
  const exchange = tradingExchange()
  exchange.latestPrice = 0
  const fetch = t.mock.method(exchange, 'fetch', async endpoint => (
    endpoint === 'markPriceKlines'
      ? [[1700000000000, '100', '101', '99', '100', '0']]
      : {orderId: 1}
  ))
  assert.deepEqual(await exchange.createMarketOrder({side: 'BUY', amountInUSD: 50}), {orderId: 1})
  assert.equal(exchange.latestPrice, 100)
  assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]), ['markPriceKlines', 'order'])
  assert.deepEqual(fetch.mock.calls[1].arguments, ['order', 'POST', {
    side: 'BUY', type: 'MARKET', quantity: 1, closePosition: false, reduceOnly: false
  }])
})

test('limit modification submits the remaining quantity and skips an unchanged price', async t => {
  const exchange = tradingExchange()
  const fetch = t.mock.method(exchange, 'fetch', async () => ({orderId: 1}))
  const orders = [{symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', orderId: 1,
    origQty: '2', executedQty: '0.5', price: '90'}]
  assert.equal(await exchange.modifyLimitOrder({side: 'BUY', entryPrice: 90, orders}), false)
  assert.equal(fetch.mock.callCount(), 0)
  await exchange.modifyLimitOrder({side: 'BUY', entryPrice: 85, orders})
  const [endpoint, method, payload] = fetch.mock.calls[0].arguments
  assert.equal(endpoint, 'order')
  assert.equal(method, 'PUT')
  assert.equal(payload.quantity, 1.5)
  assert.equal(payload.price, 85)
})

for (const [method, type, triggerPrice] of [
  ['createStopLossOrder', 'STOP_MARKET', 95],
  ['createTakeProfitOrder', 'TAKE_PROFIT_MARKET', 105]
]) {
  test(`${method} creates a conditional exit for the whole position`, async t => {
    const exchange = tradingExchange()
    const fetch = t.mock.method(exchange, 'fetch', async () => ({algoId: 1}))
    await exchange[method]({
      triggerPrice, handleExistingOrders: 'REPLACE', orders: [],
      positions: [{symbol: 'BTCUSDT', positionAmt: '1', entryPrice: '100'}]
    })
    assert.deepEqual(fetch.mock.calls[0].arguments, ['algoOrder', 'POST', {
      algoType: 'CONDITIONAL', side: 'SELL', positionSide: 'BOTH', type,
      triggerPrice, workingType: 'MARK_PRICE', closePosition: true, priceProtect: true
    }])
  })
}

test('closing a short position submits only a reduce-only buy', async t => {
  const exchange = tradingExchange()
  const fetch = t.mock.method(exchange, 'fetch', async () => ({orderId: 1}))
  await exchange.closePosition({side: 'SELL', positions: [{symbol: 'BTCUSDT', positionAmt: '-2'}]})
  assert.deepEqual(fetch.mock.calls[0].arguments, ['order', 'POST', {
    symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 2, reduceOnly: true, positionSide: 'BOTH'
  }])
})
