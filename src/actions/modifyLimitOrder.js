import { getOrderExpirationParams } from '../utilities/utilities.js'

export const modifyLimitOrder = async ({ main, orders = [], entryPrice, side, expirationInMinutes = 10}) => {
    // Validate that price is a number
    if (isNaN(entryPrice) || entryPrice <= 0) {
        throw new Error('"entryPrice" must be a positive number.');
    }

    if(expirationInMinutes)
    {
        if (isNaN(expirationInMinutes) || expirationInMinutes < 10) {
            throw new Error('"expirationInMinutes" must be a positive number greater than 10.');
        }
    }

    // Validate that side is "SELL" or "BUY"
    if (!['SELL', 'BUY'].includes(side)) {
        throw new Error('"side" must be either "SELL" or "BUY".');
    }

    // Validate that order is an object with the required properties
    if (!Array.isArray(orders)) {
        throw new Error('"orders" must be a valid array.');
    }

    if(orders.length === 0)
    {
        orders = await main.getOrders()
    }

    const validSide = or => {
        const {origQty, executedQty} = or
        const quantity = parseFloat(origQty) - parseFloat(executedQty);

        if(quantity !== 0)
        {
            if(quantity > 0 && side === 'BUY') return true
            if(quantity < 0 && side === 'SELL') return true
        }

        return false
    }

    const order = (Array.isArray(orders))
    ? orders.find(o => o.symbol === main.contractName && o.type === 'LIMIT' && validSide(o))
    : false

    const { orderId, origQty, executedQty, price: prevEntryPrice } = order;

    if (!orderId || isNaN(origQty) || isNaN(executedQty)) {
        throw new Error('"order" must contain valid orderId, origQty, and executedQty properties.');
    }

    const type = 'LIMIT'
    // Calculate the remaining quantity
    const quantity = parseFloat(origQty) - parseFloat(executedQty);
    if (quantity <= 0) {
        throw new Error('Remaining quantity must be greater than zero.');
    }

    const contractInfo = await main.getContractInfo()
    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')

    const adjustPricePrecision = p => {
        p = parseFloat(p)

        return parseFloat((Math.round(p / tickSize) * tickSize).toFixed(contractInfo.pricePrecision))
    }

    const adjustedEntryPrice = adjustPricePrecision(entryPrice)
    const prevAdjustedEntryPrice = adjustPricePrecision(prevEntryPrice)

    if(adjustedEntryPrice === prevAdjustedEntryPrice)
    {
        return false
    }

    // Prepare the payload for the request
    const payload = { orderId, quantity, price: adjustedEntryPrice, side, type, timeInForce: 'GTC'}

    const { timeInForce, goodTillDate } = await getOrderExpirationParams({ main, expirationInMinutes })

    if (timeInForce && goodTillDate) {
        Object.assign(payload, { timeInForce, goodTillDate })
    }


    // Send the request to the endpoint
    const response = await main.fetch('order', 'PUT', payload);

    // Debug log
    if (main.debug) {
        console.log('modifyLimitOrder', { payload, response });
    }
    

    if(!response.hasOwnProperty('orderId'))
    {
        throw new Error(`Error in modifyLimitOrder: ${JSON.stringify({...response, entryPrice, adjustedEntryPrice, side, quantity, tickSize})}`)
    }

    return response;
};
