var BinanceFutures;(()=>{"use strict";var e={d:(r,t)=>{for(var i in t)e.o(t,i)&&!e.o(r,i)&&Object.defineProperty(r,i,{enumerable:!0,get:t[i]})},o:(e,r)=>Object.prototype.hasOwnProperty.call(e,r),r:e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})}},r={};(()=>{e.r(r),e.d(r,{default:()=>d,defaultEndpoints:()=>c});const t=(e,r)=>{if(!("number"==typeof e&&e>=10))throw new Error('Invalid "triggerPrice" property in createStopLossOrder or createTakeProfitOrder. "triggerPrice" must be a positive number greater than 0.');if(!r||!["KEEP","ERROR","REPLACE"].includes(r))throw new Error('Invalid "handleExistingOrders" property in createStopLossOrder or createTakeProfitOrder. Only "KEEP", "ERROR", and "REPLACE" values are accepted.')},i={200:"OK",201:"Created",400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",500:"Internal Server Error"},n=["time"],o=async({main:e,side:r,entryPrice:t,handleExistingOrders:i,orders:n})=>{n||(n=await e.getOrders());const o=n.filter((t=>t.symbol===e.contractName&&"LIMIT"===t.type&&t.side===r&&!1===t.reduceOnly&&!1===t.priceProtect&&!1===t.closePosition&&t.goodTillDate));if(o.length>0){if("KEEP"===i)return e.debug&&console.log(`New order (entryPrice=${t}, side=${r}) not executed. Found existing orders:`,o),!1;if("ERROR"===i)throw Error(`New order (entryPrice=${t}, side=${r}) not executed. Found duplicated orders: ${JSON.stringify(o)}`);if("REPLACE"===i){const r=await e.cancelMultipleOrders(o);e.debug&&console.log("cancelMultipleOrders",r)}else"ADD"===i&&e.debug&&console.log("Existing orders found. Pushing new order without deleting existing orders.")}return!0},a=e=>{const r=new Date(e),t=e=>e<10?`0${e}`:e;return`${r.getFullYear()}-${t(r.getMonth()+1)}-${t(r.getDate())} ${t(r.getHours())}:${t(r.getMinutes())}:${t(r.getSeconds())}`};class s{constructor(e={}){this.errorLogger=e.hasOwnProperty("errorLogger")&&"function"==typeof e.errorLogger?e.errorLogger:null}async init(e){try{return await e()}catch(e){throw"function"==typeof this.errorLogger&&await this.errorLogger(e.message),new Error(e.message)}}}const c={testnet:"https://testnet.binancefuture.com",production:"https://fapi.binance.com"};class d{constructor(e,r,t){this.engine="undefined"!=typeof ScriptApp?"google-app-script":"undefined"!=typeof process&&"node"===process.release?.name?"node":"undefined"!=typeof Deno?"deno":"undefined"!=typeof Bun?"bun":"undefined"!=typeof WebSocketPair?"cloudflare-worker":"unknown",((e={},r)=>{if("object"!=typeof e)throw new Error('Invalid type: "callbacks" property must be an object.');if(e.hasOwnProperty("errorLogger")&&"function"!=typeof e.errorLogger)throw new Error('Invalid type: "callbacks.errorLogger" must be a callback function.');if("google-app-script"!==r){if(!e.hasOwnProperty("fetch"))throw new Error(`The current engine "${r}" requires "fetch" to be provided as a parameter in callbacks.`);if("function"!=typeof e.fetch&&"object"!=typeof e.fetch)throw new Error('Invalid type: "callbacks.fetch" must be a standard Fetch API callback.');if(!e.hasOwnProperty("crypto"))throw new Error(`The current engine "${r}" requires "crypto" to be provided as a parameter in callbacks.`);if("function"!=typeof e.crypto&&"object"!=typeof e.crypto)throw new Error("Invalid type: \"callbacks.crypto\" must be a standard Web Crypto API callback. Use globalThis.crypto or require('node:crypto').webcrypto or import crypto from 'node:crypto' to access this module.")}})(t,this.engine),(e=>{if("object"!=typeof e||null===e)throw new Error('Invalid type: "strategy" must be a non-null object.');if(!e.hasOwnProperty("environment"))throw new Error('Missing "environment" property in strategy object.');if(!["testnet","production"].includes(e.environment))throw new Error('Invalid "environment" property. Only "testnet" and "production" are accepted.');if(!e.symbol)throw new Error('Invalid "symbol" property in strategy object.');if(!e.settlementCurrency)throw new Error('Invalid "symbol" property in strategy object.');if(!e.hasOwnProperty("leverage"))throw new Error('Missing "leverage" property in strategy object.');if(e.hasOwnProperty("marginType")&&("string"!=typeof e.marginType||!["ISOLATED","CROSSED"].includes(e.marginType)))throw new Error('Invalid "marginType" property in strategy object. Only "ISOLATED" and "CROSSED" margins are supported.');if(e.hasOwnProperty("useServerTime")&&"boolean"!=typeof e.useServerTime)throw new Error('Invalid "useServerTime" property in strategy object. Only boolean value is accepted');if(e.hasOwnProperty("debug")&&"boolean"!=typeof e.debug)throw new Error('Invalid "debug" property in strategy object. Only boolean value is accepted');const r=e.leverage;if("number"!=typeof r||isNaN(r)||r<=0)throw new Error('Invalid "leverage". It must be a positive number.')})(r),this.callbacks=t,this.errorHandler=new s(this.callbacks);const{settlementCurrency:i,symbol:n,leverage:o,marginType:a="ISOLATED",environment:d,debug:l=!1,useServerTime:p=!1}=r;(e=>{if(!["testnet","production"].includes(e))throw new Error('Invalid environment. Allowed values are "testnet" and "production".')})(d),((e,r)=>{if("object"!=typeof e||null===e)throw new Error('Invalid type: "credentials" must be a non-null object.');if(!e.hasOwnProperty(r))throw new Error(`Missing credentials for environment: "${r}".`);const t=e[r];if(!t.hasOwnProperty("API_KEY"))throw new Error(`Missing "API_KEY" in credentials for environment "${r}".`);if(!t.hasOwnProperty("API_SECRET"))throw new Error(`Missing "API_SECRET" in credentials for environment "${r}".`)})(e,d);const{API_KEY:u,API_SECRET:y,PROXY:h}=e[d];this.API_KEY=u,this.API_SECRET=y,this.endpoint="string"==typeof h&&h.startsWith("http")?`${h}/fapi`:`${c[d]}/fapi`,this.settlementCurrency=i,this.contractName=`${n}${i}`,this.leverage=o,this.marginType=a,this.useServerTime=p,this.environment=d,this.debug=l,this.cache={}}async fetch(e,r="GET",t={},o="v1"){return await(async(e,r,t,o,a)=>{const s={...o,symbol:e.contractName};if(!n.includes(r)){let r=Date.now();e.useServerTime&&(r=await e.getServerTime()),s.timestamp=r,s.recvWindow=5e3}const c=`${e.endpoint}/${a}/${r}`,d=Object.entries(s).map((([e,r])=>`${e}=${encodeURIComponent(r)}`)).join("&"),l=((e,r)=>{const{engine:t,API_SECRET:i}=e;if("google-app-script"===t)return Utilities.computeHmacSha256Signature(r,i).map((e=>{const r=e+256&255;return(r<16?"0":"")+r.toString(16)})).join("");const{crypto:n}=e.callbacks,o=n.createHmac("sha256",i);return o.update(r),o.digest("hex")})(e,d),p=n.includes(r)?d:`${d}&signature=${l}`,u=n.includes(r)?{}:{"X-MBX-APIKEY":e.API_KEY};let y;const h={method:t,headers:u};return"GET"===t||"DELETE"===t?y=`${c}?${p}`:(y=c,u["Content-Type"]="application/x-www-form-urlencoded","google-app-script"===e.engine?(h.payload=p,h.muteHttpExceptions=!0):h.body=p),"google-app-script"===e.engine?await(async(e,r)=>{const t=UrlFetchApp.fetch(e,r),n=t.getResponseCode(),o=t.getContentText();if(200===n)return JSON.parse(o);const a=i[n]||"Unknown Status";throw new Error(`Request failed with status ${a?`${n} (${a})`:n}. Body: ${o}`)})(y,h):await(async(e,r,t)=>{const{fetch:i}=e.callbacks,n=await i(r,t),{status:o,statusText:a}=n,s=await n.text();if(200===o)return JSON.parse(s);throw new Error(`Request failed with status ${a?`${o} (${a})`:o}. Body: ${s}`)})(e,y,h)})(this,e,r,t,o)}async getServerTime(){return this.errorHandler.init((async()=>(await this.fetch("time","GET",{})).serverTime))}async getOrders(){return this.errorHandler.init((async()=>await this.fetch("openOrders","GET",{})))}async getPositions(){return this.errorHandler.init((async()=>await this.fetch("positionRisk","GET",{},"v3")))}async getBalance(){return this.errorHandler.init((async()=>{const e=(await this.fetch("balance","GET",{},"v2")).find((e=>e.asset===this.settlementCurrency));return"object"==typeof e?e.balance:0}))}async getContractInfo(){return this.errorHandler.init((async()=>{const{contractName:e}=this,r=`contract_${e}`;if(this.cache.hasOwnProperty(r))return this.cache[r];const t=(await this.fetch("exchangeInfo","GET",{})).symbols.find((r=>r.symbol===e));if(void 0===t)throw new Error(`contract ${e} not fund`);return this.cache[r]=t,t}))}async changeLeverage(){return this.errorHandler.init((async()=>await this.fetch("leverage","POST",{leverage:this.leverage})))}async cancelMultipleOrders(e){return this.errorHandler.init((async()=>{const r=JSON.stringify(e.map((e=>e.orderId)));return await this.fetch("batchOrders","DELETE",{orderIdList:r})}))}async cancelOrder(e){return this.errorHandler.init((async()=>{const{orderId:r}=e;return await this.fetch("order","DELETE",{orderId:r})}))}async createLimitOrder({side:e,amountInUSD:r,entryPrice:t,handleExistingOrders:i,expirationInMinutes:n,orders:a}){return this.errorHandler.init((async()=>await(async({main:e,side:r="BUY",amountInUSD:t,entryPrice:i,handleExistingOrders:n,expirationInMinutes:a=10,orders:s})=>{(({side:e,amountInUSD:r,entryPrice:t,handleExistingOrders:i,expirationInMinutes:n})=>{if(!e||!["BUY","SELL"].includes(e))throw new Error('Invalid or missing property "side" in createLimitOrder.');if("number"!=typeof r||r<=0)throw new Error('Missing or invalid "amountInUSD" in createLimitOrder. "amountInUSD" must be a positive number.');if("number"!=typeof t||t<=0)throw new Error('Missing or invalid "entryPrice" in createLimitOrder. "entryPrice" must be a positive number.');if(void 0!==n&&!("number"==typeof n&&n>=10))throw new Error('Invalid "expirationInMinutes" in createLimitOrder. "expirationInMinutes" must be a positive number greater than or equal to 10.');if(!i||!["KEEP","ERROR","REPLACE","ADD"].includes(i))throw new Error('Invalid "handleExistingOrders" property in "createLimitOrder". Only "KEEP", "ERROR", "REPLACE", and "ADD" strings are supported. Defaults to "ADD".')})({side:r,amountInUSD:t,entryPrice:i,handleExistingOrders:n,expirationInMinutes:a}),await o({main:e,side:r,entryPrice:i,handleExistingOrders:n,orders:s});const c=await e.getContractInfo(),d=function(e,r,t,i){const{filters:n,quantityPrecision:o}=t,a=n.find((e=>"LOT_SIZE"===e.filterType)),s=parseFloat(a.minQty),c=parseFloat(a.maxQty),d=parseFloat(a.stepSize),l=n.find((e=>"MIN_NOTIONAL"===e.filterType)),p=parseFloat(l.notional);let u=e*r/i;if(u<s)throw new Error(`Quantity ${u} is below the minimum allowed: ${s}`);if(u>c)throw new Error(`Quantity ${u} exceeds the maximum allowed: ${c}`);u=Math.floor(u/d)*d;const y=u*i;if(y<p)throw new Error(`Notional value ${y} is below the minimum allowed: ${p}`);return u=parseFloat(u.toFixed(o)),u}(t,e.leverage,c,i),{tickSize:l}=c.filters.find((e=>"PRICE_FILTER"===e.filterType)),p=parseFloat((Math.round(i/l)*l).toFixed(c.pricePrecision)),u={side:r,type:"LIMIT",quantity:d,price:p,timeInForce:"GTC"};if("number"==typeof a){a<=10&&(a=10.1);const r=60*a*1e3;let t=Date.now();e.useServerTime&&(t=await e.getServerTime()),u.goodTillDate=t+r,u.timeInForce="GTD"}const y=await e.fetch("order","POST",u);if(e.debug&&console.log("createLimitOrder",{payload:u,response:y}),!y.hasOwnProperty("orderId"))throw new Error(`Error in createLimitOrder: ${JSON.stringify({...y,entryPrice:i,adjustedEntryPrice:p,side:r,quantity:d,tickSize:l})}`);return y})({main:this,side:e,amountInUSD:r,entryPrice:t,handleExistingOrders:i,expirationInMinutes:n,orders:a})))}async modifyLimitOrder({orders:e,entryPrice:r,side:t,expirationInMinutes:i}){return this.errorHandler.init((async()=>await(async({main:e,orders:r,entryPrice:t,side:i,expirationInMinutes:n=10})=>{if(isNaN(t)||t<=0)throw new Error('"entryPrice" must be a positive number.');if(n&&(isNaN(n)||n<10))throw new Error('"expirationInMinutes" must be a positive number greater than 10.');if(!["SELL","BUY"].includes(i))throw new Error('"side" must be either "SELL" or "BUY".');if(r&&!Array.isArray(r))throw new Error('"orders" must be a valid array.');const o=!!Array.isArray(r)&&r.find((r=>r.symbol===e.contractName&&"LIMIT"===r.type&&(e=>{const{origQty:r,executedQty:t}=e,n=parseFloat(r)-parseFloat(t);if(0!==n){if(n>0&&"BUY"===i)return!0;if(n<0&&"SELL"===i)return!0}return!1})(r))),{orderId:a,origQty:s,executedQty:c,timeInForce:d,price:l}=o;if(!a||isNaN(s)||isNaN(c))throw new Error('"order" must contain valid orderId, origQty, and executedQty properties.');const p=parseFloat(s)-parseFloat(c);if(p<=0)throw new Error("Remaining quantity must be greater than zero.");const u=await e.getContractInfo(),{tickSize:y}=u.filters.find((e=>"PRICE_FILTER"===e.filterType)),h=e=>(e=parseFloat(e),parseFloat((Math.round(e/y)*y).toFixed(u.pricePrecision))),f=h(t);if(f===h(l))return console.log(`adjustedEntryPrice and prevAdjustedEntryPrice are equal: ${f}`),!1;const g={orderId:a,quantity:p,price:f,side:i,type:"LIMIT",timeInForce:d,timeInForce:"GTC"};if("number"==typeof n){n<=10&&(n=10.1);const r=60*n*1e3;let t=Date.now();e.useServerTime&&(t=await e.getServerTime()),g.goodTillDate=t+r,g.timeInForce="GTD"}const m=await e.fetch("order","PUT",g);if(e.debug&&console.log("modifyLimitOrder",{payload:g,response:m}),!m.hasOwnProperty("orderId"))throw new Error(`Error in modifyLimitOrder: ${JSON.stringify({...m,entryPrice:t,adjustedEntryPrice:f,side:i,quantity:p,tickSize:y})}`);return m})({main:this,orders:e,entryPrice:r,side:t,expirationInMinutes:i})))}async createTakeProfitOrder({triggerPrice:e,handleExistingOrders:r,positions:i,orders:n}){return this.errorHandler.init((async()=>await(async({main:e,triggerPrice:r,handleExistingOrders:i,positions:n,orders:o})=>{t(r,i);const a="TAKE_PROFIT_MARKET";n||(n=await e.getPositions());const s=n.find((r=>r.symbol===e.contractName&&0!==parseFloat(r.positionAmt)));if(!s)throw new Error(`No open position found for ${e.contractName} in createTakeProfitOrder`);if(await(async({main:e,handleExistingOrders:r,type:t,orders:i,triggerPrice:n})=>{i||(i=await e.getOrders());const o=i.find((e=>e.origType===t));if(o){if("KEEP"===r)return!0;if("ERROR"===r)throw new Error('New "take profit" order not execute because of an existing "take profit" order.');if(parseFloat(o.stopPrice)===n)return!0;const t=await e.cancelOrder(o);e.debug&&console.log("createTakeProfitOrder canceled order",t)}return!1})({main:e,handleExistingOrders:i,type:a,orders:o,triggerPrice:r}))return!0;const{entryPrice:c,positionAmt:d}=s,l=parseFloat(d)>0?"BUY":"SELL",p=await e.getContractInfo(),{tickSize:u}=p.filters.find((e=>"PRICE_FILTER"===e.filterType)),y=parseFloat((Math.round(r/u)*u).toFixed(p.pricePrecision));if("SELL"===l&&y>=parseFloat(c)||"BUY"===l&&y<=parseFloat(c))throw new Error(`Invalid take-profit triggerPrice "${r}" for ${l} position.`);const h={symbol:e.contractName,side:"BUY"===l?"SELL":"BUY",positionSide:"BOTH",type:a,timeInForce:"GTE_GTC",quantity:0,stopPrice:y,workingType:"MARK_PRICE",closePosition:!0,placeType:"position",priceProtect:!0},f=await e.fetch("order","POST",h);if(e.debug&&console.log("payload createTakeProfitOrder",{payload:h,response:f}),!f.hasOwnProperty("orderId"))throw new Error(`Error in createStopLossOrder: ${JSON.stringify({...f,side:l,triggerPrice:r,adjustedStopPrice:y,tickSize:u})}`);return f})({main:this,triggerPrice:e,handleExistingOrders:r,positions:i,orders:n})))}async createStopLossOrder({triggerPrice:e,handleExistingOrders:r,positions:i,orders:n}){return this.errorHandler.init((async()=>await(async({main:e,triggerPrice:r,handleExistingOrders:i="REPLACE",positions:n,orders:o})=>{t(r,i);const a="STOP_MARKET";n||(n=await e.getPositions());const s=n.find((r=>r.symbol===e.contractName&&0!==parseFloat(r.positionAmt)));if(!s)throw new Error(`No open position found for ${e.contractName} in createStopLossOrder`);if(await(async({main:e,handleExistingOrders:r,type:t,orders:i,triggerPrice:n})=>{i||(i=await e.getOrders());const o=i.find((e=>e.origType===t));if(o){if("KEEP"===r)return!0;if("ERROR"===r)throw new Error('New "take profit" order not execute because of an existing "take profit" order.');if(parseFloat(o.stopPrice)===n)return!0;const t=await e.cancelOrder(o);e.debug&&console.log("createStopLossOrder canceled order",t)}return!1})({main:e,handleExistingOrders:i,type:a,orders:o,triggerPrice:r}))return!0;const{entryPrice:c,positionAmt:d}=s,l=parseFloat(d)>0?"BUY":"SELL",p=await e.getContractInfo(),{tickSize:u}=p.filters.find((e=>"PRICE_FILTER"===e.filterType)),y=parseFloat((Math.round(r/u)*u).toFixed(p.pricePrecision));if("SELL"===l&&y<=parseFloat(c)||"BUY"===l&&y>=parseFloat(c))throw new Error(`Invalid stop-loss triggerPrice "${r}" for ${l} position.`);const h={symbol:e.contractName,side:"BUY"===l?"SELL":"BUY",positionSide:"BOTH",type:a,timeInForce:"GTE_GTC",quantity:0,stopPrice:y,workingType:"MARK_PRICE",closePosition:!0,placeType:"position",priceProtect:!0},f=await e.fetch("order","POST",h);if(e.debug&&console.log("createStopLossOrder",{payload:h,response:f}),!f.hasOwnProperty("orderId"))throw new Error(`Error in createStopLossOrder: ${JSON.stringify({...f,side:l,triggerPrice:r,adjustedStopPrice:y,tickSize:u})}`);return f})({main:this,triggerPrice:e,handleExistingOrders:r,positions:i,orders:n})))}async changeMarginType(){return this.errorHandler.init((async()=>await this.fetch("marginType","POST",{marginType:this.marginType})))}async ohlcv({interval:e,startTime:r,endTime:t,limit:i,klineType:n="indexPriceKlines"}){return await this.errorHandler.init((async()=>{(({interval:e,limit:r=500,startTime:t,endTime:i,klineType:n})=>{const o=["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"],a=["klines","continuousKlines","indexPriceKlines","markPriceKlines","premiumIndexKlines"];if(!e)throw new Error('"interval" is required.');if(!o.includes(e))throw new Error(`Invalid "interval". Accepted values are: ${o.join(", ")}.`);if(n&&!a.includes(n))throw new Error(`Invalid "klineType". Accepted values are: ${a.join(", ")}.`);if("number"!=typeof r||r<1||r>1500)throw new Error('"limit" must be a number between 1 and 1500 (inclusive).');if(r&&(t||i))throw new Error('"ohlcv" does not accept "limit" together with "startTime" or "endTime".');if(!(r||t&&i))throw new Error('"ohlcv" requires either "limit" or both "startTime" and "endTime".');if(t&&i&&new Date(t)>=new Date(i))throw new Error('"startTime" must be earlier than "endTime".')})({interval:e,startTime:r,endTime:t,limit:i,klineType:n});const{contractName:o}=this,s={interval:e,...i?{limit:i}:{startTime:r,endTime:t}};"continuousKlines"===n?(s.pair=o,s.contractType="PERPETUAL"):("indexPriceKlines"===n||"markPriceKlines"===n)&&(s.pair=o);const c=await this.fetch(n,"GET",s);if(!Array.isArray(c))throw new Error('Invalid response in "ohlcv".');if(!Array.isArray(c[0]))throw new Error('Invalid response in "ohlcv".');return c.map((([e,r,t,i,n,o])=>({open:parseFloat(r),high:parseFloat(t),low:parseFloat(i),close:parseFloat(n),volume:parseFloat(o),date:a(e)})))}))}async cancelAllOpenedOrders(){return this.errorHandler.init((async()=>await this.fetch("allOpenOrders","DELETE")))}async closePosition({positions:e,side:r}){return this.errorHandler.init((async()=>await(async({main:e,positions:r,side:t})=>{if(!["SELL","BUY"].includes(t))throw new Error('Invalid "side" property in closePosition. Only "SELL" or "BUY" buy is accepted.');r||(r=await e.getPositions());const i=r.find((r=>r.symbol===e.contractName&&(e=>{const r=parseFloat(e.positionAmt);if(0!==r){if(r>0&&"BUY"===t)return!0;if(r<0&&"SELL"===t)return!0}return!1})(r)));if(!i)throw new Error(`No open position found for ${e.contractName} in closePosition`);const n=Math.abs(parseFloat(i.positionAmt)),o={symbol:e.contractName,side:"BUY"===t?"SELL":"BUY",type:"MARKET",quantity:n,reduceOnly:!0,isolated:"ISOLATED"===e.marginType,leverage:e.leverage,placeType:"position",positionSide:"BOTH"},a=await e.fetch("order","POST",o);return e.debug&&console.log("closePosition",{payload:o,response:a}),a})({main:this,positions:e,side:r})))}}})(),BinanceFutures=r})();