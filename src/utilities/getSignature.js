
const bytesToHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export const getSignature = async (main, queryString) => {
    
    const {engine, API_SECRET} = main
    
    if (engine === 'google-apps-script') {
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

    if (typeof standardCrypto.createHmac === 'function') {
      const hmac = standardCrypto.createHmac('sha256', API_SECRET)
      hmac.update(queryString)
      return hmac.digest('hex')
    }

    const subtle = standardCrypto.subtle ?? standardCrypto.webcrypto?.subtle

    if (!subtle) {
      throw new Error('The provided crypto implementation must expose createHmac or Web Crypto subtle.')
    }

    const encoder = new TextEncoder()
    const key = await subtle.importKey(
      'raw',
      encoder.encode(API_SECRET),
      {name: 'HMAC', hash: 'SHA-256'},
      false,
      ['sign']
    )
    const signature = await subtle.sign('HMAC', key, encoder.encode(queryString))

    return bytesToHex(new Uint8Array(signature))
  }
