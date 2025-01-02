import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { validateCreateLimitOrder } from '../utilities/validators.js'

export  const  createLimitOrder = async ({main, side = 'BUY', amountInUSD, entryPrice, handleExistingOrders = 'ADD', expirationInMinutes = 10}) => {
  
    validateCreateLimitOrder({side, amountInUSD, entryPrice, handleExistingOrders, expirationInMinutes})
    await funcHandleExistingOrders({main, side, entryPrice, handleExistingOrders})

    const contractInfo = await main.getContractInfo()
    const quantity = calculateQuantity(amountInUSD, main.leverage, contractInfo, entryPrice)


    const payload = {
        side,
        type: 'LIMIT',
        quantity,
        price: entryPrice,
        timeInForce: 'GTC'
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


    return await main.fetch('order', 'POST', payload);
}

const funcHandleExistingOrders = async ({main, side, entryPrice, handleExistingOrders}) => {

    const orders = await main.getOrders()
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
            return false;
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

    return true
}