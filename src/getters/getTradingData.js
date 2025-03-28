export const getTradingData = async (main, ohlcvConfigArr = [], reloadBalances = true) => {

    const data = {
        positions: {
          BUY: [],
          SELL: []
        },      
        orders: {
          BUY: [],
          SELL: []
        },
        sl: {
          BUY: [],
          SELL: []
        },
        tp: {
          BUY: [],
          SELL: []
        },

        ohlcv: {}
      }
      const promises = [
        main.getPositions(),
        main.getOrders(),
        main.getBalance(reloadBalances),
        main.getContractInfo()
      ]
      const promiseKeyNames = ['positions', 'orders', 'balance', 'contractInfo']

      if(!Array.isArray(ohlcvConfigArr))
      {
        throw new Error('Error "ohlcvConfigArr" must be an array of objects in "getTradingData": [{ interval, startTime, endTime, limit }]')
      }

      for(const thisOhlcvConfig of ohlcvConfigArr)
      {
        const { interval, startTime, endTime, limit } = thisOhlcvConfig
        
        promises.push(
          main.ohlcv({ interval, startTime, endTime, limit })
        )

        promiseKeyNames.push(`ohlcv_${interval}`)
      }

      const resolvedPromises = await Promise.all(promises)

      for(let x = 0; x < promiseKeyNames.length; x++)
      {
        const [key, intervalKey] = promiseKeyNames[x].split('_')

        if(key === 'ohlcv')
        {
          data.ohlcv[intervalKey] = resolvedPromises[x]
        }
        else if(key === 'positions')
        {
          for(let position of resolvedPromises[x])
          {
            const amount = parseFloat(position.positionAmt)

            if(amount > 0) data.positions.BUY.push(position)
            if(amount < 0) data.positions.SELL.push(position)
            else continue
          }
        }
        else if(key === 'orders')
        {
          for(let order of resolvedPromises[x])
          {
            const {type, side, reduceOnly, closePosition} = order

            if(['MARKET', 'LIMIT', 'STOP'].includes(type) && reduceOnly === false && closePosition === false)
            {
              data.orders[side].push(order)
            }
            else if(type === 'STOP_MARKET' && reduceOnly && closePosition)
            {
              data.sl[side].push(order)
            }
            else if(type === 'TAKE_PROFIT_MARKET' && reduceOnly && closePosition)
            {
              data.tp[side].push(order)
            }
          }
        }
        else
        {
          data[key] = resolvedPromises[x]
        }
      }

      return data
}