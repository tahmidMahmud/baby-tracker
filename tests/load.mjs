// Loads the app's browser-global modules (schedules/store/trends) into a
// Node vm sandbox so node:test can exercise them without a browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    _dump: () => Object.fromEntries(m),
  };
}

/**
 * @param {object} opts
 *   config  — SUPABASE_CONFIG value (default: sync disabled)
 *   fetch   — fetch stub
 *   storage — a localStorage stub to reuse (else fresh)
 */
export function loadApp(opts = {}) {
  const sandbox = {
    console, Date, Math, JSON, Promise, Set, Map,
    Object, Array, Number, String, Boolean, RegExp,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    TextEncoder, URL,
    crypto: webcrypto,
    localStorage: opts.storage || makeLocalStorage(),
    fetch: opts.fetch || (async () => { throw new Error('network disabled in tests'); }),
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout, clearTimeout,
    document: { addEventListener: () => {}, visibilityState: 'visible' },
    SUPABASE_CONFIG: opts.config || { url: '', anonKey: '' },
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['js/schedules.js', 'js/store.js', 'js/trends.js']) {
    vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  // top-level const bindings live in the context's declarative record, not on
  // the global object — pull them out with an in-context expression
  const mods = vm.runInContext('({ Schedules, Store, Trends })', sandbox);
  return { ...mods, sandbox, storage: sandbox.localStorage };
}
