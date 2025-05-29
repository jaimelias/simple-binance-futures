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
  symbol: 'PAXG',
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

const amountInUSD = 150
//console.log((await exchange.ohlcv({limit: 400, interval: '5m'})).at(-1))

//console.log(new Date(await exchange.getServerTime()).getMinutes())

//console.log(await exchange.getMaxLevarage(125))



await exchange.changeLeverage(50, amountInUSD)

console.log(await exchange.getMaxLevarage(2500))

await exchange.createLimitOrder({
    side: 'BUY', 
    amountInUSD, 
    entryPrice: 2500,
    expirationInMinutes: 10,
    handleExistingOrders: 'REPLACE',
    ignoreImmediateExecErr: false
})

//await exchange.changeLeverage()
//await exchange.changeMarginType()