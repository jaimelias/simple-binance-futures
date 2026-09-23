# AGENTS.md

A JavaScript library for USDT-M trading on Binance Futures, compatible with Node.js and Google Apps Script.

Always respond in English unless the user explicitly requests another language.

## Before Coding

- Read `docs/GOOGLE_APPS_SCRIPT.md` before changing code.

## Architecture

- `index.js` exports `BinanceFutures`. Static public methods default to `production`; symbol-specific calls accept full contract symbols such as `BTCUSDT`. The authenticated constructor takes credentials, strategy, and callbacks.
- `src/utilities/MarketDataClient.js` contains the shared market-data, cache, and cooldown implementation. Trading instances inherit it; instance OHLCV updates `latestPrice` for order sizing, while static calls do not affect trading instances.
- Keep requests in `universalFetch.js` and its runtime adapters. Public requests are unsigned; account and order requests require authentication. Do not automatically retry order submissions.
- Static Node.js calls use native `fetch` or an injected callback. Authenticated Node.js instances require `fetch` and `crypto` callbacks. Apps Script uses `UrlFetchApp` and `Utilities`.
- Source uses ES modules; webpack exposes the Apps Script class as `BinanceFutures.default`. Keep Node-only dependencies out of the bundled library and use function declarations for Apps Script entry points.
- Keep public method signatures explicit; do not add legacy compatibility fallbacks. Update README examples when the API changes.

## Commands and Tests

- `npm test`: run the offline `node:test` suite in `test/*.test.js`.
- `node --test test/ohlcv.test.js`: run a focused suite.
- `npm run build`: generate `dist/google-apps-script-build.js` for Apps Script.
- Reuse `test/helpers.js` for dummy credentials, exchange fixtures, responses, and Apps Script mocks. Intercept all requests and restore mocked globals through the test context; do not load local credentials or submit live orders in tests.
- Test behavior at the static API or authenticated instance boundary. Keep separate coverage for instance price state, signing, funding protection, caching, and cooldowns. Apps Script service mocks do not replace bundle validation.
