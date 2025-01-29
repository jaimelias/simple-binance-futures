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
  leverage: 50,
  useServerTime: false,
  debug: true
}

const errorLogger = message => {
  console.error(message)
  console.error(message)
  console.error(message)
  console.error(message)
}

const CALLBACKS = {fetch, crypto, errorLogger}

const exchange = new BinanceFutures(CREDENTIALS, STRATEGY, CALLBACKS)

//console.log(JSON.stringify(await exchange.getContractInfo()))

//console.log((await exchange.ohlcv({interval: '5m', limit: 100, klineType: 'indexPriceKlines'})).slice(-1))

//console.log(positions)


/* const createStopLimitOrder = await exchange.createLimitOrder({
    side: 'BUY', 
    amountInUSD: 15, 
    entryPrice: 95000,
    fraction: 0.001,
    expirationInMinutes: 10,
    handleExistingOrders: 'REPLACE',
    ignoreImmediateExecErr: false
}) */

const orders = await exchange.getOrders()
console.log(orders)

await exchange.modifyLimitOrder({side: 'BUY', entryPrice: 96000, orders})

//console.log(await exchange.getOrders())