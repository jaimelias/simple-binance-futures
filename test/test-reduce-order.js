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
  debug: true
}

const exchange = new BinanceFutures(CREDENTIALS, STRATEGY)

console.log((await exchange.getServerTime()))

//await exchange.createTakeProfitOrder({triggerPrice: 90000, handleExistingOrders: 'REPLACE'})
//await exchange.createStopLossOrder({triggerPrice: 100000, handleExistingOrders: 'REPLACE'})
await exchange.closePosition({initialSide: 'SELL'})