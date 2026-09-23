import {
  assertNonNegativeFiniteNumber,
  assertPositiveInteger,
  isPlainObject,
  isValidContractInfo,
  isValidLeverageBracket,
  normalizeOhlcvTime,
  validateCallbacks,
  validateCredentials,
  validateEnvironment,
  validateOhlcv,
  validateStrategy
} from './src/utilities/validators.js'
import {getEngine, universalFetch} from './src/utilities/universalFetch.js'
import { createLimitOrder } from './src/actions/createLimitOrder.js'
import { createStopLimitOrder } from './src/actions/createStopLimitOrder.js'
import { createTakeProfitOrder } from './src/actions/createTakeProfitOrder.js'
import { createStopLossOrder } from './src/actions/createStopLossOrder.js'
import { closePosition } from './src/actions/closePosition.js'
import { createMarketOrder } from './src/actions/createMarketOrder.js'
import { modifyLimitOrder } from './src/actions/modifyLimitOrder.js'
import ErrorHandler from './src/utilities/ErrorHandler.js'
import RateLimitError from './src/utilities/RateLimitError.js'
import {
  estimateLiquidationLevels,
  liquidationLevelsDefaults,
  validateLiquidationLevelsOptions
} from './src/utilities/liquidationLevels.js'
import {
  assertFundingEntryAllowed,
  checkFundingRisk,
  evaluateFundingRisk,
  getFundingState,
  normalizeFundingFeePolicy
} from './src/utilities/fundingFees.js'

export { RateLimitError }

export const defaultEndpoints = {
    testnet: 'https://testnet.binancefuture.com',
    production: 'https://fapi.binance.com'
}

const CONTRACT_INFO_CACHE_TTL_SECONDS = 21600
const LEVERAGE_BRACKET_CACHE_TTL_SECONDS = 600
const RATE_LIMIT_CACHE_TTL_SECONDS = 21600

export default class BinanceFutures {

    constructor(credentials, strategy, callbacks) {

      this.engine = getEngine()

      this.isGAS = this.engine === 'google-apps-script';

      validateCallbacks(callbacks, this.engine)
      validateStrategy(strategy)


      this.callbacks = callbacks ?? {}

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
        balance = 0,
        fundingFeePolicy = {},
        rateLimitCoolDownSeconds = 60
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
      this.fundingFeePolicy = normalizeFundingFeePolicy(fundingFeePolicy)
      this.cache = this.isGAS ? CacheService.getScriptCache() : null;
      this.rateLimitCoolDownSeconds = rateLimitCoolDownSeconds
      this.rateLimitLockedUntil = 0
      this.rateLimitUsage = {}
      this.PropertiesService = this.isGAS ? PropertiesService.getScriptProperties() : null;
      this.rateLimitStateKey = `simple-binance-futures:v1:${this.environment}:rate-limit-until`

      //this ensures Google Apps Script time helpers are aligned with Binance Servers.
      if(this.isGAS) {

        const timeZone = Session.getScriptTimeZone();

        if( timeZone !== 'Etc/UTC')         {
            throw new Error(`Timezone "${timeZone}" is invalid. Open ⚙️ (Project Settings) and set the timezone to "(GMT+00:00) universal coordinated time".`)
        }
      }


    }

    _getCacheKey(type) {
      return `simple-binance-futures:v1:${this.environment}:${this.contractName}:${type}`
    }

    _removeCachedValue(cacheKey) {
      if(!this.cache) return

      try {
        this.cache.remove(cacheKey)
      } catch(error) {
        if(this.debug) console.log(`Unable to remove cache key "${cacheKey}": ${error.message}`)
      }
    }

    _getCachedObject(cacheKey, isValid) {
      if(!this.cache) return null

      try {
        const serializedValue = this.cache.get(cacheKey)
        if(serializedValue === null) return null

        const value = JSON.parse(serializedValue)
        if(typeof value !== 'object' || value === null || !isValid(value))
        {
          this._removeCachedValue(cacheKey)
          return null
        }

        return value
      } catch(error) {
        this._removeCachedValue(cacheKey)
        if(this.debug) console.log(`Unable to read cache key "${cacheKey}": ${error.message}`)
        return null
      }
    }

    _setCachedObject(cacheKey, value, expirationInSeconds) {
      if(!this.cache) return

      try {
        this.cache.put(cacheKey, JSON.stringify(value), expirationInSeconds)
      } catch(error) {
        if(this.debug) console.log(`Unable to write cache key "${cacheKey}": ${error.message}`)
      }
    }

    _cacheRateLimitLockedUntil(lockedUntil) {
      if(!this.cache) return

      const remainingSeconds = Math.ceil((lockedUntil - Date.now()) / 1000)

      try {
        if(remainingSeconds <= 0)
        {
          this.cache.remove(this.rateLimitStateKey)
          return
        }

        this.cache.put(
          this.rateLimitStateKey,
          String(lockedUntil),
          Math.min(remainingSeconds, RATE_LIMIT_CACHE_TTL_SECONDS)
        )
      } catch(error) {
        if(this.debug) console.log(`Unable to cache rate-limit state: ${error.message}`)
      }
    }

    _getSharedRateLimitLockedUntil() {
      let lockedUntil = 0

      if(this.cache)
      {
        try {
          lockedUntil = Number(this.cache.get(this.rateLimitStateKey)) || 0
          if(lockedUntil > Date.now()) return lockedUntil
        } catch(error) {
          if(this.debug) console.log(`Unable to read cached rate-limit state: ${error.message}`)
        }
      }

      if(!this.PropertiesService) return 0

      try {
        lockedUntil = Number(this.PropertiesService.getProperty(this.rateLimitStateKey)) || 0

        if(lockedUntil > Date.now())
        {
          this._cacheRateLimitLockedUntil(lockedUntil)
          return lockedUntil
        }

        if(lockedUntil > 0) this.PropertiesService.deleteProperty(this.rateLimitStateKey)
      } catch(error) {
        if(this.debug) console.log(`Unable to read persisted rate-limit state: ${error.message}`)
      }

      return 0
    }

    _persistRateLimitLockedUntil(lockedUntil) {
      this._cacheRateLimitLockedUntil(lockedUntil)
      if(!this.PropertiesService) return lockedUntil

      let lock = null
      let lockAcquired = false

      try {
        if(typeof LockService !== 'undefined')
        {
          lock = LockService.getScriptLock()
          lockAcquired = lock.tryLock(1000)
        }

        const persistedValue = Number(this.PropertiesService.getProperty(this.rateLimitStateKey)) || 0
        const valueToPersist = Math.max(lockedUntil, persistedValue)
        this.PropertiesService.setProperty(this.rateLimitStateKey, String(valueToPersist))
        this._cacheRateLimitLockedUntil(valueToPersist)
        return valueToPersist
      } catch(error) {
        if(this.debug) console.log(`Unable to persist rate-limit state: ${error.message}`)
        return lockedUntil
      } finally {
        if(lock && lockAcquired) lock.releaseLock()
      }
    }

    lockRateLimit({status, retryAfterSeconds}) {
      const hasRetryAfter = typeof retryAfterSeconds === 'number' &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds >= 0
      const requestedCoolDownSeconds = hasRetryAfter
        ? Math.max(1, Math.ceil(retryAfterSeconds))
        : this.rateLimitCoolDownSeconds
      const now = Date.now()
      const requestedLockedUntil = now + (requestedCoolDownSeconds * 1000)
      const existingLockedUntil = Math.max(
        this.rateLimitLockedUntil,
        this._getSharedRateLimitLockedUntil()
      )

      this.rateLimitLockedUntil = Math.max(requestedLockedUntil, existingLockedUntil)
      this.rateLimitLockedUntil = this._persistRateLimitLockedUntil(this.rateLimitLockedUntil)
      this.lastRateLimitStatus = status

      return {
        status,
        retryAfterSeconds: Math.max(1, Math.ceil((this.rateLimitLockedUntil - now) / 1000)),
        lockedUntil: this.rateLimitLockedUntil
      }
    }

    getRateLimitRemainingSeconds() {
      const lockedUntil = Math.max(
        this.rateLimitLockedUntil,
        this._getSharedRateLimitLockedUntil()
      )
      this.rateLimitLockedUntil = lockedUntil

      return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
    }

    assertRateLimitAvailable() {
      const remainingSeconds = this.getRateLimitRemainingSeconds()
      if(remainingSeconds === 0) return true

      throw new RateLimitError({
        status: this.lastRateLimitStatus ?? 429,
        retryAfterSeconds: remainingSeconds,
        lockedUntil: this.rateLimitLockedUntil,
        rateLimitUsage: this.rateLimitUsage,
        isLocalCooldown: true,
        message: `Binance requests are locked for another ${remainingSeconds} seconds due to a previous rate-limit response.`
      })
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

    async getAlgoOrders() {

      return this.errorHandler.init(async () => {
        return await this.fetch('openAlgoOrders', 'GET', { algoType: 'CONDITIONAL' });
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

      const [regularOrders, algoOrders] = await Promise.all([
        this.getOrders(),
        this.getAlgoOrders()
      ])
      const unparsedOrders = [...regularOrders, ...algoOrders]

      for(const order of unparsedOrders)
      {
        const type = order.orderType ?? order.origType ?? order.type
        const {side, reduceOnly, closePosition} = order

          if(['MARKET', 'LIMIT', 'STOP'].includes(type) && reduceOnly === false && closePosition === false)
          {
            parsedOrders.orders[side].push(order)
          }
          else if(type === 'STOP_MARKET' && closePosition)
          {
            parsedOrders.sl[side].push(order)
          }
          else if(type === 'TAKE_PROFIT_MARKET' && closePosition)
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
    
        if(!isPlainObject(this.exchangeInfo) || !Array.isArray(this.exchangeInfo.symbols))
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
    
        if(isValidContractInfo(this.contractInfo, contractName)) return this.contractInfo

        const cacheKey = this._getCacheKey('contract-info')
        const cachedContractInfo = this._getCachedObject(
          cacheKey,
          value => isValidContractInfo(value, contractName)
        )

        if(cachedContractInfo)
        {
          this.contractInfo = cachedContractInfo
          return this.contractInfo
        }

        const exchangeInfo = await this.getExchangeInfo()
    
        const findContract = exchangeInfo.symbols.find(o => o.symbol === contractName)
    
        if(!isValidContractInfo(findContract, contractName))
        {
          throw new Error(`Valid contract information was not found for ${contractName}.`)
        }
    
        this.contractInfo = findContract
        this._setCachedObject(cacheKey, this.contractInfo, CONTRACT_INFO_CACHE_TTL_SECONDS)
    
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
        await this.fetch('leverage', 'POST', {leverage})
        this.leverage = leverage

        return leverage
      })

    }
  
  
    async cancelMultipleOrders(orders)
    {
      return this.errorHandler.init(async () => {
        if(!Array.isArray(orders) || orders.length === 0) {
          throw new Error('"orders" must be a non-empty array in cancelMultipleOrders.')
        }

        orders.forEach(order => {
          if(!isPlainObject(order)) throw new Error('Each order in cancelMultipleOrders must be an object.')
          assertPositiveInteger(order.orderId, 'orderId')
        })

        const orderIdList = JSON.stringify(orders.map(o => o.orderId))
        return await this.fetch('batchOrders', 'DELETE', {orderIdList})
      })

    }
  
    async cancelOrder(payload)
    {
      return this.errorHandler.init(async () => {
        if(!isPlainObject(payload)) throw new Error('"payload" must be an object in cancelOrder.')
        const {orderId} = payload
        assertPositiveInteger(orderId, 'orderId')
        return await this.fetch('order', 'DELETE', {orderId})
      })

    }

    async cancelAlgoOrder(payload)
    {
      return this.errorHandler.init(async () => {
        if(!isPlainObject(payload)) throw new Error('"payload" must be an object in cancelAlgoOrder.')
        const {algoId} = payload
        assertPositiveInteger(algoId, 'algoId')

        return await this.fetch('algoOrder', 'DELETE', {algoId})
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

    async createStopLimitOrder({side, amountInUSD, stopPrice, limitPrice, handleExistingOrders, expirationInMinutes, orders}) {
      
      return this.errorHandler.init(async () => {
        return await createStopLimitOrder({main: this, side, amountInUSD, stopPrice, limitPrice, handleExistingOrders, expirationInMinutes, orders})
      })

    }

    async createMarketOrder({side, amountInUSD}) {

      return this.errorHandler.init(async () => {
        return await createMarketOrder({main: this, side, amountInUSD})
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

    async getFundingState({side, quantity, positionNotional} = {}) {

      return this.errorHandler.init(async () => {
        return await getFundingState({main: this, side, quantity, positionNotional})
      })

    }

    evaluateFundingRisk(state) {
      return evaluateFundingRisk(state, this.fundingFeePolicy)
    }

    async assertFundingEntryAllowed({side, quantity, positionNotional}) {
      return await assertFundingEntryAllowed({main: this, side, quantity, positionNotional})
    }

    async checkFundingRisk({orders, algoOrders, positions} = {}) {

      return this.errorHandler.init(async () => {
        return await checkFundingRisk({main: this, orders, algoOrders, positions})
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
        const intervals = new Set()

        for(const obj of params)
        {
          if(typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new Error('Each "ohlcv" batch item must be an object.')
          }

          if(intervals.has(obj.interval)) {
            throw new Error(`Duplicate "interval" (${obj.interval}) in "ohlcv" batch request.`)
          }

          intervals.add(obj.interval)
        }

        for(const obj of params)
        {
          ohlcvObj[obj.interval] = await this.ohlcv(obj)
        }

        return ohlcvObj
      }

      if(typeof params !== 'object' || params === null) {
        throw new Error('"ohlcv" params must be an object or an array of objects.')
      }

      const {
        interval,
        startTime,
        endTime,
        limit,
        klineType = 'klines',
        contractType = 'PERPETUAL'
      } = params

      return await this.errorHandler.init(async () => {
        validateOhlcv({ interval, startTime, endTime, limit, klineType, contractType })
      
        const {contractName} = this

        // Build query args
        const args = { interval }

        if(limit != null) args.limit = limit
        if(startTime != null) args.startTime = normalizeOhlcvTime(startTime, 'startTime')
        if(endTime != null) args.endTime = normalizeOhlcvTime(endTime, 'endTime')

        if(['continuousKlines', 'indexPriceKlines'].includes(klineType)) {
          args.pair = contractName
        }

        if(klineType === 'continuousKlines') {
          args.contractType = contractType
        }
        
        const data = await this.fetch(klineType, 'GET', args)
      
        if (!Array.isArray(data)) {
          throw new Error('Invalid response in "ohlcv".')
        }

        if (data.length === 0) {
          return []
        }

        if (!data.every(Array.isArray)) {
          throw new Error('Invalid response in "ohlcv".')
        }

        const volumeLines = ['klines', 'continuousKlines']
        const includeVol = volumeLines.includes(klineType)
        const len = data.length
        const output = new Array(len)

        for (let i = 0; i < len; i++) {
          const [t, o, h, l, c, v] = data[i]
          const row = {
            open:  +o,
            high:  +h,
            low:   +l,
            close: +c,
            date:  t,
          }
          
          if (includeVol) {
            row.volume = +v
          }

          output[i] = row;
        }

        const isRecentPriceRequest = startTime == null &&
          endTime == null &&
          klineType !== 'premiumIndexKlines'

        if(isRecentPriceRequest) {
          this.latestPrice = output[output.length -1].close
        }

        return output
      })

    }

    async getLiquidationLevels(options = {}) {
      return this.errorHandler.init(async () => {
        if(!isPlainObject(options)) {
          throw new Error('"getLiquidationLevels" options must be an object.')
        }

        const params = {...liquidationLevelsDefaults, ...options}
        validateLiquidationLevelsOptions(params)

        const args = {interval: params.interval, limit: params.limit}
        const tradeKlines = await this.fetch('klines', 'GET', args)
        const markKlines = await this.fetch('markPriceKlines', 'GET', args)

        return estimateLiquidationLevels({
          tradeKlines,
          markKlines,
          step: params.step,
          top: params.top,
          leverages: params.leverages,
          maintenanceMarginRate: params.maintenanceMarginRate
        })
      })
    }

    async cancelAllOpenedOrders(){

      return this.errorHandler.init(async () => {
        const [orders] = await Promise.all([
          this.fetch('allOpenOrders', 'DELETE'),
          this.fetch('algoOpenOrders', 'DELETE')
        ])

        return orders
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

        if(isValidLeverageBracket(this.leverageBracket, this.contractName))
        {
          return this.leverageBracket
        }

        const cacheKey = this._getCacheKey('leverage-bracket')
        const cachedLeverageBracket = this._getCachedObject(
          cacheKey,
          value => isValidLeverageBracket(value, this.contractName)
        )

        if(cachedLeverageBracket)
        {
          this.leverageBracket = cachedLeverageBracket
          return this.leverageBracket
        }

        const data = await this.fetch('leverageBracket', 'GET')

        if (
          !Array.isArray(data) ||
          data.length === 0 ||
          !isValidLeverageBracket(data[0], this.contractName)
        ) {
          throw new Error(`Leverage bracket data not available for contractName: ${this.contractName}`);
        }

        this.leverageBracket = data[0]; // For single symbol
        this._setCachedObject(cacheKey, this.leverageBracket, LEVERAGE_BRACKET_CACHE_TTL_SECONDS)

        return this.leverageBracket
      })  
    }

    async getMaxLevarage(notional)
    {
      return this.errorHandler.init(async () => {

        assertNonNegativeFiniteNumber(notional, 'notional')

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
        return last?.initialLeverage ?? null

      })
    }
    
  }
