export const modifyLimitOrder = async ({ main, order, newPrice, side, expirationInMinutes = 10}) => {
    // Validate that price is a number
    if (isNaN(newPrice) || newPrice <= 0) {
        throw new Error('newPrice must be a positive number.');
    }

    if (isNaN(expirationInMinutes) || expirationInMinutes < 10) {
        throw new Error('expirationInMinutes must be a positive number greater than 10.');
    }

    // Validate that side is "SELL" or "BUY"
    if (!['SELL', 'BUY'].includes(side)) {
        throw new Error('Side must be either "SELL" or "BUY".');
    }

    // Validate that order is an object with the required properties
    if (!order || typeof order !== 'object') {
        throw new Error('Order must be a valid object.');
    }
    const { orderId, origQty, executedQty, timeInForce } = order;
    if (!orderId || isNaN(origQty) || isNaN(executedQty)) {
        throw new Error('Order must contain valid orderId, origQty, and executedQty properties.');
    }


    const type = 'LIMIT'
    // Calculate the remaining quantity
    const quantity = parseFloat(origQty) - parseFloat(executedQty);
    if (quantity <= 0) {
        throw new Error('Remaining quantity must be greater than zero.');
    }

    // Prepare the payload for the request
    const payload = { orderId, quantity, price: newPrice, side, type, timeInForce, timeInForce: 'GTC'}

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