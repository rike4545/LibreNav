import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('modal navigation surfaces share focus containment, Escape and restoration', async () => {
  const hook = await read('lib/useDialogFocus.ts');
  assert.match(hook, /querySelectorAll<HTMLElement>\(FOCUSABLE\)/);
  assert.match(hook, /event\.key === 'Escape'/);
  assert.match(hook, /event\.shiftKey/);
  assert.match(hook, /previousFocus\?\.isConnected/);

  for (const path of [
    'components/SettingsPanel.tsx',
    'components/LayersSheet.tsx',
    'components/ChargerCard.tsx',
    'components/ReportSheet.tsx'
  ]) {
    const source = await read(path);
    assert.match(source, /useDialogFocus/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
  }
});

test('global keyboard focus and reduced-motion preferences are supported', async () => {
  const css = await read('app/globals.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation-duration:\s*0\.01ms/);
  assert.match(css, /transition-duration:\s*0\.01ms/);
});

test('service failures and transient status messages are announced', async () => {
  const search = await read('components/SearchPanel.tsx');
  const shell = await read('components/MapShell.tsx');
  assert.match(search, /role="alert"/);
  assert.match(search, /categoryError/);
  assert.match(shell, /aria-live="polite"/);
  assert.match(shell, /trafficUnavailable/);
  assert.match(shell, /elevationUnavailable/);
  assert.match(shell, /weatherUnavailable/);
});
