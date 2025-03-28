import { validateCredentials, validateEnvironment, validateStrategy, validateOhlcv, validateCallbacks } from './src/utilities/validators.js'
import {getEngine, universalFetch} from './src/utilities/universalFetch.js'
import { createLimitOrder } from './src/actions/createLimitOrder.js'
import { createStopLimitOrder } from './src/actions/createStopLimitOrder.js'
import { createTakeProfitOrder } from './src/actions/createTakeProfitOrder.js'
import { createStopLossOrder } from './src/actions/createStopLossOrder.js'
import { millisecondsToDateStr } from './src/utilities/utilities.js'
import { closePosition } from './src/actions/closePosition.js'
import { modifyLimitOrder } from './src/actions/modifyLimitOrder.js'
import { getTradingData } from './src/getters/getTradingData.js'
import ErrorHandler from './src/utilities/ErrorHandler.js'

export const defaultEndpoints = {
    testnet: 'https://testnet.binancefuture.com',
    production: 'https://fapi.binance.com'
}

export default class BinanceFutures {

    constructor(credentials, strategy, callbacks) {
  
      this.engine = getEngine()
      validateCallbacks(callbacks, this.engine)
      validateStrategy(strategy)


      this.callbacks = callbacks

      this.errorHandler = new ErrorHandler(this.callbacks)
  
      const {settlementCurrency, symbol, leverage, marginType = 'ISOLATED', environment, debug = false,  useServerTime = false, useMarkPrice = false} = strategy
  
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
      
      this.workingType = (useMarkPrice) ? 'MARK_PRICE' : 'CONTRACT_PRICE'
      
      
      this.cache = {}
      this.latestPrice = 0
    }
  
  
    //endpoint, method = 'GET', payload = {}, version = 'v1'
    async fetch(endpoint, method = 'GET', payload = {}, version = 'v1') {
      
      return await universalFetch(this, endpoint, method, payload, version)
       
    }
  
  
    async getServerTime()
    {
      return this.errorHandler.init(async () => {
        return (await this.fetch('time', 'GET', {})).serverTime
      })
      
    }
  
    async getTradingData({ohlcvConfig = [], reloadBalances = true}) {

      return this.errorHandler.init(async () => {
        return await getTradingData({main: this, ohlcvConfig, reloadBalances})
      })

    }

    // ----------- Example Methods -----------
    async getOrders() {

      return this.errorHandler.init(async () => {
        return await this.fetch('openOrders', 'GET', { });
      })
    }
  
    async getPositions() {
  
      return this.errorHandler.init(async () => {
        return await this.fetch('positionRisk', 'GET', { }, 'v3')
      })

    }
  
    async getBalance(reloadBalances = true) {
  
      return this.errorHandler.init(async () => {
        const {contractName} = this
        const cacheKey = `balance_${contractName}`

        if(reloadBalances === false && this.cache.hasOwnProperty(cacheKey) && this.cache[cacheKey] !== 0) {
          return this.cache[cacheKey]
        }
    
        const data = await this.fetch('balance', 'GET', {}, 'v2');
    
        const findUSDT = data.find(a => a.asset === this.settlementCurrency)
    
        if(typeof findUSDT === 'object')
        {
          const balance = parseFloat(findUSDT.balance)

          if(reloadBalances) {
            this.cache[cacheKey] = balance
          }
          
          return balance
        }

        return 0
      })

    }
  
    async getContractInfo() {
      
      return this.errorHandler.init(async () => {
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
      })
    
    }
  
    async changeLeverage()
    {
      return this.errorHandler.init(async () => {
        return await this.fetch('leverage', 'POST', {leverage: this.leverage})
      })

    }
  
  
    async cancelMultipleOrders(orders)
    {
      return this.errorHandler.init(async () => {
        const orderIdList = JSON.stringify(orders.map(o => o.orderId))
        return await this.fetch('batchOrders', 'DELETE', {orderIdList})
      })

    }
  
    async cancelOrder(payload)
    {
      return this.errorHandler.init(async () => {
        const {orderId} = payload
        return await this.fetch('order', 'DELETE', {orderId})
      })

    }
  
    async createLimitOrder({side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes, orders, ignoreImmediateExecErr}) {
      
      return this.errorHandler.init(async () => {
        return await createLimitOrder({main: this, side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes, orders, ignoreImmediateExecErr})
      })

    }

    async modifyLimitOrder({orders, entryPrice, side, expirationInMinutes}) {

      return this.errorHandler.init(async () => {
        return await modifyLimitOrder({main: this, orders, entryPrice, side, expirationInMinutes})
      })

    }

    async createStopLimitOrder({side, amountInUSD, entryPrice, fraction, handleExistingOrders, expirationInMinutes, orders}) {
      
      return this.errorHandler.init(async () => {
        return await createStopLimitOrder({main: this, side, amountInUSD, entryPrice, fraction, handleExistingOrders, expirationInMinutes, orders})
      })

    }

    async createTakeProfitOrder({triggerPrice, handleExistingOrders, positions, orders}) {

      return this.errorHandler.init(async () => {
        return await createTakeProfitOrder({main: this, triggerPrice, handleExistingOrders, positions, orders})
      })

    }
  
    async createStopLossOrder({triggerPrice, handleExistingOrders, positions, orders}) {

      return this.errorHandler.init(async () => {
        return await createStopLossOrder({main: this, triggerPrice, handleExistingOrders, positions, orders})
      })

    }
  
    async changeMarginType()
    {

      return this.errorHandler.init(async () => {
        //must close 100% of current position
        
        return await this.fetch('marginType', 'POST', { marginType: this.marginType });
      })
    }

    async ohlcv({ interval, startTime, endTime, limit }) {

      return await this.errorHandler.init(async () => {
        validateOhlcv({ interval, startTime, endTime, limit })
      
        const {contractName} = this

        // Build query args
        const args = {
          interval,
          pair: contractName,
          ...(limit ? { limit } : { startTime, endTime })
        }

        const klineType = (this.workingType === 'MARK_PRICE') ? 'markPriceKlines' : 'indexPriceKlines'

        const data = await this.fetch(klineType, 'GET', args)
      
        if (!Array.isArray(data)) {
          throw new Error('Invalid response in "ohlcv".')
        }

        if (!Array.isArray(data[0])) {
          throw new Error('Invalid response in "ohlcv".')
        }
      
        const output =  data.map(([timestamp, open, high, low, close, volume]) => ({
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close),
          volume: parseFloat(volume),
          date: millisecondsToDateStr(timestamp)
        }))


        this.latestPrice = output[output.length -1].close

        return output
      })

    }

    async cancelAllOpenedOrders(){

      return this.errorHandler.init(async () => {
        return await this.fetch('allOpenOrders', 'DELETE')
      })

      
    }

    async closePosition({positions, side}){


      return this.errorHandler.init(async () => {
        return await closePosition({main: this, positions, side})
      })

    }
    
  }
  