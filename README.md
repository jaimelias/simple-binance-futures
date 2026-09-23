# simple-binance-futures

A JavaScript client for trading USDT-M perpetual contracts on Binance Futures from Node.js or Google Apps Script. It includes OHLCV queries, order management, leverage calculation, adverse funding protection, and automatic cooldowns when API rate limits are exceeded.

> **Warning:** this library can submit real orders. Start on `testnet`, limit the capital allocated to each trade, and validate every strategy before using `production`. The examples are educational and are not financial advice.

## Features

- Compatible with Node.js and Google Apps Script.
- Static market-data methods without API credentials.
- Market, limit, and stop-limit orders.
- Stop-loss and take-profit orders for open positions.
- Contract, mark price, index price, premium index, and continuous-contract candles.
- Estimated liquidation-level clusters from trade volume and mark-price candles.
- Optional protection against harmful funding rates.
- Handles `429` and `418` responses without automatically retrying orders.
- Contract information and leverage-bracket caching in Google Apps Script.
- Parameter validation before requests are sent to Binance.

The current implementation works in one-way mode (`positionSide: 'BOTH'`). It is not designed for Hedge Mode.

## Installation

```bash
npm install simple-binance-futures
```

The package uses ES modules:

```js
import BinanceFutures, { RateLimitError } from 'simple-binance-futures'
```

To import the repository directly during development:

```js
import BinanceFutures, { RateLimitError } from './index.js'
```

## Public market data without authentication

Call market-data methods directly on the class. No instance, API key, secret, or signing library is needed:

```js
import BinanceFutures from 'simple-binance-futures'

const candles = await BinanceFutures.ohlcv('BTCUSDT', {
  interval: '1h', limit: 200
})

const levels = await BinanceFutures.getLiquidationLevels('BTCUSDT', {
  interval: '1h', limit: 500, step: 50
})

const contract = await BinanceFutures.getContractInfo('BTCUSDT')
```

Static methods take the **full contract symbol**, such as `BTCUSDT`, and default to `production`. Method parameters and connection options are separate arguments:

| Static method | Result |
| --- | --- |
| `BinanceFutures.getServerTime(options)` | Server time in milliseconds. |
| `BinanceFutures.getExchangeInfo(options)` | Exchange metadata. |
| `BinanceFutures.getContractInfo(symbol, options)` | Contract filters and precision. |
| `BinanceFutures.ohlcv(symbol, params, options)` | Normalized candles; `params` can also be a batch array. |
| `BinanceFutures.getLiquidationLevels(symbol, params, options)` | Estimated liquidation clusters. |
| `BinanceFutures.getFundingState(symbol, params, options)` | Funding rate, interval, settlement, and estimated cost. |
| `BinanceFutures.evaluateFundingRisk(state, policy)` | Evaluates a funding state without a request. |
| `BinanceFutures.getRateLimitRemainingSeconds(options)` | Remaining cooldown for static calls. |

All `options` arguments are optional. They accept `environment` (`production` or `testnet`), `proxy` (HTTP(S) base URL without a query or fragment), `callbacks`, `debug`, `rateLimitCoolDownSeconds`, and `fundingFeePolicy`. Funding state uses `fundingFeePolicy.expectedIntervalHours`, defaulting to `8`. To evaluate a state, pass the desired policy explicitly to `evaluateFundingRisk`.

```js
const options = {
  environment: 'testnet',
  callbacks: {errorLogger: message => console.error(message)}
}

const prices = await BinanceFutures.ohlcv('ETHUSDT', [
  {interval: '5m', limit: 100},
  {interval: '1h', limit: 100}
], options)
```

To route OHLCV through a proxy, pass lowercase `proxy` in the third argument:

```js
const marketOptions = {
  environment: 'testnet',
  proxy: 'https://my-proxy.example.com'
}

const candles = await BinanceFutures.ohlcv(
  'BTCUSDT',
  {interval: '1h', limit: 100},
  marketOptions
)
```

The library appends `/fapi/v1/klines` and the query parameters to the proxy URL. Supply the base URL without `/fapi`. Without a proxy, `environment` selects Binance production or testnet; omitting `environment` defaults to production. **A supplied proxy overrides the Binance base URL.** Configure the proxy itself to forward to the intended Binance environment; the `environment` option does not select the proxy's destination.

Reuse `marketOptions` for subsequent calls. In Google Apps Script, use the same arguments with `BinanceFutures.default.ohlcv(...)`.

Node.js uses its global `fetch` by default for static calls; supply `options.callbacks.fetch` to inject another Fetch implementation. Google Apps Script uses `UrlFetchApp`. Connection options and callbacks belong to each call; there is no global configuration to switch between symbols or environments.

Trading instances inherit the same market-data implementation and use their configured contract. `exchange.ohlcv(params)` updates that instance's `latestPrice` for order sizing; a static call has no effect on a trading instance. Account data, leverage brackets, and order actions require an authenticated instance.

## Node.js trading quick start

Keep credentials outside your source code, for example in a `.env` file that is not committed to Git:

```env
BINANCE_TESTNET_API_KEY=your_api_key
BINANCE_TESTNET_API_SECRET=your_api_secret
```

```js
import 'dotenv/config'
import crypto from 'node:crypto'
import BinanceFutures from 'simple-binance-futures'

const credentials = {
  testnet: {
    API_KEY: process.env.BINANCE_TESTNET_API_KEY,
    API_SECRET: process.env.BINANCE_TESTNET_API_SECRET
  }
}

const strategy = {
  environment: 'testnet',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  marginType: 'ISOLATED',
  useServerTime: true,
  useMarkPrice: true,
  debug: false,
  rateLimitCoolDownSeconds: 60
}

const exchange = new BinanceFutures(credentials, strategy, {
  fetch,
  crypto,
  errorLogger: message => console.error('[Binance]', message)
})

const candles = await exchange.ohlcv({
  interval: '5m',
  limit: 100,
  klineType: 'markPriceKlines'
})

console.log(candles.at(-1))
```

In Node.js, `callbacks.fetch` must implement the standard Fetch API and `callbacks.crypto` must expose `createHmac` or Web Crypto. Modern Node.js versions already provide global `fetch`; the `node:crypto` module satisfies the second requirement.

## Constructor

```js
const exchange = new BinanceFutures(credentials, strategy, callbacks)
```

### `credentials`

Credentials are grouped by environment. You only need to configure the environment selected by the strategy.

```js
const credentials = {
  testnet: {
    API_KEY: '...',
    API_SECRET: '...'
  },
  production: {
    API_KEY: '...',
    API_SECRET: '...',
    // Optional: the final endpoint will be `${PROXY}/fapi`.
    PROXY: 'https://my-proxy.example.com'
  }
}
```

### `strategy`

| Property | Type | Description |
| --- | --- | --- |
| `environment` | `'testnet' \| 'production'` | Binance environment. Required. |
| `symbol` | `string` | Uppercase base asset, such as `BTC`. Required. |
| `settlementCurrency` | `string` | Settlement currency, usually `USDT`. Required. |
| `marginType` | `'ISOLATED' \| 'CROSSED'` | Margin type. Defaults to `ISOLATED`. |
| `useServerTime` | `boolean` | Uses Binance server time when signing requests and calculating expirations. |
| `useMarkPrice` | `boolean` | Uses `MARK_PRICE` as the trigger price; otherwise uses `CONTRACT_PRICE`. |
| `debug` | `boolean` | Logs payloads and responses that are useful for diagnostics. |
| `balance` | `number` | Optional initial balance to avoid the first balance request. |
| `exchangeInfo` | `object` | Optional preloaded exchange information. |
| `contractInfo` | `object` | Optional preloaded and validated contract information. |
| `leverageBracket` | `object` | Optional preloaded leverage brackets. |
| `rateLimitCoolDownSeconds` | `integer` | Fallback lock duration when Binance omits `Retry-After`. Defaults to `60`. |
| `fundingFeePolicy` | `object` | Optional funding-fee protection policy. |

The final contract name is formed by concatenating `symbol` and `settlementCurrency`; with the values above, it is `BTCUSDT`.

### `callbacks`

| Callback | Environment | Purpose |
| --- | --- | --- |
| `fetch` | Node.js and other runtimes | Standard Fetch implementation. |
| `crypto` | Node.js and other runtimes | HMAC signing through Node Crypto or Web Crypto. |
| `errorLogger` | All, optional | Receives error messages caught by public methods. |
| `fundingRiskAlert` | All, optional | Receives funding-risk events. It may be asynchronous. |

## Basic order flow

Set the leverage before opening a position. `amountInUSD` represents the margin you want to allocate, and the approximate position size will be `amountInUSD × leverage`.

```js
const amountInUSD = 25
const requestedLeverage = 3
const notional = amountInUSD * requestedLeverage

const appliedLeverage = await exchange.changeLeverage(
  requestedLeverage,
  notional
)

console.log(`Applied leverage: ${appliedLeverage}x`)

const order = await exchange.createMarketOrder({
  side: 'BUY',
  amountInUSD
})
```

`changeLeverage()` checks the contract limits and lowers the requested value when it exceeds the leverage allowed for that notional.

## Market data

### `BinanceFutures.ohlcv(symbol, params, options)`

Fetches candles and returns normalized objects:

```js
const candles = await BinanceFutures.ohlcv('BTCUSDT', {
  interval: '1h',
  limit: 200,
  klineType: 'klines'
})

// {
//   open: 64000,
//   high: 64500,
//   low: 63800,
//   close: 64300,
//   date: 1790085600000, // candle opening time in epoch milliseconds
//   volume: 1234.56
// }
```

Parameters:

| Property | Values |
| --- | --- |
| `interval` | `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M` |
| `limit` | Integer from `1` to `1500`. |
| `startTime`, `endTime` | Epoch in **milliseconds**, a `Date` object, or an ISO 8601 string with an explicit timezone. |
| `klineType` | `klines`, `continuousKlines`, `indexPriceKlines`, `markPriceKlines`, `premiumIndexKlines` |
| `contractType` | For `continuousKlines`: `PERPETUAL`, `CURRENT_QUARTER`, `NEXT_QUARTER`, or `TRADIFI_PERPETUAL`. |

Unix timestamps in seconds are not valid. Use `Date.now()`, not `Math.floor(Date.now() / 1000)`. A date string must include `Z` or an offset such as `-05:00`:

```js
const historical = await BinanceFutures.ohlcv('BTCUSDT', {
  interval: '1h',
  startTime: '2026-09-01T00:00:00Z',
  endTime: '2026-09-02T00:00:00Z',
  klineType: 'klines'
})
```

You can also request multiple intervals. Do not repeat an interval within the same batch:

```js
const prices = await BinanceFutures.ohlcv('BTCUSDT', [
  {interval: '5m', limit: 100, klineType: 'markPriceKlines'},
  {interval: '1h', limit: 100, klineType: 'markPriceKlines'}
])

console.log(prices['5m'], prices['1h'])
```

`volume` is only included for `klines` and `continuousKlines`. When using the instance method `exchange.ohlcv(params)`, recent requests update `exchange.latestPrice`; historical requests and `premiumIndexKlines` do not overwrite it.

### `BinanceFutures.getLiquidationLevels(symbol, params, options)`

Estimates potential liquidation clusters for the requested symbol. This uses traded base-asset volume as a **score**, not as open position size or liquidation volume. It assumes equal long/short and leverage shares, a fixed maintenance margin rate, and isolated margin with no added collateral or fees. Binance does not disclose each trader's entry, leverage, margin, or position lifecycle through candle data, so these levels are not actual positions or a Coinglass/Hyblock heatmap. Do not use the scores as a risk or order-sizing measure.

```js
const levels = await BinanceFutures.getLiquidationLevels('BTCUSDT', {
  interval: '1h',
  limit: 500,
  step: 50, // USDT per bucket; omit for 0.1% of the latest closed mark price
  leverages: [5, 10, 25, 50, 100],
  maintenanceMarginRate: 0.004,
  top: 10
})

// { method: 'volumeProxy', step: 50, candleCount: 500,
//   longLiquidations: [{price: ..., score: ...}],
//   shortLiquidations: [{price: ..., score: ...}] }
```

The method fetches regular and mark-price candles through the existing Binance client. It uses the mark-price close as the hypothetical entry, tests later mark-price highs/lows for a level touch, and excludes the current open candle as an entry source while using its observed range to invalidate older levels. `step` is an absolute price bucket width; `top` limits each side. The default leverage set is `[5, 10, 25, 50, 100]`, and the default maintenance margin rate is `0.004`. The fixed rate is only an assumption; actual maintenance rates and amounts vary by notional bracket and account state.

## Account and leverage

These methods use an authenticated trading instance.

| Method | Result |
| --- | --- |
| `getBalance(reloadBalances = true)` | Settlement-currency balance. With `false`, reuses the in-memory balance when available. |
| `getPositions()` | Positions returned by Binance for the account. |
| `getParsedPositions()` | Contract positions grouped into `{BUY, SELL}`. |
| `getLeverageBracket()` | Account and contract leverage brackets. |
| `getMaxLevarage(notional)` | Maximum leverage for a notional. The name preserves the current API spelling. |
| `changeLeverage(leverage, notional)` | Applies the smaller of the requested and allowed values. |
| `changeMarginType()` | Changes the contract to the strategy's `marginType`. The position must be closed. |

## Entry orders

### Market order

```js
await exchange.createMarketOrder({
  side: 'BUY',
  amountInUSD: 25
})
```

### Limit order

```js
const [last] = (await exchange.ohlcv({
  interval: '1m',
  limit: 1,
  klineType: 'markPriceKlines'
})).slice(-1)

await exchange.createLimitOrder({
  side: 'BUY',
  amountInUSD: 25,
  entryPrice: last.close * 0.995,
  handleExistingOrders: 'REPLACE',
  expirationInMinutes: 15
})
```

For safety, a `BUY` limit must be below the latest known price, and a `SELL` limit must be above it. `ignoreImmediateExecErr: true` disables only this check.

`expirationInMinutes` creates a `GTD` order and must be at least `10.1`. The default is `10.1`.

### Stop-limit order

```js
const stopReference = (await exchange.ohlcv({
  interval: '1m',
  limit: 1,
  klineType: 'markPriceKlines'
})).at(-1).close

await exchange.createStopLimitOrder({
  side: 'BUY',
  amountInUSD: 25,
  stopPrice: stopReference * 1.01,
  limitPrice: stopReference * 1.011,
  handleExistingOrders: 'REPLACE',
  expirationInMinutes: 15
})
```

A `BUY` stop-limit needs a `stopPrice` above the latest price; a `SELL` stop-limit needs one below it.

### Modify a limit order

```js
await exchange.modifyLimitOrder({
  orders: await exchange.getOrders(),
  side: 'BUY',
  entryPrice: last.close * 0.99,
  expirationInMinutes: 15
})
```

If `orders` is omitted or is an empty array, the method fetches open orders. It returns `false` when the price adjusted to `tickSize` has not changed.

### Handling existing orders

Limit and stop-limit orders accept:

- `ADD`: creates another order; this is the default.
- `KEEP`: preserves the existing order and does not create a new one.
- `ERROR`: throws an error when an equivalent order is found.
- `REPLACE`: cancels existing orders before creating the new one.

Passing `orders` from a previous query avoids duplicate requests when you already have that information.

## Protecting a position

After an entry is filled, you can create conditional exit orders:

```js
const positions = await exchange.getPositions()
const position = positions.find(item => (
  item.symbol === exchange.contractName && Number(item.positionAmt) !== 0
))

if (position) {
  const isLong = Number(position.positionAmt) > 0
  const entryPrice = Number(position.entryPrice)

  await exchange.createStopLossOrder({
    triggerPrice: isLong ? entryPrice * 0.98 : entryPrice * 1.02,
    handleExistingOrders: 'REPLACE',
    positions
  })

  await exchange.createTakeProfitOrder({
    triggerPrice: isLong ? entryPrice * 1.04 : entryPrice * 0.96,
    handleExistingOrders: 'REPLACE',
    positions
  })
}
```

For stop-loss and take-profit orders, `handleExistingOrders` accepts `KEEP`, `ERROR`, and `REPLACE`. The orders use `closePosition: true` and `priceProtect: true`.

> If the protection trigger is on the wrong side of the entry price, or Binance does not confirm that the protective order was created, the method attempts to close the position. Treat these errors as critical.

To close a position manually:

```js
await exchange.closePosition({
  positions,
  side: 'BUY' // BUY means the existing position is long
})
```

`side` describes the position being closed: `BUY` for a long and `SELL` for a short. The method sends the opposite order with `reduceOnly: true`.

## Querying and cancelling orders

| Method | Description |
| --- | --- |
| `getOrders()` | Gets open regular orders. |
| `getAlgoOrders()` | Gets open conditional orders. |
| `getParsedOrders()` | Groups entries, stop-losses, and take-profits by side. |
| `cancelOrder({orderId})` | Cancels a regular order. |
| `cancelAlgoOrder({algoId})` | Cancels a conditional order. |
| `cancelMultipleOrders(orders)` | Cancels several regular orders by `orderId`. |
| `cancelAllOpenedOrders()` | Cancels regular and conditional orders for the contract. |

## Funding-fee protection

Funding protection is optional. It evaluates adverse funding only: a positive rate harms a long (`BUY`) position, while a negative rate harms a short (`SELL`) position. The rate is normalized per hour so intervals of 8, 4, 2, or 1 hour can be compared consistently.

```js
const strategy = {
  environment: 'production',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  fundingFeePolicy: {
    enabled: true,
    expectedIntervalHours: 8,
    maxFundingRatePerHour: 0.0000625,
    maxFundingRatePerSettlement: 0.0005,
    entryBlackoutMinutes: 2,
    postFundingBufferSeconds: 30,
    pendingOrderAction: 'CANCEL',
    openPositionAction: 'ALERT'
  }
}
```

Rates are decimals: `0.0000625` equals `0.00625%` per hour.

| Property | Description |
| --- | --- |
| `enabled` | Enables protection. Defaults to `false`. |
| `expectedIntervalHours` | Expected interval as a positive integer. For BTC, this is normally set to `8`. |
| `maxFundingRatePerHour` | Maximum allowed adverse rate per hour. Required when the policy is enabled. |
| `maxFundingRatePerSettlement` | Additional per-settlement limit; `null` disables it. |
| `entryBlackoutMinutes` | Blocks entries shortly before settlement. |
| `postFundingBufferSeconds` | Keeps the block active briefly after the expected settlement time. |
| `pendingOrderAction` | `IGNORE`, `ALERT`, or `CANCEL`. |
| `openPositionAction` | `IGNORE`, `ALERT`, or `CLOSE`. |

Related methods:

| Method | Description |
| --- | --- |
| `getFundingState({side, quantity, positionNotional})` | Gets the rate, interval, next settlement, and estimated cost. |
| `evaluateFundingRisk(state)` | Evaluates an already-fetched state without another request. |
| `assertFundingEntryAllowed(params)` | Throws when an entry violates the policy. Entry actions call it automatically. |
| `checkFundingRisk({orders, algoOrders, positions})` | Checks existing orders and positions, then performs the configured actions. |

New market, limit, and stop-limit orders, as well as limit-order modifications, are checked immediately before submission. To inspect the state:

```js
const state = await exchange.getFundingState({
  side: 'BUY',
  positionNotional: 100
})

const decision = exchange.evaluateFundingRisk(state)
console.log(decision.allowed, decision.reasons)
```

To monitor pending orders and open positions, run this periodically:

```js
const result = await exchange.checkFundingRisk()
console.log(result.actions)
```

If the funding interval changes, the decision includes `FUNDING_INTERVAL_CHANGED` as a warning. If risk exceeds the policy, the method can alert, cancel pending entries, or close positions according to the configuration. `ALERT` is the cautious choice for open positions because closing automatically may cost more than the avoided funding fee.

Callback example:

```js
const callbacks = {
  fetch,
  crypto,
  fundingRiskAlert: event => {
    console.warn('[Funding risk]', JSON.stringify(event, null, 2))
  }
}
```

## Rate limits

When Binance responds with `429` or `418`, subsequent requests are blocked until the `Retry-After` period ends. If that header is absent, the library uses `rateLimitCoolDownSeconds`.

```js
try {
  await exchange.getPositions()
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error(`Wait ${error.retryAfterSeconds} seconds`)
    console.error('Locked until:', new Date(error.lockedUntil))
    console.error('Observed usage:', error.rateLimitUsage)
  } else {
    throw error
  }
}
```

A `RateLimitError` exposes:

- `code`: `BINANCE_RATE_LIMIT`.
- `status`: `429` or `418`.
- `retryAfterSeconds` and `lockedUntil`.
- `rateLimitUsage`: observed `X-MBX-USED-WEIGHT-*` and `X-MBX-ORDER-COUNT-*` headers.
- `isLocalCooldown`: `true` when the request was stopped locally.

The library does not automatically retry an order because doing so could duplicate a trade. In Node.js, trading instances keep their own cooldown. Static calls share a cooldown per endpoint, including across different symbols. In Google Apps Script, cooldowns are also shared across executions through `CacheService` and `PropertiesService`.

You can also inspect the cooldown without making a request:

```js
const publicRemaining = BinanceFutures.getRateLimitRemainingSeconds({environment: 'testnet'})
const accountRemaining = exchange.getRateLimitRemainingSeconds()
```

## Simple strategies

The examples use `BTC`, one position at a time, and closed candles. Run them on `testnet` first. In production, you must also account for fees, slippage, latency, minimum order size, and consecutive losses.

### 1. Simple moving-average crossover

Opens a long when the fast average crosses above the slow average, and a short on the opposite crossover.

```js
const average = values => (
  values.reduce((sum, value) => sum + value, 0) / values.length
)

async function movingAverageCross(exchange) {
  const candles = await exchange.ohlcv({
    interval: '15m',
    limit: 52,
    klineType: 'markPriceKlines'
  })

  // Discard the current candle because it may still be open.
  const closes = candles.slice(0, -1).map(candle => candle.close)
  const previous = closes.slice(0, -1)
  const fastWas = average(previous.slice(-9))
  const slowWas = average(previous.slice(-21))
  const fastNow = average(closes.slice(-9))
  const slowNow = average(closes.slice(-21))

  const positions = await exchange.getPositions()
  const hasPosition = positions.some(position => (
    position.symbol === exchange.contractName &&
    Number(position.positionAmt) !== 0
  ))

  if (hasPosition) return {action: 'HOLD'}

  let side = null
  if (fastWas <= slowWas && fastNow > slowNow) side = 'BUY'
  if (fastWas >= slowWas && fastNow < slowNow) side = 'SELL'
  if (!side) return {action: 'HOLD'}

  const amountInUSD = 25
  const leverage = 2
  await exchange.changeLeverage(leverage, amountInUSD * leverage)
  const order = await exchange.createMarketOrder({side, amountInUSD})

  return {action: side, order}
}
```

### 2. Range breakout

Enters when the latest closed candle breaks the high or low of the previous 20 closed candles.

```js
async function rangeBreakout(exchange) {
  const candles = await exchange.ohlcv({
    interval: '1h',
    limit: 22,
    klineType: 'markPriceKlines'
  })

  const closed = candles.slice(0, -1)
  const signalCandle = closed.at(-1)
  const previousRange = closed.slice(-21, -1)
  const rangeHigh = Math.max(...previousRange.map(candle => candle.high))
  const rangeLow = Math.min(...previousRange.map(candle => candle.low))

  let side = null
  if (signalCandle.close > rangeHigh) side = 'BUY'
  if (signalCandle.close < rangeLow) side = 'SELL'
  if (!side) return {action: 'HOLD'}

  const parsedPositions = await exchange.getParsedPositions()
  if (parsedPositions.BUY.length || parsedPositions.SELL.length) {
    return {action: 'HOLD'}
  }

  const amountInUSD = 25
  const leverage = 2
  await exchange.changeLeverage(leverage, amountInUSD * leverage)

  return {
    action: side,
    order: await exchange.createMarketOrder({side, amountInUSD})
  }
}
```

### 3. Limit buy on a pullback

Places a limit order below the latest close and replaces an earlier entry on the same side:

```js
async function buyPullback(exchange) {
  const candles = await exchange.ohlcv({
    interval: '5m',
    limit: 50,
    klineType: 'markPriceKlines'
  })

  const closed = candles.slice(0, -1)
  const closes = closed.map(candle => candle.close)
  const trend = average(closes.slice(-20)) > average(closes.slice(-40))

  if (!trend) return {action: 'HOLD'}

  const amountInUSD = 25
  const leverage = 2
  const referencePrice = closed.at(-1).close

  await exchange.changeLeverage(leverage, amountInUSD * leverage)

  const order = await exchange.createLimitOrder({
    side: 'BUY',
    amountInUSD,
    entryPrice: referencePrice * 0.995,
    handleExistingOrders: 'REPLACE',
    expirationInMinutes: 15
  })

  return {action: 'BUY_LIMIT', order}
}
```

These functions represent a single evaluation. Schedule them outside the strategy and avoid running two instances at the same time.

## Google Apps Script

Generate the bundle:

```bash
npm run build
```

Copy the contents of `dist/google-apps-script-build.js` into a `.gs` file. Webpack exposes a global object named `BinanceFutures`; the class is available as `BinanceFutures.default`.

For public data, call the static methods on `BinanceFutures.default`:

```js
async function readPublicMarketData() {
  var candles = await BinanceFutures.default.ohlcv('BTCUSDT', {
    interval: '1h', limit: 100
  })
  var levels = await BinanceFutures.default.getLiquidationLevels('BTCUSDT', {
    interval: '1h', step: 50
  })
  console.log(candles[candles.length - 1], levels)
}
```

This path needs no credentials, crypto callback, or timezone setup. For trading, store credentials in Script Properties:

```js
function createExchange() {
  var properties = PropertiesService.getScriptProperties()
  var credentials = {
    testnet: {
      API_KEY: properties.getProperty('BINANCE_TESTNET_API_KEY'),
      API_SECRET: properties.getProperty('BINANCE_TESTNET_API_SECRET')
    }
  }

  return new BinanceFutures.default(credentials, {
    environment: 'testnet',
    symbol: 'BTC',
    settlementCurrency: 'USDT',
    marginType: 'ISOLATED',
    useServerTime: true,
    useMarkPrice: true,
    rateLimitCoolDownSeconds: 60
  }, {
    errorLogger: function (message) {
      console.error(message)
    },
    fundingRiskAlert: function (event) {
      console.warn(JSON.stringify(event))
    }
  })
}

async function runStrategy() {
  return await executeStrategy()
}

async function executeStrategy() {
  var exchange = createExchange()
  var candles = await exchange.ohlcv({
    interval: '5m',
    limit: 20,
    klineType: 'markPriceKlines'
  })

  console.log(candles[candles.length - 1])
}
```

Set the Apps Script project timezone to `(GMT+00:00) Coordinated Universal Time`; the constructor stops execution when the timezone is not `Etc/UTC`.

In this environment:

- Do not pass `fetch` or `crypto`: the library uses `UrlFetchApp` and `Utilities`.
- Contract information is cached for up to 6 hours.
- Leverage brackets are cached for up to 10 minutes.
- Rate-limit state is shared across executions.
- Use `LockService` in the strategy entry point to prevent concurrent executions.
- Triggers have a limited runtime, so keep each evaluation short.

Example mutual exclusion for a trigger:

```js
async function scheduledStrategy() {
  var lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) return

  try {
    return await executeStrategy()
  } finally {
    lock.releaseLock()
  }
}
```

## Errors and operational safety

All trading methods throw errors. Wrap calls in `try/catch` and log the relevant context. Minimum recommendations:

- Use API keys without withdrawal permissions and restrict them by IP whenever possible.
- Start on `testnet` and use small amounts.
- Do not run parallel strategies on the same symbol and account without coordination.
- Check whether a position already exists before opening another one.
- Protect a filled entry with a stop-loss and verify that Binance confirms the order.
- Call `checkFundingRisk()` periodically when the funding policy is enabled.
- When network state is uncertain, query existing orders before repeating an operation.
- Avoid `openPositionAction: 'CLOSE'` until you have thoroughly tested its consequences.

## Development and testing

```bash
# Run the offline suite
npm test

# Run one focused suite
node --test test/static-market-data.test.js

# Regenerate the Google Apps Script bundle
npm run build
```

The tests use Node's built-in test runner, dummy credentials, and mocked requests. `npm test` requires no Binance credentials and submits no live orders.

Tests cover static market data, authenticated signing and order payloads, funding protection, candle and liquidation calculations, validation, caches, and cooldowns. Shared fixtures and Apps Script service mocks live in `test/helpers.js`; Apps Script deployment still requires generating and checking the bundle.

## License

ISC
