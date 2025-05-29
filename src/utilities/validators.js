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

    if(strategy.hasOwnProperty('useMarkPrice'))
    {
      if(typeof strategy.useMarkPrice !== 'boolean')
      {
        throw new Error('Invalid "useMarkPrice" property in strategy object. Only boolean value is accepted')
      }
    }

    if(strategy.hasOwnProperty('leverageBracket'))
    {
      if(typeof strategy.leverageBracket !== 'object' || !strategy.leverageBracket.hasOwnProperty('brackets'))
      {
        throw new Error('Invalid "leverageBracket" property in strategy object. Only objects with the property "brackets" are accepted.')
      }
    }

    if(strategy.hasOwnProperty('contractInfo'))
    {
      if(typeof strategy.contractInfo !== 'object' || !strategy.contractInfo.hasOwnProperty('symbol'))
      {
        throw new Error('Invalid "contractInfo" property in strategy object. Only objects with the property "symbol" are accepted.')
      }
    }

    if(strategy.hasOwnProperty('balance'))
    {
      if(typeof strategy.balance !== 'number')
      {
        throw new Error('Invalid "balance" property in strategy object. Only numbers are accepted.')
      }
    }

  }


export const validateCreateLimitOrder = ({main, side, leverage, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes, ignoreImmediateExecErr}) => {
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

    if(typeof ignoreImmediateExecErr !== 'boolean')
    {
      throw new Error('Invalid property "side" in "ignoreImmediateExecErr". "ignoreImmediateExecErr" must be a boolean.');
    }
    else{
      if(ignoreImmediateExecErr === false && main.hasOwnProperty('latestPrice') && main.latestPrice > 0 )
      {
        if(side === 'BUY' && entryPrice > main.latestPrice)
        {
          throw new Error(`Immediate order execution error. In "createLimitOrder" side "BUY" the "entryPrice" (${entryPrice}) must be less than the latest close price (${main.latestPrice}).`);
        }
        if(side === 'SELL' && entryPrice < main.latestPrice)
        {
          throw new Error(`Immediate order execution error. In "createLimitOrder" side "SELL" the "entryPrice" (${entryPrice}) must be greater than the latest close price (${main.latestPrice}).`);
        }
      }
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

export const validateOhlcv = ({ interval, limit = 500, startTime, endTime }) => {
  // List of valid intervals
  const validIntervals = [
    "1m", "3m", "5m", "15m", "30m", 
    "1h", "2h", "4h", "6h", "8h", 
    "12h", "1d", "3d", "1w", "1M"
  ];


  // Validate interval
  if (!interval) {
    throw new Error('"interval" is required.');
  }

  if (!validIntervals.includes(interval)) {
    throw new Error(`Invalid "interval". Accepted values are: ${validIntervals.join(", ")}.`);
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


export const validateStopLimitOrder = ({main, side, amountInUSD, entryPrice, fraction, handleExistingOrders, expirationInMinutes}) => {
  if(!side || !['BUY', 'SELL'].includes(side))
      {
          throw new Error('Invalid or missing property "side" in validateStopLimitOrder.');
      }
  if(typeof amountInUSD !== 'number' || amountInUSD <= 0)
  {
      throw new Error('Missing or invalid "amountInUSD" in createStopLimitOrder. "amountInUSD" must be a positive number.');
  }

  if(typeof entryPrice !== 'number' || entryPrice <= 0)
  {
      throw new Error('Missing or invalid "entryPrice" in createStopLimitOrder. "entryPrice" must be a positive number.');
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
          throw new Error('Invalid "expirationInMinutes" in createStopLimitOrder. "expirationInMinutes" must be a positive number greater than or equal to 10.');
      }
  }

  if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
  {
      throw new Error('Invalid "handleExistingOrders" property in "createStopLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
  }

  if(main.hasOwnProperty('latestPrice') && main.latestPrice > 0 )
  {
      if(side === 'BUY' && entryPrice < main.latestPrice)
      {
        throw new Error(`Immediate order execution error. In "createStopLimitOrder" side "BUY" the "entryPrice" (${entryPrice}) must be greater than the latest close price (${main.latestPrice}).`);
      }
      if(side === 'SELL' && entryPrice > main.latestPrice)
      {
        throw new Error(`Immediate order execution error. In "createStopLimitOrder" side "SELL" the "entryPrice" (${entryPrice}) must be less than the latest close price (${main.latestPrice}).`);
      }
  }
} 