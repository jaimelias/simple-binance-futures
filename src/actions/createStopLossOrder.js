export const createStopLossOrder = async(main, triggerPrice) => {
    /* 
      Payload for a BUY position:
      {
          "symbol": "BTCUSDT",
          "side": "SELL",
          "positionSide": "BOTH",
          "type": "STOP_MARKET",
          "timeInForce": "GTE_GTC",
          "quantity": 0,
          "stopPrice": "96000",
          "workingType": "MARK_PRICE",
          "closePosition": true,
          "placeType": "position",
          "priceProtect": true
      }
    */

    const positions = await main.getPositions();
    const position = positions.find(o => o.symbol === main.contractName && parseFloat(o.positionAmt) !== 0);

    if (!position) {
        throw new Error(`No open position found for ${main.contractName}`);
    }

    const orders = await main.getOrders();
    const order = orders.find(o => o.origType === 'STOP_MARKET')

    if(order)
    {
      const canceledOrder = await main.cancelOrder(order)

      if(main.debug)
      {
        console.log(`createStopLossOrder canceled order`, canceledOrder)
      }
    }

    const { entryPrice, positionAmt } = position;
    const side = (parseFloat(positionAmt) > 0) ? 'BUY' : 'SELL'
    const contractInfo = await main.getContractInfo();
    const { tickSize } = contractInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER');

    // Adjust stop price to tickSize precision
    const adjustedStopPrice = parseFloat((Math.round(triggerPrice / tickSize) * tickSize).toFixed(contractInfo.pricePrecision));

    // Validate stop price for the given position
    if ((side === 'SELL' && adjustedStopPrice <= parseFloat(entryPrice)) || (side === 'BUY' && adjustedStopPrice >= parseFloat(entryPrice))) {
        throw new Error(`Invalid stop-loss price for ${side} position.`);
    }


    const payload = {
        symbol: main.contractName,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        positionSide: 'BOTH',
        type: 'STOP_MARKET',
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
      console.log('payload createStopLossOrder', payload)
    }
    

    return (await main.fetch('order', 'POST', payload));
}