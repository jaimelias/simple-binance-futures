import { validateCredentials, validateEnvironment, validateStrategy, validateOhlcv, validateCallbacks } from './src/utilities/validators.js'
import {getEngine, universalFetch} from './src/utilities/universalFetch.js'
import { createLimitOrder } from './src/actions/createLimitOrder.js'
import { createStopLimitOrder } from './src/actions/createStopLimitOrder.js'
import { createTakeProfitOrder } from './src/actions/createTakeProfitOrder.js'
import { createStopLossOrder } from './src/actions/createStopLossOrder.js'
import { millisecondsToDateStr } from './src/utilities/utilities.js'
import { closePosition } from './src/actions/closePosition.js'
import { modifyLimitOrder } from './src/actions/modifyLimitOrder.js'
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
  
      const {
        settlementCurrency, 
        symbol, 
        marginType = 'ISOLATED', 
        environment, 
        debug = false,  
        useServerTime = false, 
        useMarkPrice = false,
        leverageBracket = {},
        exchangeInfo = {},
        contractInfo = {},
        balance = 0
      } = strategy
  
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
      this.marginType = marginType
      this.useServerTime = useServerTime
      this.environment = environment
      this.debug = debug
      
      this.workingType = (useMarkPrice) ? 'MARK_PRICE' : 'CONTRACT_PRICE'
      this.exchangeInfo = exchangeInfo
      this.leverageBracket = leverageBracket
      this.contractInfo = contractInfo
      this.balance = balance
      this.leverage = null
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

    // ----------- Example Methods -----------
    async getOrders() {

      return this.errorHandler.init(async () => {
        return await this.fetch('openOrders', 'GET', { });
      })
    }

    async getParsedOrders(){

      const parsedOrders = {
        orders: {
          BUY: [],
          SELL: []
        },
        sl: {
          BUY: [],
          SELL: []
        },
        tp: {
          BUY: [],
          SELL: []
        }
      }

      const unparsedOrders = await this.getOrders()

      for(const order of unparsedOrders)
      {
        const {type, side, reduceOnly, closePosition} = order

          if(['MARKET', 'LIMIT', 'STOP'].includes(type) && reduceOnly === false && closePosition === false)
          {
            parsedOrders.orders[side].push(order)
          }
          else if(type === 'STOP_MARKET' && reduceOnly && closePosition)
          {
            parsedOrders.sl[side].push(order)
          }
          else if(type === 'TAKE_PROFIT_MARKET' && reduceOnly && closePosition)
          {
            parsedOrders.tp[side].push(order)
          }
      }

      return parsedOrders

    }
  
    async getPositions() {
  
      return this.errorHandler.init(async () => {
        return await this.fetch('positionRisk', 'GET', { }, 'v3')
      })

    }

    async getParsedPositions() {

      const parsedPositions = {
        BUY: [],
        SELL: []
      }

      const unparsedPositions = await this.getPositions()

      for(const position of unparsedPositions)
      {
        const amount = parseFloat(position.positionAmt)

        if(amount > 0) parsedPositions.BUY.push(position)
        if(amount < 0) parsedPositions.SELL.push(position)
        else continue
      }

      return parsedPositions
    }
  
    async getBalance(reloadBalances = true) {
  
      return this.errorHandler.init(async () => {

        if(reloadBalances === false && this.balance) {
          return this.balance
        }
    
        const data = await this.fetch('balance', 'GET', {}, 'v2')
    
        const findUSDT = data.find(a => a.asset === this.settlementCurrency)
    
        if(typeof findUSDT === 'object')
        {
          const balance = parseFloat(findUSDT.balance)

          if(reloadBalances) {
            this.balance = balance
          }
          
          return balance
        }

        return 0
      })

    }
  
    async getExchangeInfo() {
      return this.errorHandler.init(async () => {
    
        if(typeof this.exchangeInfo !== 'object' || !this.exchangeInfo.hasOwnProperty('symbols'))
        {
          this.exchangeInfo = await this.fetch(`exchangeInfo`, 'GET', { })
          return this.exchangeInfo
        }

        return this.exchangeInfo;
      })
    }

    async getContractInfo() {
      
      return this.errorHandler.init(async () => {
        const {contractName} = this
    
        if(this.contractInfo.hasOwnProperty('symbol')) return this.contractInfo

        const exchangeInfo = await this.getExchangeInfo()
    
        const findContract = exchangeInfo.symbols.find(o => o.symbol === contractName)
    
        if(typeof findContract === 'undefined')
        {
          throw new Error(`contract ${contractName} not fund`)
        }
    
        this.contractInfo = findContract
    
        return findContract;
      })
    
    }
  
    async changeLeverage(leverageParam, notional)
    {
      return this.errorHandler.init(async () => {

        if ((typeof leverageParam !== 'number' && leverageParam !== Infinity) || Number.isNaN(leverageParam) || leverageParam <= 0) {
          throw new Error('Invalid "leverageParam". It must be a positive number greater than 0 in "changeLeverage".')
        }

        const maxLeverage = await this.getMaxLevarage(notional)

        const leverage = Math.floor(Math.min(leverageParam, maxLeverage))
        this.leverage = leverage

        await this.fetch('leverage', 'POST', {leverage})

        return leverage
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

    async ohlcv(params) {

      if(Array.isArray(params))
      {
        const ohlcvObj = {}

        for(const obj of params)
        {
          ohlcvObj[obj.interval] = await this.ohlcv(obj)
        }

        return ohlcvObj
      }

      const { interval, startTime, endTime, limit } = params

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

        console.log(data.map(([timestamp]) => new Date(timestamp).toISOString()).at(-1))
      
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

    async getLeverageBracket()
    {
      return this.errorHandler.init(async () => {

        if(typeof this.leverageBracket === 'object' && this.leverageBracket.hasOwnProperty('brackets'))
        {
          return this.leverageBracket
        }

        const data = await this.fetch('leverageBracket', 'GET')

        if (!Array.isArray(data) || data.length === 0 || !Array.isArray(data[0].brackets) || data[0].brackets.length === 0) {
          throw new Error(`Leverage bracket data not available for contractName: ${this.contractName}`);
        }

        this.leverageBracket = data[0]; // For single symbol

        return this.leverageBracket
      })  
    }

    async getMaxLevarage(notional)
    {
      return this.errorHandler.init(async () => {

        if(typeof notional !== 'number' || Number.isNaN(notional))
        {
          throw new Error(`Param "notional" must be a number in the settlement currency of the contract.`)
        }

        const leverageBracket = await this.getLeverageBracket()
        const coef = leverageBracket.notionalCoef ?? 1;
        const effectiveNotional = notional * coef;

        const brackets = leverageBracket.brackets;

        for (const bracket of brackets) {
          if (
            effectiveNotional >= bracket.notionalFloor &&
            effectiveNotional < bracket.notionalCap
          ) {
            return bracket.initialLeverage
          }
        }

        // If notional is above all brackets
        const last = brackets[brackets.length - 1];
        return {
          maxLeverage: last?.initialLeverage ?? null
        }

      })
    }
    
  }
  