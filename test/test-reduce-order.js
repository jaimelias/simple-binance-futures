import BinanceFutures from "../index.js"
import { CREDENTIALS } from "./test-credentials.js"


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

const exchange = new BinanceFutures(CREDENTIALS, STRATEGY)

console.log((await exchange.getServerTime()))

const tp = await exchange.createTakeProfitOrder({triggerPrice: 100000, handleExistingOrders: 'REPLACE'})
const sl = await exchange.createStopLossOrder({triggerPrice: 95000, handleExistingOrders: 'KEEP'})

//console.log('sl', sl)
console.log('tp', tp)