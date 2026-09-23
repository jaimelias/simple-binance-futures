import {
  isPlainObject,
  isValidContractInfo,
  normalizeOhlcvTime,
  validateCallbacks,
  validateEnvironment,
  validateOhlcv,
  validateProxy,
  validateFundingFeePolicy
} from './validators.js'
import {getEngine, universalFetch} from './universalFetch.js'
import ErrorHandler from './ErrorHandler.js'
import RateLimitError from './RateLimitError.js'
import {
  estimateLiquidationLevels,
  liquidationLevelsDefaults,
  validateLiquidationLevelsOptions
} from './liquidationLevels.js'
import {evaluateFundingRisk, getFundingState, normalizeFundingFeePolicy} from './fundingFees.js'

export const defaultEndpoints = {
  testnet: 'https://testnet.binancefuture.com',
  production: 'https://fapi.binance.com'
}

const CONTRACT_INFO_CACHE_TTL_SECONDS = 21600
const RATE_LIMIT_CACHE_TTL_SECONDS = 21600
const publicRateLimitStates = new Map()

// Public requests and trading instances use the same transport and market data methods.
export default class MarketDataClient {
  constructor({
    environment = 'production',
    contractName,
    proxy,
    callbacks = {},
    debug = false,
    exchangeInfo = {},
    contractInfo = {},
    fundingFeePolicy = {},
    rateLimitCoolDownSeconds = 60
  } = {}) {
    this.engine = getEngine()
    this.isGAS = this.engine === 'google-apps-script'
    this.callbacks = {...callbacks}
    if (!this.isGAS && this.callbacks.fetch === undefined && typeof fetch === 'function') {
      this.callbacks.fetch = fetch
    }
    validateCallbacks(this.callbacks, this.engine, {authenticated: false})
    this.errorHandler = new ErrorHandler(this.callbacks)
    this.environment = environment
    this.endpoint = `${proxy?.replace(/\/+$/, '') ?? defaultEndpoints[environment]}/fapi`
    this.contractName = contractName
    this.debug = debug
    this.exchangeInfo = exchangeInfo
    this.contractInfo = contractInfo
    this.latestPrice = 0
    this.fundingFeePolicy = normalizeFundingFeePolicy(fundingFeePolicy)
    this.cache = this.isGAS ? CacheService.getScriptCache() : null
    this.PropertiesService = this.isGAS ? PropertiesService.getScriptProperties() : null
    this.rateLimitCoolDownSeconds = rateLimitCoolDownSeconds
    this.rateLimitState = {lockedUntil: 0, usage: {}, status: undefined}
    this.rateLimitStateKey = `simple-binance-futures:v1:${environment}:rate-limit-until`
  }

  get rateLimitLockedUntil() { return this.rateLimitState.lockedUntil }
  set rateLimitLockedUntil(value) { this.rateLimitState.lockedUntil = value }
  get rateLimitUsage() { return this.rateLimitState.usage }
  set rateLimitUsage(value) { this.rateLimitState.usage = value }
  get lastRateLimitStatus() { return this.rateLimitState.status }
  set lastRateLimitStatus(value) { this.rateLimitState.status = value }

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


  async fetch(endpoint, method = 'GET', payload = {}, version = 'v1') {
    
    return await universalFetch(this, endpoint, method, payload, version)
     
  }


  async getServerTime()
  {
    return this.errorHandler.init(async () => {
      return (await this.fetch('time', 'GET', {})).serverTime
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

  async getFundingState({side, quantity, positionNotional} = {}) {

    return this.errorHandler.init(async () => {
      return await getFundingState({main: this, side, quantity, positionNotional})
    })

  }

  evaluateFundingRisk(state) {
    return evaluateFundingRisk(state, this.fundingFeePolicy)
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

}

// Keep cooldowns across separate static calls without sharing callbacks or market data.
export const createPublicClient = (options = {}, contractName) => {
  if (!isPlainObject(options)) throw new Error('Public request options must be an object.')
  const {environment = 'production', proxy, callbacks = {}, debug = false,
    rateLimitCoolDownSeconds = 60, fundingFeePolicy = {}} = options
  validateEnvironment(environment)
  if (contractName !== undefined && (
    typeof contractName !== 'string' || !/^(?:[A-Z0-9]|\p{Script=Han})+$/u.test(contractName)
  )) {
    throw new Error('"symbol" must be a full Binance contract symbol, such as "BTCUSDT".')
  }
  validateProxy(proxy)
  if (typeof debug !== 'boolean') throw new Error('"debug" must be a boolean.')
  if (!Number.isSafeInteger(rateLimitCoolDownSeconds) || rateLimitCoolDownSeconds <= 0) {
    throw new Error('"rateLimitCoolDownSeconds" must be a positive integer.')
  }
  if (!isPlainObject(callbacks)) throw new Error('"callbacks" must be an object.')
  validateFundingFeePolicy(fundingFeePolicy)
  const client = new MarketDataClient({
    environment, contractName, proxy, callbacks,
    debug, rateLimitCoolDownSeconds, fundingFeePolicy
  })
  if (!publicRateLimitStates.has(client.endpoint)) {
    publicRateLimitStates.set(client.endpoint, client.rateLimitState)
  }
  client.rateLimitState = publicRateLimitStates.get(client.endpoint)
  return client
}

export const requireContractSymbol = symbol => {
  if (symbol === undefined) throw new Error('"symbol" is required, for example "BTCUSDT".')
  return symbol
}
