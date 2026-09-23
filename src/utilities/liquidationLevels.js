import {assertPositiveFiniteNumber, assertPositiveInteger, validateOhlcv} from './validators.js'

const DEFAULT_LEVERAGES = [5, 10, 25, 50, 100]

export const validateLiquidationLevelsOptions = ({interval, limit, step, top, leverages, maintenanceMarginRate}) => {
  validateOhlcv({interval, limit, klineType: 'klines'})
  if(step !== undefined) assertPositiveFiniteNumber(step, 'step')
  assertPositiveInteger(top, 'top')
  if(!Array.isArray(leverages) || leverages.length === 0 ||
    leverages.some(value => !Number.isSafeInteger(value) || value <= 1) ||
    new Set(leverages).size !== leverages.length) {
    throw new Error('"leverages" must be a non-empty array of distinct integers greater than 1.')
  }
  const maxLeverage = leverages.reduce((max, value) => Math.max(max, value), 0)
  if(typeof maintenanceMarginRate !== 'number' || !Number.isFinite(maintenanceMarginRate) ||
    maintenanceMarginRate < 0 || maintenanceMarginRate >= 1 / maxLeverage) {
    throw new Error('"maintenanceMarginRate" must be non-negative and below 1 / max(leverage).')
  }
}

export const liquidationLevelsDefaults = {
  interval: '1h',
  limit: 500,
  top: 10,
  leverages: DEFAULT_LEVERAGES,
  maintenanceMarginRate: 0.004
}

export const estimateLiquidationLevels = ({tradeKlines, markKlines, step, top, leverages, maintenanceMarginRate}) => {
  if(!Array.isArray(tradeKlines) || !Array.isArray(markKlines) ||
    tradeKlines.length !== markKlines.length) {
    throw new Error('Trade and mark-price candle responses must be aligned.')
  }
  if(tradeKlines.length === 0) {
    return {method: 'volumeProxy', step: step ?? null, candleCount: 0, longLiquidations: [], shortLiquidations: []}
  }

  const candles = []
  const now = Date.now()
  for(let i = 0; i < tradeKlines.length; i++) {
    const trade = tradeKlines[i]
    const mark = markKlines[i]
    if(!Array.isArray(trade) || !Array.isArray(mark) || trade[0] !== mark[0]) {
      throw new Error('Trade and mark-price candles are not aligned by open time.')
    }
    const high = Number(mark[2])
    const low = Number(mark[3])
    const close = Number(mark[4])
    const volume = Number(trade[5])
    if(!Number.isSafeInteger(mark[0]) || !Number.isSafeInteger(mark[6]) ||
      !Number.isSafeInteger(trade[6]) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) ||
      !Number.isFinite(volume) || high <= 0 || low <= 0 || close <= 0 ||
      high < low || close < low || close > high || volume < 0) {
      throw new Error('Invalid trade volume or mark-price candle values.')
    }
    // Use an open candle to invalidate older levels, but not to seed new levels.
    candles.push({high, low, close, volume, closed: mark[6] <= now && trade[6] <= now})
  }

  const closedCandles = candles.filter(candle => candle.closed)
  if(closedCandles.length === 0) {
    return {method: 'volumeProxy', step: step ?? null, candleCount: 0, longLiquidations: [], shortLiquidations: []}
  }

  const bucketStep = step ?? closedCandles[closedCandles.length - 1].close * 0.001
  const longs = new Map()
  const shorts = new Map()
  let lowestLater = Infinity
  let highestLater = -Infinity

  const add = (map, price, score) => {
    const bucket = Math.round(price / bucketStep) * bucketStep
    map.set(bucket, (map.get(bucket) ?? 0) + score)
  }

  for(let i = candles.length - 1; i >= 0; i--) {
    const {high, low, close, volume, closed} = candles[i]
    const score = volume / (2 * leverages.length)

    if(closed) for(const leverage of leverages) {
      // Simplified isolated-margin price: equity = maintenance margin.
      // Assumes initial margin = entry notional / leverage, no extra collateral or fees.
      const longPrice = close * (1 - 1 / leverage) / (1 - maintenanceMarginRate)
      const shortPrice = close * (1 + 1 / leverage) / (1 + maintenanceMarginRate)
      if(lowestLater > longPrice) add(longs, longPrice, score)
      if(highestLater < shortPrice) add(shorts, shortPrice, score)
    }
    lowestLater = Math.min(lowestLater, low)
    highestLater = Math.max(highestLater, high)
  }

  const sorted = map => [...map.entries()]
    .map(([price, score]) => ({price, score}))
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .slice(0, top)

  return {
    method: 'volumeProxy',
    step: bucketStep,
    candleCount: closedCandles.length,
    longLiquidations: sorted(longs),
    shortLiquidations: sorted(shorts)
  }
}
