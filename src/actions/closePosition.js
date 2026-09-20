
import { assertOptionalArray } from '../utilities/validators.js'

export const closePosition = async ({main, positions, side}) => {


    if(!['SELL', 'BUY'].includes(side))
    {
        throw new Error('Invalid "side" property in closePosition. Only "SELL" or "BUY" is accepted.')
    }

    assertOptionalArray(positions, 'positions')

    if(!positions)
    {
        positions = await main.getPositions();
    }

    if(!Array.isArray(positions)) {
        throw new Error('"positions" returned by Binance must be an array.')
    }

    
    const type = 'MARKET'


    const validSide = po => {
        const positionAmt = parseFloat(po.positionAmt)

        if(positionAmt !== 0)
        {
            if(positionAmt > 0 && side === 'BUY') return true
            if(positionAmt < 0 && side === 'SELL') return true
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
        side: side === 'BUY' ? 'SELL' : 'BUY',
        type,
        quantity,
        reduceOnly: true,
        positionSide: 'BOTH'
    }

    const response = await main.fetch('order', 'POST', payload)

    if(main.debug)
    {
        console.log('closePosition', {payload, response})
    }

    return response
}
