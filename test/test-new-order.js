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

console.log(JSON.stringify(await exchange.getContractInfo()))

//console.log((await exchange.ohlcv({interval: '1m', limit: 1})))



//await exchange.cancelAllOpenedOrders()

//const positions = await exchange.getPositions()
//const orders = await exchange.getOrders()

//console.log(positions)

/*  const createLimitOrder = await exchange.createLimitOrder({
  side: 'BUY', 
  amountInUSD: 40.545454523231434342, 
  entryPrice: 90000.04545645434354545,
  expirationInMinutes: 10,
  handleExistingOrders: 'REPLACE'
})  */

//console.log(createLimitOrder)

const orders = await exchange.getOrders()
//console.log(orders)

await exchange.modifyLimitOrder({side: 'BUY', entryPrice: 95000, orders})

//console.log(await exchange.getOrders())