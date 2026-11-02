import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('MapLibre and its vector-tile parser resolve to patched major versions', async () => {
  const manifest = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.ok(manifest.dependencies['maplibre-gl'].startsWith('^6.'));
  assert.equal(lock.packages['node_modules/maplibre-gl'].version, '6.15.0');
  assert.equal(lock.packages['node_modules/pbf'].version, '5.1.2');
  assert.ok(lock.packages['node_modules/maplibre-gl'].dependencies.pbf.startsWith('^5.'));
});

test('MapLibre v6 uses its ESM namespace rather than the removed default export', async () => {
  const source = await read('components/NavMap.tsx');
  assert.ok(source.includes("import * as maplibregl from 'maplibre-gl'"));
  assert.ok(!source.includes("import maplibregl,"));
});

test('MapLibre v6 map event callbacks retain explicit event types', async () => {
  const source = await read('components/NavMap.tsx');
  assert.ok(source.includes("map.on('sourcedata', (event: MapSourceDataEvent)"));
  assert.ok(source.includes("map.on('touchstart', (event: MapTouchEvent)"));
  assert.ok(source.includes("map.on('contextmenu', (event: MapMouseEvent)"));
});

test('user marker ref is narrowed before its DOM element is accessed', async () => {
  const source = await read('components/NavMap.tsx');
  assert.ok(source.includes('const userMarker = userMarkerRef.current;'));
  assert.ok(source.includes('if (!userMarker) return;'));
  assert.ok(source.includes("userMarker.getElement().querySelector<HTMLElement>('.nav-user-cone')"));
});
