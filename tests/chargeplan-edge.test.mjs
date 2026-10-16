import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let totalMeters = 1_000_000;
let chargerResponses = [];
let fetchCount = 0;

function loadPlanner() {
  const source = readFileSync(new URL('../lib/services/chargeplan.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (id) => {
      if (id === '@/lib/geometry') {
        return {
          cumulativeDistances: (coordinates) => coordinates.map((_, index) =>
            coordinates.length < 2 ? 0 : (totalMeters * index) / (coordinates.length - 1)
          ),
          haversineMeters: () => 0
        };
      }
      if (id === '@/lib/services/overpass') {
        return {
          fetchChargers: async () => {
            const response = chargerResponses[fetchCount] ?? [];
            fetchCount += 1;
            return response;
          }
        };
      }
      assert.fail(`Unexpected import: ${id}`);
    }
  });
  return exports;
}

const { planChargingStops, ChargePlanError } = loadPlanner();
const validVehicle = { batteryKwh: 60, consumptionKwh100km: 20, socPercent: 80, reservePercent: 10 };
const route = (coordinates = [[0, 0], [1, 0]]) => ({ coordinates });
const charger = (id) => ({
  id, name: `Charger ${id}`, network: 'Test Network', plugs: ['ccs'],
  powerKw: 150, coordinate: { lat: 0, lng: 0 }
});
function configure({ distance = 1_000_000, responses = [] } = {}) {
  totalMeters = distance;
  chargerResponses = responses;
  fetchCount = 0;
}

test('planner rejects invalid vehicle energy and percentage inputs', async () => {
  for (const patch of [
    { batteryKwh: 0 }, { batteryKwh: -1 }, { batteryKwh: Number.NaN },
    { consumptionKwh100km: 0 }, { consumptionKwh100km: Number.POSITIVE_INFINITY },
    { socPercent: -1 }, { socPercent: 101 }, { socPercent: Number.NaN },
    { reservePercent: -1 }, { reservePercent: 101 }, { reservePercent: Number.NaN }
  ]) {
    await assert.rejects(
      planChargingStops(route(), { ...validVehicle, ...patch }, 0),
      (error) => error?.name === 'ChargePlanError'
    );
  }
});

test('planner rejects non-finite terrain energy', async () => {
  await assert.rejects(
    planChargingStops(route(), validVehicle, Number.POSITIVE_INFINITY),
    (error) => error?.name === 'ChargePlanError'
  );
});

test('empty and zero-length route geometry return an empty complete plan without lookup', async () => {
  configure({ distance: 0 });
  assert.deepEqual(await planChargingStops(route([]), validVehicle, 0), { stops: [], incomplete: false });
  assert.deepEqual(await planChargingStops(route([[0, 0], [0, 0]]), validVehicle, 0), { stops: [], incomplete: false });
  assert.equal(fetchCount, 0);
});

test('already reachable route returns no stops and does not query charger data', async () => {
  configure({ distance: 10_000 });
  assert.deepEqual(await planChargingStops(route(), validVehicle, 0), { stops: [], incomplete: false });
  assert.equal(fetchCount, 0);
});

test('missing charger candidates produce an incomplete plan with an actionable note', async () => {
  configure({ responses: [[]] });
  const plan = await planChargingStops(route(), { ...validVehicle, batteryKwh: 20 }, 0);
  assert.equal(plan.incomplete, true);
  assert.equal(plan.stops.length, 0);
  assert.match(plan.note, /No charger found/);
  assert.equal(fetchCount, 1);
});

test('duplicate charger IDs are not selected repeatedly', async () => {
  configure({ responses: [[charger('same'), charger('same')], [charger('same')]] });
  const plan = await planChargingStops(route(), { ...validVehicle, batteryKwh: 20 }, 0);
  assert.equal(plan.incomplete, true);
  assert.equal(plan.stops.length, 1);
  assert.match(plan.note, /No charger found/);
  assert.equal(fetchCount, 2);
});

test('planner stops at its maximum and clearly marks the plan incomplete', async () => {
  configure({ responses: [[charger('a')], [charger('b')], [charger('c')], [charger('d')], [charger('e')]] });
  const plan = await planChargingStops(route(), { ...validVehicle, batteryKwh: 20 }, 0);
  assert.equal(plan.stops.length, 4);
  assert.equal(plan.incomplete, true);
  assert.match(plan.note, /more than 4 stops/);
  assert.equal(fetchCount, 4);
});
