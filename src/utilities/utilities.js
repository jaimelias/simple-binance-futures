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