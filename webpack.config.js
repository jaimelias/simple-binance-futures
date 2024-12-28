import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const entry = './index.js';
const output = {
  filename: 'google-appscript-build.js',
  path: resolve(__dirname, './dist'),
  library: 'BinanceFutures'
};

export default {
  entry,
  output,
  mode: 'production',
  target: 'web',
  resolve: {
    fallback: {
      'crypto': false,
      'fetch': false
    }
  }
}