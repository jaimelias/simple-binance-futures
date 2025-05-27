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


console.log(await exchange.getParsedPositions())

/* await exchange.createLimitOrder({
    side: 'SELL', 
    amountInUSD: 15, 
    entryPrice: 101000,
    fraction: 0.001,
    expirationInMinutes: 10,
    handleExistingOrders: 'REPLACE',
    ignoreImmediateExecErr: false
}) */

//await exchange.changeLeverage()
//await exchange.changeMarginType()