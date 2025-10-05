export default class ErrorHandler {
    constructor(callbacks = {}) {
        this.errorLogger = (callbacks.hasOwnProperty('errorLogger') && typeof callbacks.errorLogger === 'function') ? callbacks.errorLogger : null;
    }

    async init(asyncFn) {
        try {
            return await asyncFn()
        } catch (err) {

            if(typeof this.errorLogger === 'function')
            {
                await this.errorLogger(err.message)
            }
        
            throw new Error(err.message)
        }
    }
}

export const keyPairObjToString = obj => {
  // 1. Reject anything that isn’t a non-null, plain object
  if (
    obj === null ||
    typeof obj !== 'object' ||
    Array.isArray(obj)
  ) {
    return JSON.stringify(obj);
  }

  let output = '\n\n---\n\n';

  for (const [key, value] of Object.entries(obj)) {
    // 2. Handle nested objects safely
    if (value !== null && typeof value === 'object') {
      try {
        output += `${key}: ${JSON.stringify(value)}\n`;
      } catch (err) {
        output += `${key}: [Unable to stringify value]\n`;
      }
    } else {
      output += `${key}: ${value}\n`;
    }
  }

  return output;
};