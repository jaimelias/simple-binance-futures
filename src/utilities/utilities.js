export const millisecondsToDateStr = milliseconds => {
    const date = new Date(milliseconds)
  
    const pad = (value) => (value < 10 ? `0${value}` : value)
  
    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    const seconds = pad(date.getSeconds())
  
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export const getOrderExpirationParams = async ({main, expirationInMinutes}) => {

    const output = {timeInForce: null, goodTillDate: null}

    if(typeof expirationInMinutes === 'number')
    {
        if(expirationInMinutes <= 10)
        {
            expirationInMinutes = 10.1
        }

        const tenMinutesInMillis = expirationInMinutes * 60 * 1000; // 10 minutes in milliseconds

        let timestamp = Date.now()

        if(main.useServerTime)
        {
            timestamp = await main.getServerTime()
        }

        output.goodTillDate = timestamp + tenMinutesInMillis
        output.timeInForce = 'GTD'
    }

    return output

}