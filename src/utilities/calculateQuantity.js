export function calculateQuantity(amountInUSDT, leverage, contractInfo, price) {
    const { filters, quantityPrecision } = contractInfo;

    // Extract the relevant filters
    const lotSizeFilter = filters.find(filter => filter.filterType === "LOT_SIZE");
    const minQty = parseFloat(lotSizeFilter.minQty);
    const maxQty = parseFloat(lotSizeFilter.maxQty);
    const stepSize = parseFloat(lotSizeFilter.stepSize);

    const minNotionalFilter = filters.find(filter => filter.filterType === "MIN_NOTIONAL");
    const minNotional = parseFloat(minNotionalFilter.notional);

    // Calculate initial quantity
    let quantity = (amountInUSDT * leverage) / price;

    // Ensure quantity meets precision
    quantity = parseFloat(quantity.toFixed(quantityPrecision));

    // Ensure quantity is within limits
    if (quantity < minQty) {
        throw new Error(`Quantity ${quantity} is below the minimum allowed: ${minQty}`);
    }
    if (quantity > maxQty) {
        throw new Error(`Quantity ${quantity} exceeds the maximum allowed: ${maxQty}`);
    }

    // Adjust to step size
    quantity = Math.floor(quantity / stepSize) * stepSize;

    // Ensure notional value meets the minimum required
    const notionalValue = quantity * price;
    if (notionalValue < minNotional) {
        throw new Error(`Notional value ${notionalValue} is below the minimum allowed: ${minNotional}`);
    }

    return quantity;
}