import { validateReduceOrders } from "../utilities/validators.js"
import { keyPairObjToString } from "../utilities/ErrorHandler.js"

/**
 * Creates a stop-loss market order for an existing position.
 *
 * @async
 * @function createStopLossOrder
 * @param {Object} params - The parameters object.
 * @param {Object} params.main - The main context object, providing methods like `getPositions`, `getContractInfo`, and `fetch`.
 * @param {number} params.triggerPrice - The price at which the stop-loss order will be triggered.
 * @param {('KEEP' | 'ERROR' | 'REPLACE')} [params.handleExistingOrders='REPLACE'] - Strategy to handle existing stop-loss orders:
 *   - **KEEP**: Retain existing orders and skip creating a new one.
 *   - **ERROR**: Throw an error if an existing order is found.
 *   - **REPLACE**: Cancel existing orders before creating a new one.
 * @returns {Promise<Object>} A promise that resolves to the response from creating the stop-loss order.
 * @throws Will throw an error if:
 *   - No open position is found for the specified contract.
 *   - The provided `triggerPrice` is invalid for the position.
 *   - An existing stop-loss order is found and `handleExistingOrders` is set to `'ERROR'`.
 */

export const createStopLossOrder = async({main, triggerPrice, handleExistingOrders = 'REPLACE', positions, orders}) => {


    validateReduceOrders(triggerPrice, handleExistingOrders)

    const type = 'STOP_MARKET'

    if(!positions)
    {
      positions = await main.getPositions();
    }

    const position = positions.find(o => o.symbol === main.contractName && parseFloat(o.positionAmt) !== 0);

    if (!position) {
        throw new Error(`No open position found for ${main.contractName} in createStopLossOrder`);
    }

    const ignoreOrder = await funcHandleExistingReduceOrders({main, handleExistingOrders, type, orders, triggerPrice})

    if(ignoreOrder){
      console.log('Ignoring stop loss order because of "KEEP".')
      return true
    }

    const {contractName, workingType} = main
    const { entryPrice, positionAmt } = position;
    const side = (parseFloat(positionAmt) > 0) ? 'BUY' : 'SELL'
    const contractInfo = await main.getContractInfo();
    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER');

    // Adjust stop price to tickSize precision
    const adjustedStopPrice = parseFloat((Math.round(triggerPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision));

    // Validate stop price for the given position
    if ((side === 'SELL' && adjustedStopPrice <= parseFloat(entryPrice)) || (side === 'BUY' && adjustedStopPrice >= parseFloat(entryPrice))) {
        await main.closePosition({positions, side})
        throw new Error(`Invalid stop-loss triggerPrice "${triggerPrice}" for ${side} position forced to close position.`);
    }


    const payload = {
        symbol: contractName,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        positionSide: 'BOTH',
        type,
        timeInForce: 'GTE_GTC',
        quantity: 0, // Close entire position
        stopPrice: adjustedStopPrice,
        workingType,
        closePosition: true,
        placeType: 'position',
        priceProtect: true,
    }


    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
      console.log('createStopLossOrder', {payload, response})
    }

    if(!response.hasOwnProperty('orderId'))
    {
        await main.closePosition({positions, side})
        throw new Error(`Error in createStopLossOrder forced to close position: ${keyPairObjToString({contractName, ...response, side, triggerPrice, adjustedStopPrice, tickSize})}`)
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
      console.log(`createStopLossOrder canceled order`, canceledOrder)
    }
  }

  return false
}