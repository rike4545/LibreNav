import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(fetchImpl) {
  const source = readFileSync(new URL('../lib/services/optimize.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, fetch: fetchImpl, AbortSignal, URL,
    require: (id) => {
      if (id === '@/lib/config') return { getEndpoints: () => ({ valhallaUrl: 'https://routing.example/' }) };
      if (id === '@/lib/services/routing') return { buildCostingOptions: () => ({ auto: {} }) };
      assert.fail(`Unexpected import: ${id}`);
    }
  });
  return exports;
}

const options = { mode: 'auto', avoidTolls: false, avoidHighways: false, avoidFerries: false, preferTwisty: false, alternatives: false };
const points = ['A', 'B', 'C', 'D', 'E'].map((name, index) => ({
  id: name, name, label: name, coordinate: { lat: 40 + index / 10, lng: -73 + index / 10 }
}));

test('optimizer keeps origin and destination and applies Valhalla original indexes', async () => {
  const { optimizeWaypoints } = load(async (url, request) => {
    assert.equal(url, 'https://routing.example/optimized_route');
    const body = JSON.parse(request.body);
    assert.equal(body.locations.length, 5);
    return { ok: true, status: 200, json: async () => ({
      locations: [0, 3, 1, 2, 4].map((original_index) => ({ original_index }))
    }) };
  });
  const result = await optimizeWaypoints(points, options);
  assert.deepEqual(result.map((point) => point.id), ['A', 'D', 'B', 'C', 'E']);
});

test('locked stops partition optimization and remain in their exact position', async () => {
  const calls = [];
  const { optimizeWaypoints } = load(async (_url, request) => {
    const body = JSON.parse(request.body);
    calls.push(body.locations.length);
    return { ok: true, status: 200, json: async () => ({
      locations: body.locations.map((_point, index) => ({ original_index: index }))
    }) };
  });
  const locked = points.map((point) => ({ ...point }));
  locked[3].locked = true;
  const result = await optimizeWaypoints(locked, options);
  assert.deepEqual(result.map((point) => point.id), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(calls, [4]);
});

test('optimizer rejects unsupported modes and malformed stop orders', async () => {
  const { optimizeWaypoints, TripOptimizationError } = load(async () => ({
    ok: true, status: 200, json: async () => ({ locations: [{ original_index: 0 }] })
  }));
  await assert.rejects(optimizeWaypoints(points, { ...options, mode: 'truck' }), TripOptimizationError);
  await assert.rejects(optimizeWaypoints(points, options), TripOptimizationError);
});

test('optimizer distinguishes rate limits and honors cancellation', async () => {
  const { optimizeWaypoints, TripOptimizationError } = load(async () => ({
    ok: false, status: 429, json: async () => ({})
  }));
  await assert.rejects(optimizeWaypoints(points, options), (error) =>
    error instanceof TripOptimizationError && /busy/.test(error.message));

  const controller = new AbortController();
  controller.abort();
  const cancelled = load(async (_url, request) => { throw request.signal.reason; });
  await assert.rejects(cancelled.optimizeWaypoints(points, options, controller.signal), (error) => error?.name === 'AbortError');
});
