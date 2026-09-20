import { calculateQuantity } from '../utilities/calculateQuantity.js'
import { keyPairObjToString } from '../utilities/ErrorHandler.js'
import { assertPositiveFiniteNumber, isPlainObject } from '../utilities/validators.js'

/**
 * Creates a true market order, following the style and patterns of your other helpers
 * (limit / stop-limit), but without calling them.
 *
 * Key changes per request:
 * - No validation or logic around handleExistingOrders. Market orders are assumed to execute immediately.
 * - We keep the param in the signature for backward compatibility but it is ignored.
 *
 * @async
 * @function createMarketOrder
 * @param {Object} params
 * @param {Object} params.main - Trading context (must provide latestPrice, leverage, getContractInfo, fetch, etc.).
 * @param {('BUY'|'SELL')} [params.side='BUY'] - Order side.
 * @param {number} params.amountInUSD - USD notional used to compute quantity.
 * @param {Array} [params.orders] - Ignored. Left for backwards compatibility.
 * @returns {Promise<Object>} Exchange response object.
 */
export const createMarketOrder = async ({
  main,
  side = 'BUY',
  amountInUSD
}) => {
  // Ensure we have a price for sizing
  if (main.latestPrice === 0) {
    await main.ohlcv({
      interval: '5m',
      limit: 1,
      klineType: (main.workingType === 'CONTRACT_PRICE') ? 'indexPriceKlines' : 'markPriceKlines',
    })
  }

  validateCreateMarketOrder({ main, side, amountInUSD })

  const { contractName, leverage } = main
  const contractInfo = await main.getContractInfo()

  // Use latestPrice to size quantity. Exchanges ignore price for MARKET order creation.
  const latestPrice = main.latestPrice
  const quantity = calculateQuantity(amountInUSD, leverage, contractInfo, latestPrice)

  const payload = {
    side,
    type: 'MARKET',
    quantity,
    closePosition: false,
    reduceOnly: false,
  }

  if (typeof main.assertFundingEntryAllowed === 'function') {
    await main.assertFundingEntryAllowed({side, quantity})
  }

  const response = await main.fetch('order', 'POST', payload)

  if (main.debug) {
    console.log('createMarketOrder', { payload, response })
  }

  if (!isPlainObject(response) || !Object.prototype.hasOwnProperty.call(response, 'orderId')) {
    // Enrich the error with context similar to other helpers
    const ctx = { contractName, leverage, side, amountInUSD, latestPrice, payload, response }
    throw new Error(`Error in createMarketOrder: ${keyPairObjToString(ctx)}`)
  }

  return response
}

const validateCreateMarketOrder = ({ main, side, amountInUSD }) => {
  try {
    assertPositiveFiniteNumber(main.leverage, 'leverage')
  } catch(error) {
    throw new Error('Before executing createMarketOrder, execute changeLeverage(leverage, amountInUSD).')
  }
  if (!side || !['BUY', 'SELL'].includes(side)) {
    throw new Error('Invalid or missing property "side" in createMarketOrder.')
  }
  assertPositiveFiniteNumber(amountInUSD, 'amountInUSD')
  assertPositiveFiniteNumber(main.latestPrice, 'latestPrice')
}
