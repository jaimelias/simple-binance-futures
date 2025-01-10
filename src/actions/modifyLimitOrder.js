export const modifyLimitOrder = async ({ main, orders, entryPrice, side, expirationInMinutes}) => {
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
    if (orders && !Array.isArray(orders)) {
        throw new Error('"orders" must be a valid array.');
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

    const { orderId, origQty, executedQty, timeInForce } = order;
    if (!orderId || isNaN(origQty) || isNaN(executedQty)) {
        throw new Error('"order" must contain valid orderId, origQty, and executedQty properties.');
    }

    const type = 'LIMIT'
    // Calculate the remaining quantity
    const quantity = parseFloat(origQty) - parseFloat(executedQty);
    if (quantity <= 0) {
        throw new Error('Remaining quantity must be greater than zero.');
    }

    // Prepare the payload for the request
    const payload = { orderId, quantity, price: entryPrice, side, type, timeInForce, timeInForce: 'GTC'}

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


    // Send the request to the endpoint
    const response = await main.fetch('order', 'PUT', payload);

    // Debug log
    if (main.debug) {
        console.log('modifyLimitOrder', { payload, response });
    }

    return response;
};
