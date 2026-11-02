import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(path, fetchImpl, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, fetch: fetchImpl, URL, AbortSignal, DOMException,
    require: (id) => {
      assert.ok(id in dependencies, `Unexpected import: ${id}`);
      return dependencies[id];
    }
  });
  return exports;
}

const routeOptions = { mode: 'auto', avoidTolls: false, avoidHighways: false, avoidFerries: false, preferTwisty: false, alternatives: false };
const stops = [{ lat: 40.7, lng: -73.9 }, { lat: 40.8, lng: -73.8 }];
const routingDeps = {
  '@/lib/config': { getEndpoints: () => ({ valhallaUrl: 'https://routing.example' }) },
  '@/lib/geometry': { decodePolyline6: () => [] }
};

test('routing reports a bounded timeout as an actionable service error', async () => {
  const { fetchRoute, RoutingError } = loadModule('../lib/services/routing.ts',
    async () => { throw new DOMException('timed out', 'TimeoutError'); }, routingDeps);
  await assert.rejects(fetchRoute(stops, routeOptions), (error) =>
    error instanceof RoutingError && /took too long/.test(error.message));
});

test('routing preserves caller cancellation instead of converting it into an outage', async () => {
  const controller = new AbortController();
  controller.abort();
  const { fetchRoute } = loadModule('../lib/services/routing.ts',
    async (_url, options) => { throw options.signal.reason; }, routingDeps);
  await assert.rejects(fetchRoute(stops, routeOptions, controller.signal), (error) => error?.name === 'AbortError');
});

test('routing distinguishes rate limiting from an empty route result', async () => {
  const { fetchRoute, RoutingError } = loadModule('../lib/services/routing.ts',
    async () => ({ ok: false, status: 429, json: async () => ({}) }), routingDeps);
  await assert.rejects(fetchRoute(stops, routeOptions), (error) =>
    error instanceof RoutingError && /busy/.test(error.message));
});

test('Overpass retries a successful HTTP response with an invalid payload on the next mirror', async () => {
  const calls = [];
  const { fetchOverpassElements } = loadModule('../lib/services/overpass.ts',
    async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => url.includes('primary') ? {} : { elements: [] } };
    },
    {
      '@/lib/config': {
        getEndpoints: () => ({ overpassUrl: 'https://primary.example/api' }),
        OVERPASS_MIRRORS: ['https://primary.example/api', 'https://mirror.example/api']
      },
      '@/lib/geometry': { haversineMeters: () => 0, samplePath: () => [] }
    });
  assert.deepEqual(await fetchOverpassElements('out:json'), []);
  assert.deepEqual(calls, ['https://primary.example/api', 'https://mirror.example/api']);
});

test('Overpass outage errors do not expose configured service URLs', async () => {
  const { fetchOverpassElements } = loadModule('../lib/services/overpass.ts',
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    {
      '@/lib/config': {
        getEndpoints: () => ({ overpassUrl: 'https://private-endpoint.example/query' }),
        OVERPASS_MIRRORS: ['https://private-endpoint.example/query']
      },
      '@/lib/geometry': { haversineMeters: () => 0, samplePath: () => [] }
    });
  await assert.rejects(fetchOverpassElements('out:json'), (error) =>
    /temporarily unavailable/.test(error.message) && !/private-endpoint/.test(error.message));
});

test('business search rejects malformed success payloads instead of returning false empty results', async () => {
  const { searchBusinesses, LocalDataError } = loadModule('../lib/services/localdata.ts',
    async () => ({ ok: true, status: 200, json: async () => null }),
    { '@/lib/config': { getLocalDataKey: () => 'test-key', LOCAL_DATA_BASE: 'https://business.example' } });
  await assert.rejects(searchBusinesses('coffee'), (error) =>
    error instanceof LocalDataError && error.status === 502 && /invalid response/.test(error.message));
});
