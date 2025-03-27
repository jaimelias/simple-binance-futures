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
  debug: true,
  useMarkPrice: false
}

const errorLogger = async (message) => {
  console.error(message)
  return false
}

const CALLBACKS = {fetch, crypto, errorLogger}

const exchange = new BinanceFutures(CREDENTIALS, STRATEGY, CALLBACKS)

//console.log(JSON.stringify(await exchange.getContractInfo()))

//console.log((await exchange.ohlcv({interval: '5m', limit: 100, klineType: 'indexPriceKlines'})).slice(-1))

//console.log(positions)

/*  const createStopLimitOrder = await exchange.createLimitOrder({
    side: 'BUY', 
    amountInUSD: 15, 
    entryPrice: 70000,
    fraction: 0.001,
    expirationInMinutes: 10,
    handleExistingOrders: 'REPLACE',
    ignoreImmediateExecErr: false
})  */

console.log(await exchange.getTradingData([{interval: '5m', limit: 100, klineType: 'indexPriceKlines'}]))