
export const getSignature = (main, queryString) => {
    
    const {engine, API_SECRET} = main
    
    if (engine === 'google-app-script') {
      // Google Apps Script approach
      const signatureBytes = Utilities.computeHmacSha256Signature(queryString, API_SECRET)
      // Convert bytes to hex
      const signatureHex = signatureBytes
        .map(byte => {
          const v = (byte + 256) & 0xff;
          return (v < 16 ? '0' : '') + v.toString(16)
        })
        .join('')
      return signatureHex;
    }

    const {crypto: standardCrypto} = main.callbacks
  
    // Otherwise, use crypto from Node / Deno / CF / Bun, etc.
    // Node’s built-in crypto usage example:
    const hmac = standardCrypto.createHmac('sha256', API_SECRET)
    hmac.update(queryString)
    return hmac.digest('hex')
  }