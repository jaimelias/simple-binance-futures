export const DEFAULT_FUNDING_FEE_POLICY = Object.freeze({
  enabled: false,
  expectedIntervalHours: 8,
  maxFundingRatePerHour: null,
  maxFundingRatePerSettlement: null,
  entryBlackoutMinutes: 2,
  postFundingBufferSeconds: 30,
  pendingOrderAction: 'CANCEL',
  openPositionAction: 'ALERT'
})

export const normalizeFundingFeePolicy = (policy = {}) => ({
  ...DEFAULT_FUNDING_FEE_POLICY,
  ...policy
})

const parseFiniteNumber = (value, fieldName) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid "${fieldName}" returned by Binance.`)
  }

  return parsed
}

const getPremiumIndexForContract = (premiumIndex, contractName) => {
  const premium = Array.isArray(premiumIndex)
    ? premiumIndex.find(item => item.symbol === contractName)
    : premiumIndex

  if (!premium || premium.symbol !== contractName) {
    throw new Error(`Funding data not available for ${contractName}.`)
  }

  return premium
}

export const applyFundingSide = (state, {side, quantity, positionNotional} = {}) => {
  if (side !== undefined && !['BUY', 'SELL'].includes(side)) {
    throw new Error('Funding risk "side" must be either "BUY" or "SELL".')
  }

  const paysFunding = side === 'BUY'
    ? state.fundingRate > 0
    : side === 'SELL' && state.fundingRate < 0
  const adverseFundingRate = paysFunding ? Math.abs(state.fundingRate) : 0
  const fundingRatePerHour = adverseFundingRate / state.actualIntervalHours

  let notional = positionNotional
  if (notional === undefined && quantity !== undefined) {
    notional = Math.abs(parseFiniteNumber(quantity, 'quantity')) * state.markPrice
  }

  if (notional !== undefined) {
    notional = Math.abs(parseFiniteNumber(notional, 'positionNotional'))
  }

  return {
    ...state,
    side: side ?? null,
    paysFunding,
    adverseFundingRate,
    fundingRatePerHour,
    positionNotional: notional ?? null,
    estimatedFundingFee: notional === undefined ? null : notional * adverseFundingRate
  }
}

export const getFundingState = async ({main, side, quantity, positionNotional} = {}) => {
  const policy = main.fundingFeePolicy
  const [premiumIndex, fundingInfo] = await Promise.all([
    main.fetch('premiumIndex', 'GET', {}),
    main.fetch('fundingInfo', 'GET', {})
  ])

  const premium = getPremiumIndexForContract(premiumIndex, main.contractName)
  const adjustedFunding = Array.isArray(fundingInfo)
    ? fundingInfo.find(item => item.symbol === main.contractName)
    : undefined
  const actualIntervalHours = adjustedFunding?.fundingIntervalHours === undefined
    ? policy.expectedIntervalHours
    : parseFiniteNumber(adjustedFunding.fundingIntervalHours, 'fundingIntervalHours')

  if (actualIntervalHours <= 0) {
    throw new Error('Binance returned a non-positive funding interval.')
  }

  const fundingRate = parseFiniteNumber(premium.lastFundingRate, 'lastFundingRate')
  const markPrice = parseFiniteNumber(premium.markPrice, 'markPrice')
  const nextFundingTime = parseFiniteNumber(premium.nextFundingTime, 'nextFundingTime')
  const observedAt = premium.time === undefined
    ? Date.now()
    : parseFiniteNumber(premium.time, 'time')
  const baseState = {
    symbol: main.contractName,
    fundingRate,
    markPrice,
    nextFundingTime,
    observedAt,
    msToFunding: nextFundingTime - observedAt,
    expectedIntervalHours: policy.expectedIntervalHours,
    actualIntervalHours,
    intervalChanged: actualIntervalHours !== policy.expectedIntervalHours,
    adjustedFundingCap: adjustedFunding?.adjustedFundingRateCap === undefined
      ? null
      : Number(adjustedFunding.adjustedFundingRateCap),
    adjustedFundingFloor: adjustedFunding?.adjustedFundingRateFloor === undefined
      ? null
      : Number(adjustedFunding.adjustedFundingRateFloor)
  }

  return applyFundingSide(baseState, {side, quantity, positionNotional})
}

export const evaluateFundingRisk = (state, policy) => {
  if (!policy.enabled) {
    return {
      allowed: true,
      skipped: true,
      severity: 'safe',
      reasons: [],
      blockingReasons: [],
      warnings: [],
      isInEntryBlackout: false,
      state
    }
  }

  const blockingReasons = []
  const warnings = []
  const blackoutMs = policy.entryBlackoutMinutes * 60 * 1000
  const postFundingBufferMs = policy.postFundingBufferSeconds * 1000
  const isInEntryBlackout = state.paysFunding &&
    state.msToFunding >= -postFundingBufferMs &&
    state.msToFunding <= blackoutMs

  if (state.intervalChanged) {
    warnings.push('FUNDING_INTERVAL_CHANGED')
  }

  if (
    state.paysFunding &&
    state.fundingRatePerHour > policy.maxFundingRatePerHour
  ) {
    blockingReasons.push('MAX_FUNDING_RATE_PER_HOUR_EXCEEDED')
  }

  if (
    state.paysFunding &&
    policy.maxFundingRatePerSettlement !== null &&
    state.adverseFundingRate > policy.maxFundingRatePerSettlement
  ) {
    blockingReasons.push('MAX_FUNDING_RATE_PER_SETTLEMENT_EXCEEDED')
  }

  if (isInEntryBlackout) {
    blockingReasons.push('FUNDING_SETTLEMENT_WINDOW')
  }

  return {
    allowed: blockingReasons.length === 0,
    severity: blockingReasons.length > 0
      ? 'critical'
      : warnings.length > 0 ? 'warning' : 'safe',
    reasons: [...blockingReasons, ...warnings],
    blockingReasons,
    warnings,
    isInEntryBlackout,
    state
  }
}

const hasRemainingQuantity = order => {
  const original = Number(order.origQty ?? order.quantity ?? order.origQuantity)
  const executed = Number(order.executedQty ?? 0)

  return Number.isFinite(original) && Number.isFinite(executed) && original - executed > 0
}

const isEntryOrder = (order, contractName) =>
  order.symbol === contractName &&
  order.reduceOnly !== true &&
  order.closePosition !== true &&
  hasRemainingQuantity(order)

const remainingOrderQuantity = order => (
  Number(order.origQty ?? order.quantity ?? order.origQuantity) - Number(order.executedQty ?? 0)
)

const emitFundingAlert = async (main, event) => {
  if (typeof main.callbacks.fundingRiskAlert !== 'function') return

  try {
    await main.callbacks.fundingRiskAlert(event)
  } catch (error) {
    if (main.debug) {
      console.error('fundingRiskAlert callback failed:', error.message)
    }
  }
}

export const assertFundingEntryAllowed = async ({main, side, quantity, positionNotional}) => {
  if (!main.fundingFeePolicy.enabled) {
    return {allowed: true, skipped: true, reasons: []}
  }

  const state = await getFundingState({main, side, quantity, positionNotional})
  const decision = evaluateFundingRisk(state, main.fundingFeePolicy)

  if (!decision.allowed || state.intervalChanged) {
    await emitFundingAlert(main, {
      type: decision.allowed ? 'FUNDING_INTERVAL_CHANGED' : 'ENTRY_BLOCKED',
      decision
    })
  }

  if (!decision.allowed) {
    throw new Error(
      `Funding policy blocked ${side} entry for ${main.contractName}: ` +
      `${decision.blockingReasons.join(', ')}. ` +
      `rate=${state.fundingRate}, ratePerHour=${state.fundingRatePerHour}, ` +
      `intervalHours=${state.actualIntervalHours}, msToFunding=${state.msToFunding}.`
    )
  }

  return decision
}

export const checkFundingRisk = async ({main, orders, algoOrders, positions} = {}) => {
  if (!main.fundingFeePolicy.enabled) {
    return {
      enabled: false,
      fundingState: null,
      pendingOrders: [],
      openPositions: [],
      actions: []
    }
  }

  const [baseState, openOrders, openAlgoOrders, openPositions] = await Promise.all([
    getFundingState({main}),
    orders === undefined ? main.getOrders() : orders,
    algoOrders === undefined ? main.getAlgoOrders() : algoOrders,
    positions === undefined ? main.getPositions() : positions
  ])
  const pendingOrders = []
  const positionRisks = []
  const actions = []

  if (baseState.intervalChanged) {
    await emitFundingAlert(main, {
      type: 'FUNDING_INTERVAL_CHANGED',
      fundingState: baseState
    })
  }

  const evaluateOrder = async (order, orderKind) => {
    if (!isEntryOrder(order, main.contractName) || !['BUY', 'SELL'].includes(order.side)) return

    const state = applyFundingSide(baseState, {
      side: order.side,
      quantity: remainingOrderQuantity(order)
    })
    const decision = evaluateFundingRisk(state, main.fundingFeePolicy)
    const result = {order, orderKind, decision}
    pendingOrders.push(result)

    if (decision.allowed) return

    const action = main.fundingFeePolicy.pendingOrderAction
    if (action === 'CANCEL') {
      const response = orderKind === 'ALGO'
        ? await main.cancelAlgoOrder({algoId: order.algoId})
        : await main.cancelOrder({orderId: order.orderId})
      actions.push({type: 'PENDING_ORDER_CANCELED', orderKind, order, response, decision})
    } else if (action === 'ALERT') {
      actions.push({type: 'PENDING_ORDER_ALERTED', orderKind, order, decision})
    }

    if (action !== 'IGNORE') {
      await emitFundingAlert(main, {
        type: action === 'CANCEL' ? 'PENDING_ORDER_CANCELED' : 'PENDING_ORDER_RISK',
        orderKind,
        order,
        decision
      })
    }
  }

  for (const order of openOrders) {
    await evaluateOrder(order, 'REGULAR')
  }

  for (const order of openAlgoOrders) {
    await evaluateOrder(order, 'ALGO')
  }

  for (const position of openPositions) {
    if (position.symbol !== main.contractName) continue

    const positionAmount = Number(position.positionAmt)
    if (!Number.isFinite(positionAmount) || positionAmount === 0) continue

    const side = positionAmount > 0 ? 'BUY' : 'SELL'
    const state = applyFundingSide(baseState, {
      side,
      quantity: Math.abs(positionAmount)
    })
    const decision = evaluateFundingRisk(state, main.fundingFeePolicy)
    const result = {position, decision}
    positionRisks.push(result)

    if (decision.allowed) continue

    const action = main.fundingFeePolicy.openPositionAction
    if (action === 'CLOSE') {
      const response = await main.closePosition({positions: [position], side})
      actions.push({type: 'POSITION_CLOSED', position, response, decision})
    } else if (action === 'ALERT') {
      actions.push({type: 'POSITION_ALERTED', position, decision})
    }

    if (action !== 'IGNORE') {
      await emitFundingAlert(main, {
        type: action === 'CLOSE' ? 'POSITION_CLOSED' : 'OPEN_POSITION_RISK',
        position,
        decision
      })
    }
  }

  return {
    enabled: true,
    fundingState: baseState,
    pendingOrders,
    openPositions: positionRisks,
    actions
  }
}
