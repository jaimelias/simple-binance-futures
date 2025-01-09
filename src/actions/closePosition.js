import { throws } from "assert";

export const closePosition = async ({main, positions, initialSide}) => {


    if(!['SELL', 'BUY'].includes(initialSide))
    {
        throw new Error('Invalid "initialSide" property in closePosition. Only "SELL" or "BUY" buy is accepted.')
    }

    if(!positions)
    {
        positions = await main.getPositions();
    }

    
    const type = 'MARKET'


    const validSide = po => {
        const positionAmt = parseFloat(po.positionAmt)

        if(positionAmt !== 0)
        {
            if(positionAmt > 0 && initialSide === 'BUY') return true
            if(positionAmt < 0 && initialSide === 'SELL') return true
        }

        return false
    }

    const position = positions.find(o => o.symbol === main.contractName && validSide(o))

    if (!position) {
        throw new Error(`No open position found for ${main.contractName} in closePosition`);
    }


    const quantity = Math.abs(parseFloat(position.positionAmt))

    const payload = {
        symbol: main.contractName,
        side: initialSide === 'BUY' ? 'SELL' : 'BUY',
        type,
        quantity,
        reduceOnly: true,
        isolated: main.marginType === 'ISOLATED',
        leverage: main.leverage,
        placeType: 'position',
        positionSide: 'BOTH'
    }

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
        console.log('closePosition', {payload, response})
    }

    return response
}