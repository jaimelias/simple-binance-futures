import BinanceFutures from "../index.js"
import { CREDENTIALS } from "./test-credentials.js"
import crypto from 'node:crypto'

/* 

  CREDENTIALS = {
      testnet: {
        API_KEY: '',
        API_SECRET: '',
        PROXY: ''
      },
      production: {
        API_KEY: '',
        API_SECRET: '',
        PROXY: ''
      }
  }

*/

const STRATEGY = {
  environment: 'testnet',
  symbol: 'BTC',
  settlementCurrency: 'USDT',
  marginType: 'ISOLATED',
  leverage: 125,
  useServerTime: false,
  debug: false
}

const errorLogger = message => console.error(message)

const CALLBACKS = {fetch, crypto, errorLogger}
const exchange = new BinanceFutures(CREDENTIALS, STRATEGY, CALLBACKS)

console.log((await exchange.getServerTime()))

await exchange.createTakeProfitOrder({triggerPrice: 109000, handleExistingOrders: 'REPLACE'})
await exchange.createStopLossOrder({triggerPrice: 90000, handleExistingOrders: 'REPLACE'})
//await exchange.closePosition({side: 'SELL'})