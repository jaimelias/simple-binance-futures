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