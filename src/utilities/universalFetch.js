import { getSignature } from './getSignature.js'
import { handleNodeFetch } from './handleNodeFetch.js'
import { handleGoogleAppsScriptFetch } from './handleGoogleAppsScriptFetch.js'

const publicEndpoints = ['time']

export const getEngine = () => {
    if (typeof ScriptApp !== 'undefined') {
      return 'google-app-script'
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

  const basePayload = { ...payload, symbol: main.contractName }

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

  const signature = getSignature(main, queryString)
  const signedQuery = !publicEndpoints.includes(pathname) ? `${queryString}&signature=${signature}`: queryString

  // Prepare request options
  const headers = !publicEndpoints.includes(pathname) ? { 'X-MBX-APIKEY': main.API_KEY } : {}

  let finalUrl
  const options = { method, headers}

  if (method === 'GET' || method === 'DELETE') {
    finalUrl = `${baseUrl}?${signedQuery}`
  } 
  else {
    finalUrl = baseUrl
    headers['Content-Type'] = 'application/x-www-form-urlencoded'

    if(main.engine === 'google-app-script')
    {
      options.payload = signedQuery
      options.muteHttpExceptions = true
    }
    else
    {
      options.body = signedQuery
    }
  }

  if(main.engine === 'google-app-script')
  {
    return await handleGoogleAppsScriptFetch(finalUrl, options)
  }
  else
  {
    return await handleNodeFetch(main, finalUrl, options)
  }

}


