import crypto from 'crypto'

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

    let nodeCrypto

    if(typeof crypto === 'object')
    {
        nodeCrypto = crypto
    }
    else
    {
        if(typeof main.nodeCrypto === 'object')
        {
            nodeCrypto = main.nodeCrypto
        }
        else
        {
          throw new Error('"crypto" library is not available in your global scope. you can pass "crypto" using the property "nodeCrypto" in your strategy')
        }
    }
  
    // Otherwise, use crypto from Node / Deno / CF / Bun, etc.
    // Node’s built-in crypto usage example:
    const hmac = nodeCrypto.createHmac('sha256', API_SECRET)
    hmac.update(queryString)
    return hmac.digest('hex')
  }