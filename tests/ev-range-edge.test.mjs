import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadRange() {
  const source = readFileSync(new URL('../lib/ev/range.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports });
  return exports;
}

const { estimateRange } = loadRange();
const vehicle = { batteryKwh: 60, consumptionKwh100km: 20, socPercent: 80, reservePercent: 15 };
const route = (distanceKm) => ({ summary: { distanceKm } });

test('EV estimate marks a trip below the reserve threshold unreachable', () => {
  const estimate = estimateRange(route(196), vehicle);
  assert.ok(estimate);
  assert.equal(estimate.reachable, false);
  assert.ok(estimate.arrivalSocPercent < vehicle.reservePercent);
});

test('EV estimate treats a trip exactly at reserve as reachable', () => {
  const estimate = estimateRange(route(195), vehicle);
  assert.ok(estimate);
  assert.equal(estimate.arrivalSocPercent, 15);
  assert.equal(estimate.reachable, true);
  assert.equal(estimate.reserveReachedKm, null);
});

test('negative terrain energy improves arrival charge without extending reserve-distance estimate', () => {
  const estimate = estimateRange(route(200), vehicle, -5);
  assert.ok(estimate);
  assert.equal(estimate.climbKwh, -5);
  assert.equal(estimate.arrivalSocPercent, 21.666666666666668);
  assert.equal(estimate.reachable, true);
  assert.equal(estimate.reserveReachedKm, 195);
});

test('EV estimate rejects zero and negative consumption or battery capacity', () => {
  for (const batteryKwh of [0, -1]) {
    assert.equal(estimateRange(route(10), { ...vehicle, batteryKwh }), null);
  }
  for (const consumptionKwh100km of [0, -1]) {
    assert.equal(estimateRange(route(10), { ...vehicle, consumptionKwh100km }), null);
  }
});

test('EV estimate rejects invalid state-of-charge and reserve percentages', () => {
  for (const socPercent of [-0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(estimateRange(route(10), { ...vehicle, socPercent }), null);
  }
  for (const reservePercent of [-0.01, 100.01, Number.NaN, Number.NEGATIVE_INFINITY]) {
    assert.equal(estimateRange(route(10), { ...vehicle, reservePercent }), null);
  }
});

test('EV estimate rejects malformed route distances and non-finite terrain energy', () => {
  for (const distanceKm of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(estimateRange(route(distanceKm), vehicle), null);
  }
  for (const climbKwh of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(estimateRange(route(10), vehicle, climbKwh), null);
  }
});
