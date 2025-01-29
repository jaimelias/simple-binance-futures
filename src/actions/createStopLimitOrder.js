import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { validateStopLimitOrder } from '../utilities/validators.js'

export const createStopLimitOrder = async ({main, side = 'BUY', amountInUSD, entryPrice, fraction, handleExistingOrders, expirationInMinutes = 10, orders}) => {

    /*  this is the payload of a BUY STOP_LIMIT order:

        {
            "symbol": "BTCUSDT",
            "type": "STOP",
            "side": "BUY",
            "positionSide": "BOTH",
            "quantity": 0.024,
            "reduceOnly": false,
            "price": "101250",
            "stopPrice": "101200",
            "workingType": "MARK_PRICE",
            "timeInForce": "GTC",
            "priceProtect": true,
            "placeType": "order-form"
        }
    */

    validateStopLimitOrder({side, amountInUSD, entryPrice, fraction, handleExistingOrders, expirationInMinutes})

    const ignoreOrder = await funcHandleExistingOrders({main, side, entryPrice, handleExistingOrders, orders})

    if(ignoreOrder)
    {
        console.log('Ignoring create limit order because of "KEEP".')
        return true
    }

    const stopPrice = entryPrice
    const limitPrice = (side === 'BUY') ? entryPrice + (entryPrice * fraction) : entryPrice - (entryPrice * fraction)

    const contractInfo = await main.getContractInfo()
    const quantity = calculateQuantity(amountInUSD, main.leverage, contractInfo, entryPrice)

    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')

    const adjustedStopPrice = parseFloat((Math.round(stopPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision))
    const adjustedLimitPrice = parseFloat((Math.round(limitPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision))


    const payload = {
        side,
        type: 'STOP',
        quantity,
        stopPrice: adjustedStopPrice,
        price: adjustedLimitPrice,
        timeInForce: 'GTC',
        workingType: main.workingType
    }

    if(typeof expirationInMinutes === 'number')
    {
        if(expirationInMinutes <= 10)
        {
            expirationInMinutes = 10.1
        }

        const tenMinutesInMillis = expirationInMinutes * 60 * 1000; // 10 minutes in milliseconds

        let timestamp = Date.now()

        if(main.useServerTime)
        {
            timestamp = await main.getServerTime()
        }

        payload.goodTillDate = timestamp + tenMinutesInMillis
        payload.timeInForce = 'GTD'
    }

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
        console.log('createStopLimitOrder', {payload, response})
    }

    if(!response.hasOwnProperty('orderId'))
    {
        throw new Error(`Error in createStopLimitOrder: ${JSON.stringify({...response, entryPrice, adjustedEntryPrice, side, quantity, tickSize})}`)
    }

    return response

}

const funcHandleExistingOrders = async ({main, side, entryPrice, handleExistingOrders, orders}) => {

    if(!orders)
    {
        orders = await main.getOrders()
    }
    
    const existingOrders = orders.filter(o => o.symbol === main.contractName && o.type === 'STOP' && o.side === side && o.reduceOnly === false && o.priceProtect === false && o.closePosition === false && o.goodTillDate)

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