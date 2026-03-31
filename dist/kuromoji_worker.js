/**
 * kuromoji_worker.js - Web Worker for offloading kuromoji.js initialization and parsing
 * This prevents the main UI thread from freezing and avoids Vite/ESM bundling errors (Zlib issues).
 */

// Import kuromoji.js from CDN
importScripts('https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js');

let tokenizer = null;

// Listen for messages from the main thread
self.onmessage = function(e) {
  const { type, payload, id } = e.data;

  if (type === 'init') {
    // Initialize Kuromoji
    // @ts-ignore
    kuromoji.builder({ dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict' })
      .build((err, t) => {
        if (err) {
          self.postMessage({ type: 'init_error', error: err.message, id });
        } else {
          tokenizer = t;
          self.postMessage({ type: 'init_success', id });
        }
      });
  } else if (type === 'tokenize') {
    if (!tokenizer) {
      self.postMessage({ type: 'tokenize_error', error: 'Tokenizer not initialized', id });
      return;
    }

    try {
      // payload: array of name strings without spaces
      if (Array.isArray(payload)) {
        const results = payload.map(name => {
          if (!name) return '';
          const tokens = tokenizer.tokenize(name);
          return tokens.map(t => t.reading || t.surface_form).join('');
        });
        self.postMessage({ type: 'tokenize_success', results, id });
      } else {
        self.postMessage({ type: 'tokenize_error', error: 'Payload must be an array', id });
      }
    } catch (err) {
      self.postMessage({ type: 'tokenize_error', error: err.message, id });
    }
  }
};
