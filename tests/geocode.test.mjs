import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadGeocode(fetchImpl) {
  const source = readFileSync(new URL('../lib/services/geocode.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};

  vm.runInNewContext(outputText, {
    exports,
    URL,
    fetch: fetchImpl,
    require: (id) => {
      if (id === '@/lib/config') return { getEndpoints: () => ({ photonUrl: 'https://photon.example' }) };
      if (id === '@/lib/pluscode') {
        return {
          decodePlusCode: () => null,
          isFullPlusCode: () => false,
          isShortPlusCode: () => false,
          recoverPlusCode: () => null
        };
      }
      assert.fail(`Unexpected import: ${id}`);
    }
  });

  return exports;
}

const photonFeature = (name, coordinates, osmId) => ({
  properties: { name, osm_type: 'N', osm_id: osmId },
  geometry: { coordinates }
});

test('Photon search discards non-finite and out-of-range WGS84 coordinates', async () => {
  const features = [
    photonFeature('Valid place', [-73.9, 40.7], 1),
    photonFeature('North-east boundary', [180, 90], 2),
    photonFeature('South-west boundary', [-180, -90], 3),
    photonFeature('NaN longitude', [Number.NaN, 40], 4),
    photonFeature('NaN latitude', [-73, Number.NaN], 5),
    photonFeature('Infinite longitude', [Number.POSITIVE_INFINITY, 40], 6),
    photonFeature('Infinite latitude', [-73, Number.NEGATIVE_INFINITY], 7),
    photonFeature('Longitude above range', [180.0001, 40], 8),
    photonFeature('Longitude below range', [-180.0001, 40], 9),
    photonFeature('Latitude above range', [-73, 90.0001], 10),
    photonFeature('Latitude below range', [-73, -90.0001], 11),
    photonFeature('String coordinates', ['-73.9', 40.7], 12)
  ];

  const { searchPlaces } = loadGeocode(async () => ({
    ok: true,
    json: async () => ({ features })
  }));

  const results = await searchPlaces('coffee shop');
  const plainResults = JSON.parse(JSON.stringify(results));

  assert.deepEqual(plainResults.map((result) => result.name), [
    'Valid place',
    'North-east boundary',
    'South-west boundary'
  ]);
  assert.deepEqual(plainResults.map((result) => result.coordinate), [
    { lat: 40.7, lng: -73.9 },
    { lat: 90, lng: 180 },
    { lat: -90, lng: -180 }
  ]);
});

test('reverse geocoding rejects malformed Photon geometry', async () => {
  const { reverseGeocode } = loadGeocode(async () => ({
    ok: true,
    json: async () => ({
      features: [photonFeature('Invalid result', [Number.NaN, 40.7], 1)]
    })
  }));

  assert.equal(await reverseGeocode({ lat: 40.7, lng: -73.9 }), null);
});
