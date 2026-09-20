import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { getOrderExpirationParams } from '../utilities/utilities.js'
import { keyPairObjToString } from '../utilities/ErrorHandler.js'
import {
  assertOptionalArray,
  assertPositiveFiniteNumber,
  isPlainObject,
  validateExpirationInMinutes
} from '../utilities/validators.js'

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
 * @param {number} [params.expirationInMinutes=10.1] - The time (in minutes) until the order expires.
 *   A minimum of 10.1 minutes is required.
 * @returns {Promise<Object>} A promise that resolves to the response from creating the limit order.
 */

export const  createLimitOrder = async ({main, side = 'BUY', amountInUSD, entryPrice, handleExistingOrders = 'ADD', expirationInMinutes = 10.1, orders, ignoreImmediateExecErr = false}) => {

    assertOptionalArray(orders, 'orders')
  

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

    if(typeof main.assertFundingEntryAllowed === 'function') {
        await main.assertFundingEntryAllowed({side, quantity})
    }

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
        console.log('createLimitOrder', {payload, response})
    }

    if(!isPlainObject(response) || !Object.prototype.hasOwnProperty.call(response, 'orderId'))
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

    if(!Array.isArray(orders)) {
        throw new Error('"orders" returned by Binance must be an array.')
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

    try {
      assertPositiveFiniteNumber(main.leverage, 'leverage')
    } catch(error) {
      throw new Error('Before executing createLimitOrder, execute changeLeverage(leverage, amountInUSD).')
    }

  if(!side || !['BUY', 'SELL'].includes(side))
        {
            throw new Error('Invalid or missing property "side" in createLimitOrder.');
        }
    assertPositiveFiniteNumber(amountInUSD, 'amountInUSD')
    assertPositiveFiniteNumber(entryPrice, 'entryPrice')
    validateExpirationInMinutes(expirationInMinutes, 'createLimitOrder')

    if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
    {
        throw new Error('Invalid "handleExistingOrders" property in "createLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
    }

    if(typeof ignoreImmediateExecErr !== 'boolean')
    {
      throw new Error('Invalid property "ignoreImmediateExecErr" in createLimitOrder. It must be a boolean.');
    }
    else{
      if(ignoreImmediateExecErr === false)
      {
        assertPositiveFiniteNumber(main.latestPrice, 'latestPrice')

        if(side === 'BUY' && entryPrice >= main.latestPrice)
        {
          throw new Error(`Immediate order execution error. In "createLimitOrder" side "BUY" the "entryPrice" (${entryPrice}) must be less than the latest close price (${main.latestPrice}).`);
        }
        if(side === 'SELL' && entryPrice <= main.latestPrice)
        {
          throw new Error(`Immediate order execution error. In "createLimitOrder" side "SELL" the "entryPrice" (${entryPrice}) must be greater than the latest close price (${main.latestPrice}).`);
        }
      }
    }
}
