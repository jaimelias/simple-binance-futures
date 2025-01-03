import { validateReduceOrders } from "../utilities/validators.js"

export const createTakeProfitOrder = async ({main, triggerPrice, handleExistingOrders}) => {
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

    if(handleExistingOrders === 'KEEP') return false

    const type = 'TAKE_PROFIT_MARKET'
    const positions = await main.getPositions();
    const position = positions.find(o => o.symbol === main.contractName && parseFloat(o.positionAmt) !== 0);

    if (!position) {
        throw new Error(`No open position found for ${main.contractName}`);
    }

    await funcHandleExistingReduceOrders({main, handleExistingOrders, type})
   
    const { entryPrice, positionAmt } = position;
     const side = (parseFloat(positionAmt) > 0) ? 'BUY' : 'SELL'
    const contractInfo = await main.getContractInfo(); // Fetch contract details for precision
    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER');

    // Adjust stop price to tickSize precision
    const adjustedStopPrice = parseFloat((Math.round(triggerPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision));

    // Validate stop price for the given position
    if ((side === 'SELL' && adjustedStopPrice >= parseFloat(entryPrice)) || (side === 'BUY' && adjustedStopPrice <= parseFloat(entryPrice))) {
        throw new Error(`Invalid take-profit price for ${side} position.`);
    }


    const payload = {
        symbol: main.contractName,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        positionSide: 'BOTH',
        type,
        timeInForce: 'GTE_GTC',
        quantity: 0, // Close entire position
        stopPrice: adjustedStopPrice,
        workingType: 'MARK_PRICE',
        closePosition: true,
        placeType: 'position',
        priceProtect: true,
    }


    if(main.debug)
    {
      console.log('payload createTakeProfitOrder', payload)
    }
    

    return (await main.fetch('order', 'POST', payload));
}


const funcHandleExistingReduceOrders = async ({main, handleExistingOrders, type}) => {


  if(handleExistingOrders === 'KEEP')
  {
    return true
  }
  else if(handleExistingOrders === 'ERROR')
  {
    throw new Error('New "take profit" order not execute because of an existing "take profit" order.')
  }

  const orders = await main.getOrders()
  const order = orders.find(o => o.origType === type)

  if(order)
  {
    const canceledOrder = await main.cancelOrder(order)

    if(main.debug)
    {
      console.log(`createTakeProfitOrder canceled order`, canceledOrder)
    }
  }


}