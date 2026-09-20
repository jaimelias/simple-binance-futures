import { getSignature } from './getSignature.js'
import { handleNodeFetch } from './handleNodeFetch.js'
import { handleGoogleAppsScriptFetch } from './handleGoogleAppsScriptFetch.js'

const publicEndpoints = [
  'time',
  'exchangeInfo',
  'klines',
  'continuousKlines',
  'indexPriceKlines',
  'markPriceKlines',
  'premiumIndexKlines',
  'premiumIndex',
  'fundingInfo',
  'fundingRate'
]

const endpointsWithoutSymbol = ['time', 'exchangeInfo', 'continuousKlines', 'indexPriceKlines', 'fundingInfo']

export const getEngine = () => {
    if (typeof ScriptApp !== 'undefined') {
      return 'google-apps-script'
    } else if (typeof process !== 'undefined' && process.release?.name === 'node') {
      return 'node'
    } else if (typeof Deno !== 'undefined') {
      return 'deno'
    } else if (typeof Bun !== 'undefined') {
      return 'bun'
    } else if (typeof WebSocketPair !== 'undefined') {
      // Cloudflare Workers environment exposes `WebSocketPair` globally.
      return 'cloudflare-worker'
    } else {
      return 'unknown'
    }
}

export const universalFetch = async (main, pathname, method, payload, version) => {

  if(typeof main.assertRateLimitAvailable === 'function') {
    main.assertRateLimitAvailable()
  }

  const basePayload = { ...payload }

  const omitSymbol = endpointsWithoutSymbol.includes(pathname) || (pathname === 'algoOrder' && method === 'DELETE')

  if (!omitSymbol && !basePayload.hasOwnProperty('symbol')) {
    basePayload.symbol = main.contractName
  }

  if (!publicEndpoints.includes(pathname)) {
    let timestamp = Date.now()

    if (main.useServerTime) {
      timestamp = await main.getServerTime()
    }

    basePayload.timestamp = timestamp
    basePayload.recvWindow = 5000
  }

  const baseUrl = `${main.endpoint}/${version}/${pathname}`

  const queryString = Object.entries(basePayload)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

  let signedQuery = queryString

  if (!publicEndpoints.includes(pathname)) {
    const signature = await getSignature(main, queryString)
    signedQuery = `${queryString}&signature=${signature}`
  }

  // Prepare request options
  const headers = !publicEndpoints.includes(pathname) ? { 'X-MBX-APIKEY': main.API_KEY } : {}

  let finalUrl
  const options = { method, headers}

  if(main.engine === 'google-apps-script') {
    options.muteHttpExceptions = true
  }

  if (method === 'GET' || method === 'DELETE') {
    finalUrl = `${baseUrl}?${signedQuery}`
  } 
  else {
    finalUrl = baseUrl
    headers['Content-Type'] = 'application/x-www-form-urlencoded'

    if(main.engine === 'google-apps-script')
    {
      options.payload = signedQuery
    }
    else
    {
      options.body = signedQuery
    }
  }

  if(main.engine === 'google-apps-script')
  {
    return await handleGoogleAppsScriptFetch(main, finalUrl, options)
  }
  else
  {
    return await handleNodeFetch(main, finalUrl, options)
  }

}
