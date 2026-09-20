const hasOwn = (value, property) => Object.prototype.hasOwnProperty.call(value, property)

export const isPlainObject = value => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

export const assertPositiveFiniteNumber = (value, propertyName) => {
  if(typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`"${propertyName}" must be a finite number greater than 0.`)
  }

  return value
}

export const assertNonNegativeFiniteNumber = (value, propertyName) => {
  if(typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`"${propertyName}" must be a finite, non-negative number.`)
  }

  return value
}

export const assertPositiveInteger = (value, propertyName) => {
  if(!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`"${propertyName}" must be a positive integer.`)
  }

  return value
}

export const assertOptionalArray = (value, propertyName) => {
  if(value !== undefined && value !== null && !Array.isArray(value)) {
    throw new Error(`"${propertyName}" must be an array when provided.`)
  }

  return value
}

export const validateExpirationInMinutes = (value, context = 'order') => {
  if(value === undefined) return true

  if(typeof value !== 'number' || !Number.isFinite(value) || value < 10.1) {
    throw new Error(`Invalid "expirationInMinutes" in ${context}. It must be a finite number greater than or equal to 10.1.`)
  }

  return true
}

const isPositiveNumeric = value => Number.isFinite(Number(value)) && Number(value) > 0
const isNonNegativeNumeric = value => Number.isFinite(Number(value)) && Number(value) >= 0

export const isValidContractInfo = (value, expectedSymbol) => {
  if(!isPlainObject(value) || typeof value.symbol !== 'string' || value.symbol.length === 0) return false
  if(expectedSymbol !== undefined && value.symbol !== expectedSymbol) return false
  if(!Number.isInteger(value.pricePrecision) || value.pricePrecision < 0) return false
  if(!Number.isInteger(value.quantityPrecision) || value.quantityPrecision < 0) return false
  if(!Array.isArray(value.filters)) return false

  const priceFilter = value.filters.find(filter => filter?.filterType === 'PRICE_FILTER')
  const lotSizeFilter = value.filters.find(filter => filter?.filterType === 'LOT_SIZE')
  const minNotionalFilter = value.filters.find(filter => filter?.filterType === 'MIN_NOTIONAL')

  return isPositiveNumeric(priceFilter?.tickSize) &&
    isPositiveNumeric(lotSizeFilter?.minQty) &&
    isPositiveNumeric(lotSizeFilter?.maxQty) &&
    Number(lotSizeFilter?.maxQty) >= Number(lotSizeFilter?.minQty) &&
    isPositiveNumeric(lotSizeFilter?.stepSize) &&
    isPositiveNumeric(minNotionalFilter?.notional)
}

export const isValidLeverageBracket = (value, expectedSymbol) => {
  if(!isPlainObject(value) || !Array.isArray(value.brackets) || value.brackets.length === 0) return false
  if(expectedSymbol !== undefined && value.symbol !== expectedSymbol) return false
  if(value.notionalCoef !== undefined && !isPositiveNumeric(value.notionalCoef)) return false

  return value.brackets.every((bracket, index) => {
    const previousBracket = value.brackets[index - 1]

    return isPlainObject(bracket) &&
      isNonNegativeNumeric(bracket.notionalFloor) &&
      isPositiveNumeric(bracket.notionalCap) &&
      Number(bracket.notionalCap) > Number(bracket.notionalFloor) &&
      (index === 0 || Number(bracket.notionalFloor) >= Number(previousBracket.notionalCap)) &&
      Number.isInteger(Number(bracket.initialLeverage)) &&
      Number(bracket.initialLeverage) > 0
  })
}

export const validateEnvironment = (environment) => {
    if (!['testnet', 'production'].includes(environment)) {
      throw new Error('Invalid environment. Allowed values are "testnet" and "production".')
    }
  }
  
export const validateCredentials = (credentials, environment) => {
    if (!isPlainObject(credentials)) {
        throw new Error('Invalid type: "credentials" must be a non-null object.')
    }

    if (!hasOwn(credentials, environment)) {
        throw new Error(`Missing credentials for environment: "${environment}".`)
    }

    const envCredentials = credentials[environment]
    if (!isPlainObject(envCredentials)) {
        throw new Error(`Invalid credentials for environment: "${environment}".`)
    }

    if (!hasOwn(envCredentials, 'API_KEY') || typeof envCredentials.API_KEY !== 'string' || envCredentials.API_KEY.trim() === '') {
        throw new Error(`Missing or invalid "API_KEY" in credentials for environment "${environment}".`)
    }

    if (!hasOwn(envCredentials, 'API_SECRET') || typeof envCredentials.API_SECRET !== 'string' || envCredentials.API_SECRET.trim() === '') {
        throw new Error(`Missing or invalid "API_SECRET" in credentials for environment "${environment}".`)
    }
}
  
export const validateStrategy = (strategy) => {
    if (!isPlainObject(strategy)) {
      throw new Error('Invalid type: "strategy" must be a non-null object.')
    }
    if (!hasOwn(strategy, 'environment')) {
      throw new Error('Missing "environment" property in strategy object.')
    }
    if(!['testnet', 'production'].includes(strategy.environment))
    {
      throw new Error('Invalid "environment" property. Only "testnet" and "production" are accepted.')
    }
  
    if (typeof strategy.symbol !== 'string' || !/^[A-Z0-9]+$/.test(strategy.symbol)) {
      throw new Error('Invalid "symbol" property in strategy object.')
    }

    if(typeof strategy.settlementCurrency !== 'string' || !/^[A-Z0-9]+$/.test(strategy.settlementCurrency))
    {
      throw new Error('Invalid "settlementCurrency" property in strategy object.')
    }

  
    if(hasOwn(strategy, 'marginType'))
    {
      if(typeof strategy.marginType !== 'string' || !['ISOLATED', 'CROSSED'].includes(strategy.marginType))
      {
        throw new Error('Invalid "marginType" property in strategy object. Only "ISOLATED" and "CROSSED" margins are supported.')
      }
    }
  
    if(hasOwn(strategy, 'useServerTime'))
    {
      if(typeof strategy.useServerTime !== 'boolean')
      {
        throw new Error('Invalid "useServerTime" property in strategy object. Only boolean value is accepted')
      }
    }
  
    if(hasOwn(strategy, 'debug'))
    {
      if(typeof strategy.debug !== 'boolean')
      {
        throw new Error('Invalid "debug" property in strategy object. Only boolean value is accepted')
      }
    }

    if(hasOwn(strategy, 'useMarkPrice'))
    {
      if(typeof strategy.useMarkPrice !== 'boolean')
      {
        throw new Error('Invalid "useMarkPrice" property in strategy object. Only boolean value is accepted')
      }
    }

    const expectedContractName = `${strategy.symbol}${strategy.settlementCurrency}`

    if(hasOwn(strategy, 'leverageBracket'))
    {
      if(!isValidLeverageBracket(strategy.leverageBracket, expectedContractName))
      {
        throw new Error('Invalid "leverageBracket" property in strategy object.')
      }
    }

    if(hasOwn(strategy, 'contractInfo'))
    {
      if(!isValidContractInfo(strategy.contractInfo, expectedContractName))
      {
        throw new Error('Invalid "contractInfo" property in strategy object.')
      }
    }

    if(hasOwn(strategy, 'balance'))
    {
      assertNonNegativeFiniteNumber(strategy.balance, 'balance')
    }

    if(hasOwn(strategy, 'rateLimitCoolDownSeconds'))
    {
      if(
        !Number.isInteger(strategy.rateLimitCoolDownSeconds) ||
        strategy.rateLimitCoolDownSeconds <= 0
      )
      {
        throw new Error('Invalid "rateLimitCoolDownSeconds" property in strategy object. It must be a positive integer.')
      }
    }

    if(hasOwn(strategy, 'fundingFeePolicy'))
    {
      const policy = strategy.fundingFeePolicy

      if(!isPlainObject(policy))
      {
        throw new Error('Invalid "fundingFeePolicy" property in strategy object. It must be an object.')
      }

      if(hasOwn(policy, 'enabled') && typeof policy.enabled !== 'boolean')
      {
        throw new Error('Invalid "fundingFeePolicy.enabled". It must be a boolean.')
      }

      if(hasOwn(policy, 'expectedIntervalHours') && (!Number.isInteger(policy.expectedIntervalHours) || policy.expectedIntervalHours <= 0))
      {
        throw new Error('Invalid "fundingFeePolicy.expectedIntervalHours". It must be a positive integer.')
      }

      const validateRate = (property, {allowNull = false} = {}) => {
        if(!hasOwn(policy, property)) return
        const value = policy[property]

        if(allowNull && value === null) return

        if(typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        {
          throw new Error(`Invalid "fundingFeePolicy.${property}". It must be a finite, non-negative decimal rate${allowNull ? ' or null' : ''}.`)
        }
      }

      const fundingPolicyEnabled = policy.enabled ?? false

      validateRate('maxFundingRatePerHour', {allowNull: !fundingPolicyEnabled})
      validateRate('maxFundingRatePerSettlement', {allowNull: true})

      if(fundingPolicyEnabled && !hasOwn(policy, 'maxFundingRatePerHour'))
      {
        throw new Error('Missing "fundingFeePolicy.maxFundingRatePerHour" for an enabled funding fee policy.')
      }

      if(hasOwn(policy, 'entryBlackoutMinutes') && (
        typeof policy.entryBlackoutMinutes !== 'number' ||
        !Number.isFinite(policy.entryBlackoutMinutes) ||
        policy.entryBlackoutMinutes < 0
      ))
      {
        throw new Error('Invalid "fundingFeePolicy.entryBlackoutMinutes". It must be a finite, non-negative number.')
      }

      if(hasOwn(policy, 'postFundingBufferSeconds') && (
        typeof policy.postFundingBufferSeconds !== 'number' ||
        !Number.isFinite(policy.postFundingBufferSeconds) ||
        policy.postFundingBufferSeconds < 0
      ))
      {
        throw new Error('Invalid "fundingFeePolicy.postFundingBufferSeconds". It must be a finite, non-negative number.')
      }

      if(hasOwn(policy, 'pendingOrderAction') && !['IGNORE', 'ALERT', 'CANCEL'].includes(policy.pendingOrderAction))
      {
        throw new Error('Invalid "fundingFeePolicy.pendingOrderAction". Only "IGNORE", "ALERT", and "CANCEL" are accepted.')
      }

      if(hasOwn(policy, 'openPositionAction') && !['IGNORE', 'ALERT', 'CLOSE'].includes(policy.openPositionAction))
      {
        throw new Error('Invalid "fundingFeePolicy.openPositionAction". Only "IGNORE", "ALERT", and "CLOSE" are accepted.')
      }
    }

}


export const validateReduceOrders = (triggerPrice, handleExistingOrders) => {

  assertPositiveFiniteNumber(triggerPrice, 'triggerPrice')

  if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE'].includes(handleExistingOrders))
  {
    throw new Error('Invalid "handleExistingOrders" property in createStopLossOrder or createTakeProfitOrder. Only "KEEP", "ERROR", and "REPLACE" values are accepted.')
  }

}

const MIN_BINANCE_TIMESTAMP_MS = 1000000000000

export const normalizeOhlcvTime = (value, propertyName) => {
  let timestamp

  if (value instanceof Date) {
    timestamp = value.getTime()
  } else if (typeof value === 'number') {
    timestamp = value
  } else if (typeof value === 'string') {
    const normalizedValue = value.trim()
    const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizedValue)

    if (!hasExplicitTimezone) {
      throw new Error(`"${propertyName}" must include an explicit timezone, such as "Z" or "-05:00".`)
    }

    timestamp = Date.parse(normalizedValue)
  } else {
    timestamp = NaN
  }

  if (!Number.isSafeInteger(timestamp) || timestamp < MIN_BINANCE_TIMESTAMP_MS) {
    throw new Error(`"${propertyName}" must be a valid epoch timestamp in milliseconds, a Date, or an ISO string with an explicit timezone.`)
  }

  return timestamp
}

export const validateOhlcv = ({ interval, limit, startTime, endTime, klineType, contractType }) => {
  const validIntervals = [
    "1m","3m","5m","15m","30m",
    "1h","2h","4h","6h","8h",
    "12h","1d","3d","1w","1M"
  ];

  const isNil = v => v == null

  // interval
  if (isNil(interval) || !validIntervals.includes(interval)) {
    throw new Error(`Invalid "interval". Accepted values are: ${validIntervals.join(", ")}.`);
  }

  const validKlines = ['klines', 'continuousKlines', 'indexPriceKlines', 'markPriceKlines', 'premiumIndexKlines']

  if(typeof klineType !== 'string' || !validKlines.includes(klineType)) {
    throw new Error(`Invalid "klineType". Accepted values are: ${validKlines.join(", ")}.`);
  }

  const validContractTypes = ['PERPETUAL', 'CURRENT_QUARTER', 'NEXT_QUARTER', 'TRADIFI_PERPETUAL']

  if(klineType === 'continuousKlines' && !validContractTypes.includes(contractType)) {
    throw new Error(`Invalid "contractType". Accepted values for continuousKlines are: ${validContractTypes.join(", ")}.`)
  }

  const hasLimit = !isNil(limit);
  const hasStart = !isNil(startTime);
  const hasEnd   = !isNil(endTime);

  if (hasLimit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1500) {
      throw new Error('"limit" must be an integer between 1 and 1500 (inclusive).');
    }
  }

  const normalizedStartTime = hasStart ? normalizeOhlcvTime(startTime, 'startTime') : null
  const normalizedEndTime = hasEnd ? normalizeOhlcvTime(endTime, 'endTime') : null

  if (hasStart && hasEnd && normalizedStartTime >= normalizedEndTime) {
    throw new Error('"startTime" must be earlier than "endTime".')
  }

  return true
};


export const validateCallbacks = (callbacks = {}, engine) => {
  if (!isPlainObject(callbacks)) {
    throw new Error(`Invalid type: "callbacks" property must be an object.`);
  }

  if (hasOwn(callbacks, 'errorLogger') && typeof callbacks.errorLogger !== 'function') {
    throw new Error(`Invalid type: "callbacks.errorLogger" must be a callback function.`);
  }

  if (hasOwn(callbacks, 'fundingRiskAlert') && typeof callbacks.fundingRiskAlert !== 'function') {
    throw new Error(`Invalid type: "callbacks.fundingRiskAlert" must be a callback function.`);
  }

  if (engine !== 'google-apps-script') {
    if (hasOwn(callbacks, 'fetch')) {
      if (typeof callbacks.fetch !== 'function') {
        throw new Error(`Invalid type: "callbacks.fetch" must be a standard Fetch API callback.`);
      }
    } else {
      throw new Error(`The current engine "${engine}" requires "fetch" to be provided as a parameter in callbacks.`);
    }

    if (hasOwn(callbacks, 'crypto')) {
      const crypto = callbacks.crypto
      const supportsNodeCrypto = typeof crypto?.createHmac === 'function'
      const supportsWebCrypto = typeof (crypto?.subtle ?? crypto?.webcrypto?.subtle)?.sign === 'function'

      if (!supportsNodeCrypto && !supportsWebCrypto) {
        throw new Error(`Invalid type: "callbacks.crypto" must be a standard Web Crypto API callback. Use globalThis.crypto or require('node:crypto').webcrypto or import crypto from 'node:crypto' to access this module.`);
      }
    } else {
      throw new Error(`The current engine "${engine}" requires "crypto" to be provided as a parameter in callbacks.`);
    }
  }
};
