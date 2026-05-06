// Backward-compatible re-export shim.
// All types and implementations have been moved to lib/store/ directory.
// Consumers importing from '../lib/store.js' or '../store.js' continue to work.
export * from './store/index.js';
