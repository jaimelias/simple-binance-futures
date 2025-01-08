import { validateCredentials, validateEnvironment, validateStrategy, validateOhlcv } from './src/utilities/validators.js'
import {getEngine, universalFetch} from './src/utilities/universalFetch.js'
import { createLimitOrder } from './src/actions/createLimitOrder.js'
import { createTakeProfitOrder } from './src/actions/createTakeProfitOrder.js'
import { createStopLossOrder } from './src/actions/createStopLossOrder.js'
import { millisecondsToDateStr } from './src/utilities/utilities.js'


export const defaultEndpoints = {
    testnet: 'https://testnet.binancefuture.com',
    production: 'https://fapi.binance.com'
}

export default class BinanceFutures {

    constructor(credentials, strategy) {
  
      validateStrategy(strategy)
  
      const {settlementCurrency, symbol, leverage, marginType = 'ISOLATED', environment, debug = false,  useServerTime = false,} = strategy
  
      validateEnvironment(environment)
      validateCredentials(credentials, environment)
  
      const { API_KEY, API_SECRET, PROXY } = credentials[environment];
      this.API_KEY = API_KEY;
      this.API_SECRET = API_SECRET;
      this.endpoint = (typeof PROXY === 'string' && PROXY.startsWith('http')) 
        ? `${PROXY}/fapi`
        : `${defaultEndpoints[environment]}/fapi`
  

      this.settlementCurrency = settlementCurrency
      this.contractName = `${symbol}${settlementCurrency}`
      this.leverage = leverage
      this.marginType = marginType
      this.useServerTime = useServerTime
      this.environment = environment
      this.debug = debug
      
      this.engine = getEngine()
      this.cache = {}
      //await this.changeLeverage()
      //await this.changeMarginType()
    }
  
  
    //endpoint, method = 'GET', payload = {}, version = 'v1'
    async fetch(endpoint, method = 'GET', payload = {}, version = 'v1') {
        
      return await universalFetch(this, endpoint, method, payload, version)
       
    }
  
  
    async getServerTime()
    {
      return (await this.fetch('time', 'GET', {})).serverTime
    }
  
    // ----------- Example Methods -----------
    async getOrders() {
      //works fine, needs no change
      return await this.fetch('openOrders', 'GET', { });
    }
  
    async getPositions() {
  
      //works fine, needs no change
      return await this.fetch('positionRisk', 'GET', { }, 'v3')
    }
  
    async getBalance() {
  
      //works fine, needs no change
  
      const data = await this.fetch('balance', 'GET', {}, 'v2');
  
      const findUSDT = data.find(a => a.asset === this.settlementCurrency)
  
      if(typeof findUSDT === 'object')
      {
        return findUSDT.balance
      }
      return 0
    }
  
    async getContractInfo() {
      
      const {contractName} = this
      const cacheKey = `contract_${contractName}`
  
      if(this.cache.hasOwnProperty(cacheKey)) return this.cache[cacheKey]
  
      const data = await this.fetch(`exchangeInfo`, 'GET', { })
  
      const findContract = data.symbols.find(o => o.symbol === contractName)
  
      if(typeof findContract === 'undefined')
      {
        throw new Error(`contract ${contractName} not fund`)
      }
  
      this.cache[cacheKey] = findContract
  
      return findContract;
    }
  
    async changeLeverage()
    {
      return await this.fetch('leverage', 'POST', {leverage: this.leverage})
    }
  
  
    async cancelMultipleOrders(orders)
    {
      const orderIdList = JSON.stringify(orders.map(o => o.orderId))
      return await this.fetch('batchOrders', 'DELETE', {orderIdList})
    }
  
    async cancelOrder(payload)
    {
      const {orderId} = payload
      return await this.fetch('order', 'DELETE', {orderId})
    }
  
    async createLimitOrder({side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes}) {
      
      return await createLimitOrder({main: this, side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes})

    }
  
    async createTakeProfitOrder({triggerPrice, handleExistingOrders}) {
        return await createTakeProfitOrder({main: this, triggerPrice, handleExistingOrders})
    }
  
    async createStopLossOrder({triggerPrice, handleExistingOrders}) {
      return await createStopLossOrder({main: this, triggerPrice, handleExistingOrders})
    }
  
    async changeMarginType()
    {
      //must close 100% of current position
      
      return await this.fetch('marginType', 'POST', { marginType: this.marginType });
    }

    async ohlcv({ interval, startTime, endTime, limit }) {


      validateOhlcv({ interval, startTime, endTime, limit })
    
      // Build query args
      const args = {
        interval,
        ...(limit ? { limit } : { startTime, endTime })
      };
    
      const data = await this.fetch('klines', 'GET', args)
    
      if (!Array.isArray(data)) {
        throw new Error('Invalid response in "ohlcv".')
      }

      if (!Array.isArray(data[0])) {
        throw new Error('Invalid response in "ohlcv".')
      }
    
      return data.map(([timestamp, open, high, low, close, volume]) => ({
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volume: parseFloat(volume),
        date: millisecondsToDateStr(timestamp)
      }))
    }
    
  }
  