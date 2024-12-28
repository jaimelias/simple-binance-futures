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
  
    if (!strategy.hasOwnProperty('contractName')) {
      throw new Error('Missing "contractName" property in strategy object.')
    }
  
    if (
      typeof strategy.contractName !== 'string' || 
      !strategy.contractName.endsWith('USDT')
    ) {
      throw new Error('Invalid "contractName". Only USD-M contracts are supported (e.g., "BTCUSDT").');
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
  }


export const validateCreateLimitOrder = ({side, amountInUSDT, entryPrice, handleExistingOrders, expirationInMinutes}) => {
    if(!side || !['BUY', 'SELL'].includes(side))
        {
            throw new Error('Invalid or missing property "side" in createLimitOrder.');
        }
    if(typeof amountInUSDT !== 'number' || amountInUSDT <= 0)
    {
        throw new Error('Missing or invalid "amountInUSDT" in createLimitOrder. "amountInUSDT" must be a positive number.');
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
            throw new Error('Invalid "expirationInMinutes" in createLimitOrder. "expirationInMinutes" must be a positive number larger than or equal to 10.');
        }
    }

    if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
    {
        throw new Error('Invalid "handleExistingOrders" property in "createLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
    }
} 