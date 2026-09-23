import { validateExpirationInMinutes } from './validators.js'

export const getOrderExpirationParams = async ({main, expirationInMinutes}) => {

    const output = {timeInForce: null, goodTillDate: null}

    if(expirationInMinutes !== undefined)
    {
        validateExpirationInMinutes(expirationInMinutes, 'getOrderExpirationParams')

        const expirationInMillis = expirationInMinutes * 60 * 1000

        let timestamp = Date.now()

        if(main.useServerTime)
        {
            timestamp = await main.getServerTime()
        }

        output.goodTillDate = Math.floor((timestamp + expirationInMillis) / 1000) * 1000
        output.timeInForce = 'GTD'
    }

    return output

}
