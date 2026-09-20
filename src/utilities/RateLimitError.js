export default class RateLimitError extends Error {
  constructor({
    message,
    status = 429,
    retryAfterSeconds,
    lockedUntil,
    rateLimitUsage = {},
    responseBody = '',
    isLocalCooldown = false
  }) {
    super(message)
    this.name = 'RateLimitError'
    this.code = 'BINANCE_RATE_LIMIT'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
    this.lockedUntil = lockedUntil
    this.rateLimitUsage = rateLimitUsage
    this.responseBody = responseBody
    this.isLocalCooldown = isLocalCooldown
  }
}
