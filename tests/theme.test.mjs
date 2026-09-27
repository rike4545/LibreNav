import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real TypeScript helpers in an isolated browser-like environment.
function loadModule(path, globals = {}, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (id) => {
    assert.ok(id in dependencies, `Unexpected import: ${id}`);
    return dependencies[id];
  }, ...globals });
  return exports;
}

function browser(dark, stored) {
  const listeners = new Set();
  const query = {
    matches: dark,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener)
  };
  const metas = [new Map([['media', 'light']]), new Map([['media', 'dark']])];
  const root = { dataset: {}, setAttribute: (_, value) => { root.dataset.theme = value; } };
  return {
    window: {
      matchMedia: () => query,
      localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } }
    },
    document: {
      documentElement: root,
      querySelectorAll: () => metas.map((meta) => ({
        removeAttribute: (key) => meta.delete(key),
        setAttribute: (key, value) => meta.set(key, value)
      }))
    },
    metas, listeners,
    flip(value) {
      query.matches = value;
      listeners.forEach((listener) => listener({ matches: value }));
    }
  };
}

for (const dark of [false, true]) {
  for (const stored of ['{"theme":"dark"}', '{"theme":"light"}', '{broken', null]) {
    test(`first paint follows ${dark ? 'dark' : 'light'} OS with stored ${stored}`, () => {
      const env = browser(dark, stored);
      const theme = loadModule('../lib/theme.ts', env);
      vm.runInNewContext(theme.THEME_BOOTSTRAP, {
        ...env, matchMedia: env.window.matchMedia,
        // Storage may be inaccessible; appearance must not depend on it.
        get localStorage() { throw new Error('Storage denied'); }
      });
      const expected = dark ? 'dark' : 'light';
      assert.equal(env.document.documentElement.dataset.theme, expected);
      assert.equal(theme.systemTheme(), expected);
      env.metas.forEach((meta) => assert.equal(meta.get('content'), theme.PAGE_COLOR[expected]));
    });
  }
}

test('live OS changes update the shared app/map theme and browser chrome; cleanup unsubscribes', () => {
  const env = browser(false, '{"theme":"dark"}');
  const theme = loadModule('../lib/theme.ts', env);
  const stop = theme.watchSystemTheme(theme.applyTheme);
  theme.applyTheme(theme.systemTheme());
  for (const dark of [true, false, true]) {
    env.flip(dark);
    const expected = dark ? 'dark' : 'light';
    assert.equal(env.document.documentElement.dataset.theme, expected);
    env.metas.forEach((meta) => {
      assert.equal(meta.has('media'), false);
      assert.equal(meta.get('content'), theme.PAGE_COLOR[expected]);
    });
  }
  stop();
  assert.equal(env.listeners.size, 0);
});

test('server and browsers without matchMedia use the same fallback', () => {
  const theme = loadModule('../lib/theme.ts');
  assert.equal(theme.systemTheme(), 'dark');
  theme.watchSystemTheme(() => assert.fail('No browser'))();
  const env = browser(false, null);
  vm.runInNewContext(theme.THEME_BOOTSTRAP, { document: env.document });
  assert.equal(env.document.documentElement.dataset.theme, 'dark');
});

test('legacy manual preferences are discarded without changing other settings', () => {
  const env = browser(false, JSON.stringify({ theme: 'dark', imperial: true, mapStyleId: 'bright', showChargers: false }));
  const storage = loadModule('../lib/storage.ts', env, {
    '@/lib/config': { DEFAULT_VEHICLE: {} },
    '@/lib/voice': { defaultVoiceSettings: {} }
  });
  const prefs = storage.getPreferences();
  assert.equal('theme' in prefs, false);
  assert.equal(prefs.imperial, true);
  assert.equal(prefs.mapStyleId, 'bright');
  assert.equal(prefs.showChargers, false);
  storage.savePreferences({ ...prefs, theme: 'light' });
  const saved = JSON.parse(env.window.localStorage.getItem());
  assert.equal('theme' in saved, false);
  assert.equal(saved.mapStyleId, 'bright');
});
