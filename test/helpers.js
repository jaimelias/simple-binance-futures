import crypto from 'node:crypto'
import BinanceFutures from '../index.js'

export const credentials = {testnet: {API_KEY: 'test-key', API_SECRET: 'test-secret'}}
export const strategy = overrides => ({
  environment: 'testnet', symbol: 'BTC', settlementCurrency: 'USDT', ...overrides
})
export const contractInfo = {
  symbol: 'BTCUSDT', pricePrecision: 2, quantityPrecision: 3,
  filters: [
    {filterType: 'PRICE_FILTER', tickSize: '0.10'},
    {filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.001'},
    {filterType: 'MIN_NOTIONAL', notional: '5'}
  ]
}
export const leverageBracket = {
  symbol: 'BTCUSDT', notionalCoef: 1,
  brackets: [
    {notionalFloor: 0, notionalCap: 10000, initialLeverage: 20},
    {notionalFloor: 10000, notionalCap: 50000, initialLeverage: 10}
  ]
}

export const unexpectedRequest = async () => { throw new Error('Unexpected network request.') }
export const jsonResponse = (body, status = 200, headers = {}) => ({
  status, headers, text: async () => JSON.stringify(body)
})
export const createExchange = ({strategy: overrides, fetch = unexpectedRequest, callbacks = {}} = {}) => (
  new BinanceFutures(credentials, strategy(overrides), {crypto, fetch, ...callbacks})
)

export const createCache = (initialValues = {}) => {
  const values = new Map(Object.entries(initialValues))
  const puts = []
  const removals = []
  return {
    values, puts, removals,
    get: key => values.get(key) ?? null,
    put: (key, value, expirationInSeconds) => {
      values.set(key, value)
      puts.push({key, value, expirationInSeconds})
    },
    remove: key => { values.delete(key); removals.push(key) }
  }
}

export const mockGlobals = (t, values) => {
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true})
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original)
      else delete globalThis[key]
    })
  }
}

export const mockAppsScript = (t, {body, status = 200, headers = {}}) => {
  const cache = createCache()
  const properties = new Map()
  const fetch = t.mock.fn(() => ({
    getResponseCode: () => status,
    getContentText: () => JSON.stringify(body),
    getAllHeaders: () => headers
  }))
  mockGlobals(t, {
    ScriptApp: {},
    CacheService: {getScriptCache: () => cache},
    PropertiesService: {getScriptProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key)
    })},
    UrlFetchApp: {fetch},
    Session: {getScriptTimeZone: () => 'Etc/UTC'},
    fetch: undefined, crypto: undefined, Utilities: undefined
  })
  return {cache, properties, fetch}
}
