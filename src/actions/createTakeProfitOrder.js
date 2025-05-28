import { validateReduceOrders } from "../utilities/validators.js"

/**
 * Creates a take-profit market order for an existing position.
 *
 * @async
 * @function createTakeProfitOrder
 * @param {Object} params - The parameters object.
 * @param {Object} params.main - The main context object, providing methods like `getPositions`, `getContractInfo`, and `fetch`.
 * @param {number} params.triggerPrice - The price at which the take-profit order will be triggered.
 * @param {('KEEP' | 'ERROR' | 'REPLACE')} params.handleExistingOrders - Strategy to handle existing take-profit orders:
 *   - **KEEP**: Retain existing orders and skip creating a new one.
 *   - **ERROR**: Throw an error if an existing order is found.
 *   - **REPLACE**: Cancel existing orders before creating a new one.
 * @returns {Promise<Object>} A promise that resolves to the response from creating the take-profit order.
 * @throws Will throw an error if:
 *   - No open position is found for the specified contract.
 *   - The provided `triggerPrice` is invalid for the position.
 *   - An existing take-profit order is found and `handleExistingOrders` is set to `'ERROR'`.
 */

export const createTakeProfitOrder = async ({main, triggerPrice, handleExistingOrders, positions, orders, workingType = 'MARK_PRICE'}) => {
    /* 
      Payload for a BUY position:
      {
          "symbol": "BTCUSDT",
          "side": "SELL",
          "positionSide": "BOTH",
          "type": "TAKE_PROFIT_MARKET",
          "timeInForce": "GTE_GTC",
          "quantity": 0,
          "stopPrice": "100000",
          "workingType": "MARK_PRICE",
          "closePosition": true,
          "placeType": "position",
          "priceProtect": true
      }
    */

    validateReduceOrders(triggerPrice, handleExistingOrders)

    const type = 'TAKE_PROFIT_MARKET'

    if(!positions)
    {
      positions = await main.getPositions();
    }
    
    const position = positions.find(o => o.symbol === main.contractName && parseFloat(o.positionAmt) !== 0);

    if (!position) {
        throw new Error(`No open position found for ${main.contractName} in createTakeProfitOrder`);
    }

    const ignoreOrder = await funcHandleExistingReduceOrders({main, handleExistingOrders, type, orders, triggerPrice})

    if(ignoreOrder){
      console.log('Ignoring take profit order because of "KEEP".')
      return true
    }
   
    const { entryPrice, positionAmt } = position;
    const side = (parseFloat(positionAmt) > 0) ? 'BUY' : 'SELL'
    const contractInfo = await main.getContractInfo(); // Fetch contract details for precision
    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER');

    // Adjust stop price to tickSize precision
    const adjustedStopPrice = parseFloat((Math.round(triggerPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision));

    // Validate stop price for the given position
    if ((side === 'SELL' && adjustedStopPrice >= parseFloat(entryPrice)) || (side === 'BUY' && adjustedStopPrice <= parseFloat(entryPrice))) {
        await main.closePosition({positions, side})
        throw new Error(`Invalid take-profit triggerPrice "${triggerPrice}" for ${side} position forced to close position.`);
    }


    const payload = {
        symbol: main.contractName,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        positionSide: 'BOTH',
        type,
        timeInForce: 'GTE_GTC',
        quantity: 0, // Close entire position
        stopPrice: adjustedStopPrice,
        workingType: main.workingType,
        closePosition: true,
        placeType: 'position',
        priceProtect: true,
        workingType
    }

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
      console.log('payload createTakeProfitOrder', {payload, response})
    }

    if(!response.hasOwnProperty('orderId'))
    {
        await main.closePosition({positions, side})
        throw new Error(`Error in createTakeProfitOrder forced to close position: ${JSON.stringify({...response, side, triggerPrice, adjustedStopPrice, tickSize})}`)
    }
    
    return response
}


const funcHandleExistingReduceOrders = async ({main, handleExistingOrders, type, orders, triggerPrice}) => {

  if(!orders)
  {
    orders = await main.getOrders()
  }

  const order = orders.find(o => o.origType === type)

  if(order)
  {

    if(handleExistingOrders === 'KEEP')
    {
      return true
    }
    else if(handleExistingOrders === 'ERROR')
    {
      throw new Error('New "take profit" order not execute because of an existing "take profit" order.')
    }
    
    const stopPrice = parseFloat(order.stopPrice)

    if(stopPrice === triggerPrice) return true

    const canceledOrder = await main.cancelOrder(order)

    if(main.debug)
    {
      console.log(`createTakeProfitOrder canceled order`, canceledOrder)
    }
  }

  return false
}