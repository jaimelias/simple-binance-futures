import {
  assertNonNegativeFiniteNumber,
  assertPositiveInteger,
  isPlainObject,
  isValidLeverageBracket,
  validateCallbacks,
  validateCredentials,
  validateFundingFeePolicy,
  validateStrategy
} from './src/utilities/validators.js'
import {getEngine} from './src/utilities/universalFetch.js'
import MarketDataClient, {createPublicClient, requireContractSymbol} from './src/utilities/MarketDataClient.js'
import { createLimitOrder } from './src/actions/createLimitOrder.js'
import { createStopLimitOrder } from './src/actions/createStopLimitOrder.js'
import { createTakeProfitOrder } from './src/actions/createTakeProfitOrder.js'
import { createStopLossOrder } from './src/actions/createStopLossOrder.js'
import { closePosition } from './src/actions/closePosition.js'
import { createMarketOrder } from './src/actions/createMarketOrder.js'
import { modifyLimitOrder } from './src/actions/modifyLimitOrder.js'
import RateLimitError from './src/utilities/RateLimitError.js'
import {
  assertFundingEntryAllowed,
  checkFundingRisk,
  evaluateFundingRisk,
  normalizeFundingFeePolicy
} from './src/utilities/fundingFees.js'

export { RateLimitError }

export {defaultEndpoints} from './src/utilities/MarketDataClient.js'

const LEVERAGE_BRACKET_CACHE_TTL_SECONDS = 600

export default class BinanceFutures extends MarketDataClient {
    constructor(credentials, strategy, callbacks) {
      validateStrategy(strategy)
      validateCredentials(credentials, strategy.environment)
      validateCallbacks(callbacks, getEngine())

      const {API_KEY, API_SECRET, PROXY} = credentials[strategy.environment]
      super({
        ...strategy,
        contractName: `${strategy.symbol}${strategy.settlementCurrency}`,
        proxy: PROXY,
        callbacks
      })
      this.API_KEY = API_KEY
      this.API_SECRET = API_SECRET
      this.settlementCurrency = strategy.settlementCurrency
      this.marginType = strategy.marginType ?? 'ISOLATED'
      this.useServerTime = strategy.useServerTime ?? false
      this.workingType = strategy.useMarkPrice ? 'MARK_PRICE' : 'CONTRACT_PRICE'
      this.leverageBracket = strategy.leverageBracket ?? {}
      this.balance = strategy.balance ?? 0
      this.leverage = null

      if (this.isGAS) {
        const timeZone = Session.getScriptTimeZone()
        if (timeZone !== 'Etc/UTC') {
          throw new Error(`Timezone "${timeZone}" is invalid. Open ⚙️ (Project Settings) and set the timezone to "(GMT+00:00) universal coordinated time".`)
        }
      }
    }

    static async getServerTime(options = {}) {
      return createPublicClient(options).getServerTime()
    }

    static async getExchangeInfo(options = {}) {
      return createPublicClient(options).getExchangeInfo()
    }

    static async getContractInfo(symbol, options = {}) {
      return createPublicClient(options, requireContractSymbol(symbol)).getContractInfo()
    }

    static async ohlcv(symbol, params, options = {}) {
      return createPublicClient(options, requireContractSymbol(symbol)).ohlcv(params)
    }

    static async getLiquidationLevels(symbol, params = {}, options = {}) {
      return createPublicClient(options, requireContractSymbol(symbol)).getLiquidationLevels(params)
    }

    static async getFundingState(symbol, params = {}, options = {}) {
      return createPublicClient(options, requireContractSymbol(symbol)).getFundingState(params)
    }

    static evaluateFundingRisk(state, policy = {}) {
      validateFundingFeePolicy(policy)
      return evaluateFundingRisk(state, normalizeFundingFeePolicy(policy))
    }

    static getRateLimitRemainingSeconds(options = {}) {
      return createPublicClient(options).getRateLimitRemainingSeconds()
    }

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
