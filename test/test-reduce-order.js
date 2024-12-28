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
  contractName: 'BTCUSDT',
  marginType: 'ISOLATED',
  leverage: 125,
  useServerTime: false,
  debug: true
}

const exchange = new BinanceFutures(CREDENTIALS, STRATEGY)

console.log((await exchange.getServerTime()))

const tp = await exchange.createTakeProfitOrder(100000)
const sl = await exchange.createStopLossOrder(95000)

console.log('sl', sl)
console.log('tp', tp)