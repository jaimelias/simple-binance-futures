import { getOrderExpirationParams } from '../utilities/utilities.js'
import { keyPairObjToString } from '../utilities/ErrorHandler.js';
import {
    assertOptionalArray,
    assertPositiveFiniteNumber,
    isPlainObject,
    validateExpirationInMinutes
} from '../utilities/validators.js'

export const modifyLimitOrder = async ({ main, orders = [], entryPrice, side, expirationInMinutes = 10.1}) => {
    assertPositiveFiniteNumber(entryPrice, 'entryPrice')
    validateExpirationInMinutes(expirationInMinutes, 'modifyLimitOrder')

    // Validate that side is "SELL" or "BUY"
    if (!['SELL', 'BUY'].includes(side)) {
        throw new Error('"side" must be either "SELL" or "BUY".');
    }

    // Validate that order is an object with the required properties
    assertOptionalArray(orders, 'orders')

    if(orders.length === 0)
    {
        orders = await main.getOrders()
    }

    if(!Array.isArray(orders)) {
        throw new Error('"orders" returned by Binance must be an array.')
    }

    const hasRemainingQuantity = or => {
        const {origQty, executedQty} = or
        const quantity = parseFloat(origQty) - parseFloat(executedQty);

        return Number.isFinite(quantity) && quantity > 0
    }

    const {contractName} = main

    const order = (Array.isArray(orders))
    ? orders.find(o => o.symbol === contractName && o.type === 'LIMIT' && o.side === side && hasRemainingQuantity(o))
    : false

    if (!order) {
        throw new Error(`No open ${side} limit order found for ${contractName}.`)
    }

    const { orderId, origQty, executedQty, price: prevEntryPrice } = order;

    if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) <= 0 || !Number.isFinite(Number(origQty)) || !Number.isFinite(Number(executedQty))) {
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

    if(typeof main.assertFundingEntryAllowed === 'function') {
        await main.assertFundingEntryAllowed({side, quantity})
    }


    // Send the request to the endpoint
    const response = await main.fetch('order', 'PUT', payload);

    // Debug log
    if (main.debug) {
        console.log('modifyLimitOrder', { payload, response });
    }
    

    if(!isPlainObject(response) || !Object.prototype.hasOwnProperty.call(response, 'orderId'))
    {
        throw new Error(`Error in modifyLimitOrder: ${keyPairObjToString({contractName, ...response, entryPrice, adjustedEntryPrice, side, quantity, tickSize})}`)
    }

    return response;
};
