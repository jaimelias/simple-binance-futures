import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { validateCreateLimitOrder } from '../utilities/validators.js'
import { getOrderExpirationParams } from '../utilities/utilities.js'

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
        return true
    }

    const contractInfo = await main.getContractInfo()
    const quantity = calculateQuantity(amountInUSD, main.leverage, contractInfo, entryPrice)

    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')

    const adjustedEntryPrice = parseFloat((Math.round(entryPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision));


    const payload = {
        side,
        type: 'LIMIT',
        quantity,
        price: adjustedEntryPrice,
        timeInForce: 'GTC'
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
        throw new Error(`Error in createLimitOrder: ${JSON.stringify({...response, entryPrice, adjustedEntryPrice, side, quantity, tickSize})}`)
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