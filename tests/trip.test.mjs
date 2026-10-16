import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const defaultRouteOptions = {
  mode: 'auto',
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  preferTwisty: false,
  alternatives: false
};

function loadTrip() {
  const source = readFileSync(new URL('../lib/trip.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (id) => {
      assert.equal(id, '@/lib/storage', `Unexpected import: ${id}`);
      return { defaultRouteOptions };
    }
  });
  return exports;
}

const trip = loadTrip();

const routeOptions = {
  mode: 'auto',
  avoidTolls: true,
  avoidHighways: false,
  avoidFerries: true,
  preferTwisty: true,
  alternatives: true
};

const waypoints = [
  { id: 'start', name: 'Home, East', label: 'Start', coordinate: { lat: 40.7, lng: -73.4 } },
  { id: 'destination', name: 'Coffee | Park', label: 'Finish', coordinate: { lat: 41.2, lng: -72.8 } }
];

test('trip share links round-trip stops and route preferences', () => {
  const encoded = trip.encodeTrip(waypoints, routeOptions);
  const decoded = trip.decodeTrip(`?${encoded}`);
  assert.ok(decoded);
  assert.equal(decoded.waypoints.length, 2);
  assert.equal(decoded.waypoints[0].coordinate.lat, 40.7);
  assert.equal(decoded.waypoints[0].coordinate.lng, -73.4);
  assert.equal(decoded.waypoints[1].coordinate.lat, 41.2);
  assert.equal(decoded.waypoints[1].coordinate.lng, -72.8);
  assert.equal(decoded.options.avoidTolls, true);
  assert.equal(decoded.options.avoidFerries, true);
  assert.equal(decoded.options.preferTwisty, true);
  assert.equal(decoded.options.alternatives, true);
});

test('trip encoding strips delimiter characters from names', () => {
  const encoded = trip.encodeTrip(waypoints, routeOptions);
  assert.equal(encoded.includes('Coffee | Park'), false);
  const decoded = trip.decodeTrip(`?${encoded}`);
  assert.ok(decoded);
  assert.equal(decoded.waypoints[1].name.includes('|'), false);
});

test('decoder rejects invalid coordinates and out-of-range latitude/longitude', () => {
  assert.equal(trip.decodeTrip('?trip=not-a-latitude,12,Somewhere'), null);
  assert.equal(trip.decodeTrip('?trip=91,12,Somewhere'), null);
  assert.equal(trip.decodeTrip('?trip=40,181,Somewhere'), null);
});

test('decoder keeps legacy single-destination links working', () => {
  const decoded = trip.decodeTrip('?to=40.7,-73.4&toName=Legacy%20place');
  assert.ok(decoded);
  assert.equal(decoded.waypoints.length, 1);
  assert.equal(decoded.waypoints[0].name, 'Legacy place');
  assert.equal(decoded.options.mode, 'auto');
});

test('EV range estimate uses consumption, charge, terrain, and reserve', () => {
  const vehicle = {
    batteryKwh: 75,
    consumptionKwh100km: 18,
    socPercent: 80,
    reservePercent: 15
  };
  const route = { summary: { distanceKm: 200 } };
  const estimate = trip.estimateRange(route, vehicle, 2);
  assert.ok(estimate);
  assert.equal(estimate.rangeKm, 333.33333333333337);
  assert.equal(estimate.climbKwh, 2);
  assert.equal(estimate.arrivalSocPercent, 27.333333333333332);
  assert.equal(estimate.reachable, true);
});

test('EV range estimate returns null for missing route or invalid vehicle values', () => {
  assert.equal(trip.estimateRange(null, {
    batteryKwh: 75, consumptionKwh100km: 18, socPercent: 80, reservePercent: 15
  }), null);
  assert.equal(trip.estimateRange({ summary: { distanceKm: 20 } }, {
    batteryKwh: 0, consumptionKwh100km: 18, socPercent: 80, reservePercent: 15
  }), null);
});
