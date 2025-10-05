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
  leverage: Infinity,
  useServerTime: false,
  debug: true,
  useMarkPrice: false
}

const errorLogger = async (message) => {
  console.error(message)
  return false
}

const CALLBACKS = {fetch, crypto, errorLogger}

const exchange = new BinanceFutures(CREDENTIALS, STRATEGY, CALLBACKS)

const amountInUSD = 10000
//console.log((await exchange.ohlcv({limit: 400, interval: '5m'})).at(-1))

//console.log(new Date(await exchange.getServerTime()).getMinutes())

//console.log(await exchange.getMaxLevarage(125))



console.log(await exchange.changeLeverage(50, amountInUSD))

console.log(await exchange.getMaxLevarage(amountInUSD))

console.log(exchange.leverage)

await exchange.createStopLimitOrder({
    side: 'SELL', 
    amountInUSD, 
    stopPrice: 100000,
    limitPrice: 101000,
    expirationInMinutes: 10,
    handleExistingOrders: 'REPLACE',
    ignoreImmediateExecErr: false
})

/* await exchange.createTakeProfitOrder({
  triggerPrice: 99000,
  side: 'SELL',
  handleExistingOrders: 'KEEP'
})

await exchange.createStopLossOrder({
  triggerPrice: 102000,
  side: 'SELL',
  handleExistingOrders: 'KEEP'
}) */

console.log((await exchange.getParsedOrders()).orders)