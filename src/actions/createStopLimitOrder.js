import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { getOrderExpirationParams } from '../utilities/utilities.js'
import { keyPairObjToString } from '../utilities/ErrorHandler.js'
import {
  assertOptionalArray,
  assertPositiveFiniteNumber,
  isPlainObject,
  validateExpirationInMinutes
} from '../utilities/validators.js'

export const createStopLimitOrder = async ({
    main, 
    side = 'BUY', 
    amountInUSD, 
    stopPrice, 
    limitPrice, 
    handleExistingOrders = 'ADD',
    expirationInMinutes = 10.1,
    orders
}) => {

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

    validateStopLimitOrder({main, side, amountInUSD, stopPrice, limitPrice, handleExistingOrders, expirationInMinutes})

    const ignoreOrder = await funcHandleExistingOrders({main, side, stopPrice, limitPrice, handleExistingOrders, orders})

    if(ignoreOrder)
    {
        console.log('Ignoring create limit order because of "KEEP".')
        return false
    }

    const contractInfo = await main.getContractInfo()
    const {contractName, leverage} = main
    const quantity = calculateQuantity(amountInUSD, leverage, contractInfo, limitPrice)

    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')

    const adjustedStopPrice = parseFloat((Math.round(stopPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision))
    const adjustedLimitPrice = parseFloat((Math.round(limitPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision))


    const payload = {
        algoType: 'CONDITIONAL',
        side,
        type: 'STOP',
        quantity,
        triggerPrice: adjustedStopPrice,
        price: adjustedLimitPrice,
        timeInForce: 'GTC',
        workingType: main.workingType,
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

    const response = await main.fetch('algoOrder', 'POST', payload)

    if(main.debug)
    {
        console.log('createStopLimitOrder', {payload, response})
    }

    if(!isPlainObject(response) || !Object.prototype.hasOwnProperty.call(response, 'algoId'))
    {
        throw new Error(`Error in createStopLimitOrder: ${keyPairObjToString({contractName, leverage, amountInUSD, ...response, stopPrice, limitPrice, side, quantity, tickSize})}`)
    }

    return response

}

const funcHandleExistingOrders = async ({main, side, stopPrice, limitPrice, handleExistingOrders, orders}) => {

    if(!orders)
    {
        orders = await main.getAlgoOrders()
    }

    if(!Array.isArray(orders)) {
        throw new Error('"orders" returned by Binance must be an array.')
    }
    
    const existingOrders = orders.filter(o => {
        const orderType = o.orderType ?? o.origType ?? o.type
        return o.symbol === main.contractName && orderType === 'STOP' && o.side === side && o.closePosition === false
    })

    if(existingOrders.length > 0)
    {
        //KEEP stops the creation of new orders if there are existing orders
        if(handleExistingOrders === 'KEEP')
        {
            if(main.debug)
            {
            console.log(`New order (stopPrice=${stopPrice}, limitPrice=${limitPrice} side=${side}) not executed. Found existing orders:`, existingOrders)
            }
            return true;
        }
        //ERROR throws error if existing orders are found
        else if(handleExistingOrders === 'ERROR')
        {
            throw Error(`New order (stopPrice=${stopPrice}, limitPrice=${limitPrice} side=${side}) not executed. Found duplicated orders: ${JSON.stringify(existingOrders)}`)
        }
        //REPLACE cancels existig orders and creates a new one
        else if(handleExistingOrders === 'REPLACE')
        {

            const canceledOrders = await Promise.all(existingOrders.map(order => main.cancelAlgoOrder(order)))

            if(main.debug)
            {
                console.log('cancelAlgoOrders', canceledOrders)
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

export const validateStopLimitOrder = ({main, side, amountInUSD, stopPrice, limitPrice, handleExistingOrders, expirationInMinutes}) => {

  try {
    assertPositiveFiniteNumber(main.leverage, 'leverage')
  } catch(error) {
    throw new Error('Before executing createStopLimitOrder, execute changeLeverage(leverage, amountInUSD).')
  }
  
  if(!side || !['BUY', 'SELL'].includes(side))
      {
          throw new Error('Invalid or missing property "side" in validateStopLimitOrder.');
      }
  assertPositiveFiniteNumber(amountInUSD, 'amountInUSD')
  assertPositiveFiniteNumber(stopPrice, 'stopPrice')
  assertPositiveFiniteNumber(limitPrice, 'limitPrice')
  validateExpirationInMinutes(expirationInMinutes, 'createStopLimitOrder')

  if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
  {
      throw new Error('Invalid "handleExistingOrders" property in "createStopLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
  }

  assertPositiveFiniteNumber(main.latestPrice, 'latestPrice')

  if(side === 'BUY' && stopPrice <= main.latestPrice)
      {
        throw new Error(`Immediate order execution error. In "createStopLimitOrder" side "BUY" the "stopPrice" (${stopPrice}) must be greater than the latest close price (${main.latestPrice}).`);
      }
      if(side === 'SELL' && stopPrice >= main.latestPrice)
      {
        throw new Error(`Immediate order execution error. In "createStopLimitOrder" side "SELL" the "stopPrice" (${stopPrice}) must be less than the latest close price (${main.latestPrice}).`);
      }
}
