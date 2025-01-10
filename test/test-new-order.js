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

//console.log((await exchange.ohlcv({interval: '1m', limit: 1})))

const orders = await exchange.getOrders()


const openedOrder = (Array.isArray(orders))
    ? orders.find(o => o.symbol === exchange.contractName && o.type === 'LIMIT' && o.status === 'NEW')
    : false


console.log(openedOrder)

/* const createLimitOrder = await exchange.createLimitOrder({
  side: 'BUY', 
  amountInUSD: 40, 
  entryPrice: 90000,
  expirationInMinutes: 10,
  handleExistingOrders: 'REPLACE'
}) */



await exchange.modifyLimitOrder({side: 'BUY', newPrice: 95200, order: openedOrder})

//console.log(await exchange.getOrders())