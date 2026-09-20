import { validateExpirationInMinutes } from './validators.js'

export const millisecondsToDateStr = milliseconds => {
    const date = new Date(milliseconds)
  
    const pad = (value) => (value < 10 ? `0${value}` : value)
  
    const year = date.getUTCFullYear()
    const month = pad(date.getUTCMonth() + 1)
    const day = pad(date.getUTCDate())
    const hours = pad(date.getUTCHours())
    const minutes = pad(date.getUTCMinutes())
    const seconds = pad(date.getUTCSeconds())
  
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

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
