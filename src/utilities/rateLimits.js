import RateLimitError from './RateLimitError.js'

const normalizeHeaders = headers => {
  const normalized = {}

  if(!headers) return normalized

  if(typeof headers.forEach === 'function')
  {
    headers.forEach((value, key) => {
      normalized[String(key).toLowerCase()] = String(value)
    })
    return normalized
  }

  for(const [key, value] of Object.entries(headers))
  {
    normalized[String(key).toLowerCase()] = Array.isArray(value)
      ? value.join(', ')
      : String(value)
  }

  return normalized
}

const parseRetryAfterSeconds = value => {
  if(value === undefined) return null

  const seconds = Number(value)
  if(Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)

  const retryDate = new Date(value).getTime()
  if(Number.isNaN(retryDate)) return null

  return Math.max(0, Math.ceil((retryDate - Date.now()) / 1000))
}

const extractRateLimitUsage = headers => {
  const usage = {}

  for(const [key, value] of Object.entries(headers))
  {
    if(key.startsWith('x-mbx-used-weight-') || key.startsWith('x-mbx-order-count-'))
    {
      const parsedValue = Number(value)
      usage[key] = Number.isFinite(parsedValue) ? parsedValue : value
    }
  }

  return usage
}

export const inspectRateLimitResponse = ({main, status, headers, responseBody}) => {
  const normalizedHeaders = normalizeHeaders(headers)
  const rateLimitUsage = extractRateLimitUsage(normalizedHeaders)

  if(Object.keys(rateLimitUsage).length > 0)
  {
    main.rateLimitUsage = {
      ...main.rateLimitUsage,
      ...rateLimitUsage,
      observedAt: Date.now()
    }
  }

  if(status !== 418 && status !== 429) return

  const retryAfterSeconds = parseRetryAfterSeconds(normalizedHeaders['retry-after'])
  const lock = main.lockRateLimit({status, retryAfterSeconds})

  throw new RateLimitError({
    status,
    retryAfterSeconds: lock.retryAfterSeconds,
    lockedUntil: lock.lockedUntil,
    rateLimitUsage: main.rateLimitUsage,
    responseBody,
    message: status === 418
      ? `Binance IP ban active. Requests locked for ${lock.retryAfterSeconds} seconds.`
      : `Binance rate limit exceeded. Requests locked for ${lock.retryAfterSeconds} seconds.`
  })
}
