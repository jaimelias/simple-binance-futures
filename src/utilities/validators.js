export const validateEnvironment = (environment) => {
    if (!['testnet', 'production'].includes(environment)) {
      throw new Error('Invalid environment. Allowed values are "testnet" and "production".')
    }
  }
  
export const validateCredentials = (credentials, environment) => {
    if (typeof credentials !== 'object' || credentials === null) {
        throw new Error('Invalid type: "credentials" must be a non-null object.')
    }

    if (!credentials.hasOwnProperty(environment)) {
        throw new Error(`Missing credentials for environment: "${environment}".`)
    }

    const envCredentials = credentials[environment];
    if (!envCredentials.hasOwnProperty('API_KEY')) {
        throw new Error(`Missing "API_KEY" in credentials for environment "${environment}".`)
    }

    if (!envCredentials.hasOwnProperty('API_SECRET')) {
        throw new Error(`Missing "API_SECRET" in credentials for environment "${environment}".`)
    }
}
  
export const validateStrategy = (strategy) => {
    if (typeof strategy !== 'object' || strategy === null) {
      throw new Error('Invalid type: "strategy" must be a non-null object.')
    }
    if (!strategy.hasOwnProperty('environment')) {
      throw new Error('Missing "environment" property in strategy object.')
    }
    if(!['testnet', 'production'].includes(strategy.environment))
    {
      throw new Error('Invalid "environment" property. Only "testnet" and "production" are accepted.')
    }
  
    if (!strategy.symbol) {
      throw new Error('Invalid "symbol" property in strategy object.')
    }

    if(!strategy.settlementCurrency)
    {
      throw new Error('Invalid "symbol" property in strategy object.')
    }
  
    if (!strategy.hasOwnProperty('leverage')) {
      throw new Error('Missing "leverage" property in strategy object.')
    }
  
    if(strategy.hasOwnProperty('marginType'))
    {
      if(typeof strategy.marginType !== 'string' || !['ISOLATED', 'CROSSED'].includes(strategy.marginType))
      {
        throw new Error('Invalid "marginType" property in strategy object. Only "ISOLATED" and "CROSSED" margins are supported.')
      }
    }
  
    if(strategy.hasOwnProperty('useServerTime'))
    {
      if(typeof strategy.useServerTime !== 'boolean')
      {
        throw new Error('Invalid "useServerTime" property in strategy object. Only boolean value is accepted')
      }
    }
  
    if(strategy.hasOwnProperty('debug'))
    {
      if(typeof strategy.debug !== 'boolean')
      {
        throw new Error('Invalid "debug" property in strategy object. Only boolean value is accepted')
      }
    }
  
    const leverage = strategy.leverage;
    if (typeof leverage !== 'number' || isNaN(leverage) || leverage <= 0) {
      throw new Error('Invalid "leverage". It must be a positive number.')
    }


    if(strategy.hasOwnProperty('workingType'))
    {
      if(!['MARK_PRICE', 'CONTRACT_PRICE'].includes(strategy.workingType))
      {
        throw new Error('Invalid "workingType" property. Only "MARK_PRICE" and "CONTRACT_PRICE" are accepted.')
      }
    }

  }


export const validateCreateLimitOrder = ({side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes}) => {
    if(!side || !['BUY', 'SELL'].includes(side))
        {
            throw new Error('Invalid or missing property "side" in createLimitOrder.');
        }
    if(typeof amountInUSD !== 'number' || amountInUSD <= 0)
    {
        throw new Error('Missing or invalid "amountInUSD" in createLimitOrder. "amountInUSD" must be a positive number.');
    }

    if(typeof entryPrice !== 'number' || entryPrice <= 0)
    {
        throw new Error('Missing or invalid "entryPrice" in createLimitOrder. "entryPrice" must be a positive number.');
    }

    if(typeof expirationInMinutes !== 'undefined')
    {
        if(typeof expirationInMinutes === 'number' && expirationInMinutes >= 10)
        {
            //do nothing
        }
        else
        {
            throw new Error('Invalid "expirationInMinutes" in createLimitOrder. "expirationInMinutes" must be a positive number greater than or equal to 10.');
        }
    }

    if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
    {
        throw new Error('Invalid "handleExistingOrders" property in "createLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
    }
} 


export const validateReduceOrders = (triggerPrice, handleExistingOrders) => {


  if(typeof triggerPrice === 'number' && triggerPrice >= 10)
  {
      //do nothing
  }
  else
  {
      throw new Error('Invalid "triggerPrice" property in createStopLossOrder or createTakeProfitOrder. "triggerPrice" must be a positive number greater than 0.')
  }

  if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE'].includes(handleExistingOrders))
  {
    throw new Error('Invalid "handleExistingOrders" property in createStopLossOrder or createTakeProfitOrder. Only "KEEP", "ERROR", and "REPLACE" values are accepted.')
  }

}

export const validateOhlcv = ({ interval, limit = 500, startTime, endTime, klineType }) => {
  // List of valid intervals
  const validIntervals = [
    "1m", "3m", "5m", "15m", "30m", 
    "1h", "2h", "4h", "6h", "8h", 
    "12h", "1d", "3d", "1w", "1M"
  ];

  const validKlineTypes = ['klines', 'continuousKlines', 'indexPriceKlines', 'markPriceKlines', 'premiumIndexKlines']

  // Validate interval
  if (!interval) {
    throw new Error('"interval" is required.');
  }

  if (!validIntervals.includes(interval)) {
    throw new Error(`Invalid "interval". Accepted values are: ${validIntervals.join(", ")}.`);
  }

  if(klineType)
  {
    if(!validKlineTypes.includes(klineType))
    {
      throw new Error(`Invalid "klineType". Accepted values are: ${validKlineTypes.join(", ")}.`);
    }
  }

  // Validate limit
  if (typeof limit !== "number" || limit < 1 || limit > 1500) {
    throw new Error('"limit" must be a number between 1 and 1500 (inclusive).');
  }

  // If limit is provided, disallow startTime and endTime
  if (limit && (startTime || endTime)) {
    throw new Error('"ohlcv" does not accept "limit" together with "startTime" or "endTime".');
  }

  // If limit is not provided, require both startTime and endTime
  if (!limit && (!startTime || !endTime)) {
    throw new Error('"ohlcv" requires either "limit" or both "startTime" and "endTime".');
  }

  // Optional: Ensure startTime is before endTime if both are provided
  if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
    throw new Error('"startTime" must be earlier than "endTime".');
  }
}

export const validateCallbacks = (callbacks = {}, engine) => {
  if (typeof callbacks !== 'object') {
    throw new Error(`Invalid type: "callbacks" property must be an object.`);
  }

  if (callbacks.hasOwnProperty('errorLogger') && typeof callbacks.errorLogger !== 'function') {
    throw new Error(`Invalid type: "callbacks.errorLogger" must be a callback function.`);
  }

  if (engine !== 'google-app-script') {
    if (callbacks.hasOwnProperty('fetch')) {
      if (typeof callbacks.fetch !== 'function' && typeof callbacks.fetch !== 'object') {
        throw new Error(`Invalid type: "callbacks.fetch" must be a standard Fetch API callback.`);
      }
    } else {
      throw new Error(`The current engine "${engine}" requires "fetch" to be provided as a parameter in callbacks.`);
    }

    if (callbacks.hasOwnProperty('crypto')) {
      if (typeof callbacks.crypto !== 'function' && typeof callbacks.crypto !== 'object') {
        throw new Error(`Invalid type: "callbacks.crypto" must be a standard Web Crypto API callback. Use globalThis.crypto or require('node:crypto').webcrypto or import crypto from 'node:crypto' to access this module.`);
      }
    } else {
      throw new Error(`The current engine "${engine}" requires "crypto" to be provided as a parameter in callbacks.`);
    }
  }
};


export const validateStopLimitOrder = ({side, amountInUSD, entryPrice, fraction, handleExistingOrders, expirationInMinutes}) => {
  if(!side || !['BUY', 'SELL'].includes(side))
      {
          throw new Error('Invalid or missing property "side" in createLimitOrder.');
      }
  if(typeof amountInUSD !== 'number' || amountInUSD <= 0)
  {
      throw new Error('Missing or invalid "amountInUSD" in createLimitOrder. "amountInUSD" must be a positive number.');
  }

  if(typeof entryPrice !== 'number' || entryPrice <= 0)
  {
      throw new Error('Missing or invalid "entryPrice" in createLimitOrder. "entryPrice" must be a positive number.');
  }
  if(typeof fraction !== 'number' || fraction <= 0)
  {
      throw new Error('Missing or invalid "fraction" in createStopLimitOrder. "fraction" must be a positive number.');
  }

  if(typeof expirationInMinutes !== 'undefined')
  {
      if(typeof expirationInMinutes === 'number' && expirationInMinutes >= 10)
      {
          //do nothing
      }
      else
      {
          throw new Error('Invalid "expirationInMinutes" in createLimitOrder. "expirationInMinutes" must be a positive number greater than or equal to 10.');
      }
  }

  if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
  {
      throw new Error('Invalid "handleExistingOrders" property in "createLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
  }
} 