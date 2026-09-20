# simple-binance-futures

## Funding-fee protection

Funding protection is opt-in and compares adverse funding rates on a per-hour basis, even when Binance changes the settlement interval:

```js
const exchange = new BinanceFutures(credentials, {
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
}, {
  fetch,
  crypto,
  fundingRiskAlert: event => console.warn(event)
})
```

New limit, stop-limit, market, and modified limit entries are checked immediately before submission. A favorable or zero funding rate does not block an entry. Call `checkFundingRisk()` from a Node scheduler or an Apps Script time-driven trigger to recheck pending orders and open positions:

```js
const result = await exchange.checkFundingRisk()
```

`pendingOrderAction` accepts `IGNORE`, `ALERT`, or `CANCEL`. `openPositionAction` accepts `IGNORE`, `ALERT`, or `CLOSE`; `ALERT` is the safer default because automatically closing a position can cost more than the funding fee.

## Google Apps Script caching

In Google Apps Script, contract information is cached for up to six hours and account-specific leverage brackets for up to ten minutes. The cache is best-effort: missing, expired, or malformed values are fetched from Binance again. Node and other runtimes continue using instance memory without `CacheService`.

## Rate-limit cooldown

Binance responses with status `429` or `418` lock new requests until the `Retry-After` period expires. If Binance omits that header, `rateLimitCoolDownSeconds` is used as the fallback:

```js
const strategy = {
  environment: 'production',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  rateLimitCoolDownSeconds: 60
}
```

The library throws a `RateLimitError` immediately while locked and never retries an order automatically. The error includes `status`, `retryAfterSeconds`, `lockedUntil`, `rateLimitUsage`, and `isLocalCooldown`. Google Apps Script persists the deadline across executions; Node keeps it on the current class instance.
