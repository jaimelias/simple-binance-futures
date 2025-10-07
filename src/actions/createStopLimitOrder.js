import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { getOrderExpirationParams } from '../utilities/utilities.js'
import { keyPairObjToString } from '../utilities/ErrorHandler.js'

export const createStopLimitOrder = async ({
    main, 
    side = 'BUY', 
    amountInUSD, 
    stopPrice, 
    limitPrice, 
    handleExistingOrders, 
    expirationInMinutes = 10, 
    orders
}) => {

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
        side,
        type: 'STOP',
        quantity,
        stopPrice: adjustedStopPrice,
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

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
        console.log('createStopLimitOrder', {payload, response})
    }

    if(!response.hasOwnProperty('orderId'))
    {
        throw new Error(`Error in createStopLimitOrder: ${keyPairObjToString({contractName, leverage, amountInUSD, ...response, stopPrice, limitPrice, side, quantity, tickSize})}`)
    }

    return response

}

const funcHandleExistingOrders = async ({main, side, stopPrice, limitPrice, handleExistingOrders, orders}) => {

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

export const validateStopLimitOrder = ({main, side, amountInUSD, stopPrice, limitPrice, handleExistingOrders, expirationInMinutes}) => {
  
  if(!main.leverage || typeof main.leverage !== 'number')
  {
    throw new Error('Before executing createLimitOrder, execute changeLeverage(leverage, amountInUsd). ');
  }
  
  if(!side || !['BUY', 'SELL'].includes(side))
      {
          throw new Error('Invalid or missing property "side" in validateStopLimitOrder.');
      }
  if(typeof amountInUSD !== 'number' || amountInUSD <= 0)
  {
      throw new Error('Missing or invalid "amountInUSD" in createStopLimitOrder. "amountInUSD" must be a positive number.');
  }

  if(typeof stopPrice !== 'number' || stopPrice <= 0)
  {
      throw new Error('Missing or invalid "stopPrice" in createStopLimitOrder. "stopPrice" must be a positive number.');
  }
  if(typeof limitPrice !== 'number' || limitPrice <= 0)
  {
      throw new Error('Missing or invalid "limitPrice" in createStopLimitOrder. "limitPrice" must be a positive number.');
  }

  if(typeof expirationInMinutes !== 'undefined')
  {
      if(typeof expirationInMinutes === 'number' && expirationInMinutes >= 10)
      {
          //do nothing
      }
      else
      {
          throw new Error('Invalid "expirationInMinutes" in createStopLimitOrder. "expirationInMinutes" must be a positive number greater than or equal to 10.');
      }
  }

  if(!handleExistingOrders || !['KEEP', 'ERROR', 'REPLACE', 'ADD'].includes(handleExistingOrders))
  {
      throw new Error('Invalid "handleExistingOrders" property in "createStopLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".');
  }

  if(main.hasOwnProperty('latestPrice') && main.latestPrice > 0 )
  {
      if(side === 'BUY' && stopPrice < main.latestPrice)
      {
        throw new Error(`Immediate order execution error. In "createStopLimitOrder" side "BUY" the "entryPrice" (${stopPrice}) must be greater than the latest close price (${main.latestPrice}).`);
      }
      if(side === 'SELL' && stopPrice > main.latestPrice)
      {
        throw new Error(`Immediate order execution error. In "createStopLimitOrder" side "SELL" the "entryPrice" (${stopPrice}) must be less than the latest close price (${main.latestPrice}).`);
      }
  }
} 