import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { getOrderExpirationParams } from '../utilities/utilities.js'
import { keyPairObjToString } from '../utilities/ErrorHandler.js'

/**
 * Creates a limit order with the specified parameters.
 *
 * @async
 * @function createLimitOrder
 * @param {Object} params - The parameters object.
 * @param {Object} params.main - The main context object, providing methods like `getContractInfo`, `fetch`, etc.
 * @param {('BUY' | 'SELL')} [params.side='BUY'] - The side of the order (e.g., 'BUY' or 'SELL').
 * @param {number} params.amountInUSD - The USD value for the desired position size.
 * @param {number} params.entryPrice - The price at which to set the limit order.
 * @param {('ADD' | 'KEEP' | 'ERROR' | 'REPLACE')} - How to handle existing limit orders if any are found:
 *   - **ADD**: Adds a new order without cancelling existing ones.
 *   - **KEEP**: Keeps existing orders and prevents the creation of a new one.
 *   - **ERROR**: Throws an error if any existing orders are found.
 *   - **REPLACE**: Cancels existing orders and then creates a new one.
 * @param {number} [params.expirationInMinutes=10] - The time (in minutes) until the order expires. 
 *   A minimum of 10.1 minutes is enforced if a value of 10 minutes or less is provided.
 * @returns {Promise<Object>} A promise that resolves to the response from creating the limit order.
 */

export const  createLimitOrder = async ({main, side = 'BUY', amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes = 10, orders, ignoreImmediateExecErr = false}) => {
  

    if(main.latestPrice === 0)
    {
        ///this sets main.latestPrice
        await main.ohlcv({
            interval: '5m', 
            limit: 1, 
            klineType: (main.workingType === 'CONTRACT_PRICE') ? 'indexPriceKlines' : 'markPriceKlines'
        })
    }

    validateCreateLimitOrder({main, side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes, ignoreImmediateExecErr})

    const ignoreOrder = await funcHandleExistingOrders({main, side, entryPrice, handleExistingOrders, orders})

    if(ignoreOrder)
    {
        console.log('Ignoring create limit order because of "KEEP".')
        return false
    }

    const {contractName, leverage} = main
    const contractInfo = await main.getContractInfo()
    const quantity = calculateQuantity(amountInUSD, leverage, contractInfo, entryPrice)

    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')

    const adjustedEntryPrice = parseFloat((Math.round(entryPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision));


    const payload = {
        side,
        type: 'LIMIT',
        quantity,
        price: adjustedEntryPrice,
        timeInForce: 'GTC',
        closePosition: false,
        reduceOnly: false,
    }

    const { timeInForce, goodTillDate } = await getOrderExpirationParams({ main, expirationInMinutes });

    if (timeInForce && goodTillDate) {
        Object.assign(payload, { timeInForce, goodTillDate })
    }

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
        console.log('createLimitOrder', {payload, response})
    }

    if(!response.hasOwnProperty('orderId'))
    {
        throw new Error(`Error in createLimitOrder: ${keyPairObjToString({contractName, leverage, amountInUSD, ...response, entryPrice, adjustedEntryPrice, side, quantity, tickSize})}`)
    }

    return response
}

const funcHandleExistingOrders = async ({main, side, entryPrice, handleExistingOrders, orders}) => {

    if(!orders)
    {
        orders = await main.getOrders()
    }
    
    const existingOrders = orders.filter(o => o.symbol === main.contractName && o.type === 'LIMIT' && o.side === side && o.reduceOnly === false && o.priceProtect === false && o.closePosition === false && o.goodTillDate)

    if(existingOrders.length > 0)
    {
        //KEEP stops the creation of new orders if there are existing orders
        if(handleExistingOrders === 'KEEP')
        {
            if(main.debug)
            {
            console.log(`New order (entryPrice=${entryPrice}, side=${side}) not executed. Found existing orders:`, existingOrders)
            }
            return true;
        }
        //ERROR throws error if existing orders are found
        else if(handleExistingOrders === 'ERROR')
        {
        throw Error(`New order (entryPrice=${entryPrice}, side=${side}) not executed. Found duplicated orders: ${JSON.stringify(existingOrders)}`)
        }
        //REPLACE cancels existig orders and creates a new one
        else if(handleExistingOrders === 'REPLACE')
        {

            const cancelMultipleOrders = await main.cancelMultipleOrders(existingOrders)

            if(main.debug)
            {
                console.log('cancelMultipleOrders', cancelMultipleOrders)
            }
        }
        //ADD submits new order even if there are existing orders
        else if(handleExistingOrders === 'ADD')
        {
            if(main.debug)
            {
                console.log('Existing orders found. Pushing new order without deleting existing orders.')
            }
        }
    }

    return false
}

export const validateCreateLimitOrder = ({main, side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes, ignoreImmediateExecErr}) => {
    
  if(!main.leverage || typeof main.leverage !== 'number')
  {
    throw new Error('Before executing createLimitOrder, execute changeLeverage(leverage, amountInUsd). ');
  }

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