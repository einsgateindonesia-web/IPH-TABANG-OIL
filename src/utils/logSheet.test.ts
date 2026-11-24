import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFlowmeterLiters,
  computeSheetTotals,
  createBlankSheet,
  createNextShiftSheet,
  createSampleSheet,
  detectSheetAnomalies,
  filterSheets,
  formatDisplayDate,
  sheetToCsv,
} from './logSheet';

test('calculateFlowmeterLiters computes positive difference and handles decimals', () => {
  assert.deepEqual(calculateFlowmeterLiters('1000', '1025'), {
    liter: '25',
    isAnomaly: false,
  });
  assert.deepEqual(calculateFlowmeterLiters('120.5', '155.25'), {
    liter: '34.75',
    isAnomaly: false,
  });
  assert.deepEqual(calculateFlowmeterLiters('100,5', '110,5'), {
    liter: '10',
    isAnomaly: false,
  });
});

test('calculateFlowmeterLiters handles empty inputs and flags negative difference', () => {
  assert.deepEqual(calculateFlowmeterLiters('', '1025'), {
    liter: '',
    isAnomaly: false,
  });
  assert.deepEqual(calculateFlowmeterLiters('1025', ''), {
    liter: '',
    isAnomaly: false,
  });
  assert.deepEqual(calculateFlowmeterLiters('1050', '1025'), {
    liter: '-25',
    isAnomaly: true,
  });
});

test('createBlankSheet produces 5 stock-in rows and 20 consumption rows', () => {
  const sheet = createBlankSheet({ workingShift: 'Shift 2' });
  assert.equal(sheet.stockIn.length, 5);
  assert.equal(sheet.rows.length, 20);
  assert.equal(sheet.rows[0].rowNumber, 1);
  assert.equal(sheet.rows[19].rowNumber, 20);
  assert.equal(sheet.workingShift, 'Shift 2');
});

test('computeSheetTotals aggregates stock-in, flowmeter, greasing, coolant, and statuses', () => {
  const sheet = createSampleSheet();
  const totals = computeSheetTotals(sheet);
  assert.equal(totals.filledStockInRows, 2);
  assert.equal(totals.totalStockInQty, 418);
  assert.equal(totals.filledConsumptionRows, 4);
  assert.equal(totals.totalFlowmeterLiters, 113); // 28 + 35 + 18 + 32
  assert.equal(totals.totalGreasingMinutes, 55); // 12 + 18 + 10 + 15
  assert.equal(totals.totalGreasingKg, 7.2); // 1.5 + 2.5 + 1.2 + 2
  assert.equal(totals.totalCollantMinutes, 11); // 5 + 6
  assert.equal(totals.totalCollantLiters, 10); // 4 + 6
  assert.deepEqual(totals.statusCounts, { PM: 2, ADD: 1, BD: 1, OTHER: 0 });
  assert.equal(totals.anomaliesCount, 0);
});

test('detectSheetAnomalies finds rows where flowmeterAkhir < flowmeterAwal', () => {
  const sheet = createBlankSheet();
  sheet.rows[2].flowmeterAwal = '500';
  sheet.rows[2].flowmeterAkhir = '480';
  const anomalies = detectSheetAnomalies(sheet);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].rowNumber, 3);
});

test('createNextShiftSheet switches shift and carries over last flowmeterAkhir without counting as filled entry', () => {
  const sample = createSampleSheet();
  const next = createNextShiftSheet(sample);
  assert.equal(next.workingShift, 'Shift 2');
  assert.equal(next.storageLocation, sample.storageLocation);
  assert.equal(next.rows[0].flowmeterAwal, '12563');
  assert.equal(next.rows[0].flowmeterAkhir, '');
  assert.equal(computeSheetTotals(next).filledConsumptionRows, 0);
});

test('filterSheets filters by query and shift', () => {
  const s1 = createSampleSheet();
  const s2 = createBlankSheet({
    workingShift: 'Shift 2',
    storageLocation: 'Lube Truck 01',
  });
  s2.rows[0].noUnit = 'HD-785';

  assert.equal(filterSheets([s1, s2], 'DT-204', 'ALL').length, 1);
  assert.equal(filterSheets([s1, s2], 'HD-785', 'Shift 2').length, 1);
  assert.equal(filterSheets([s1, s2], 'HD-785', 'Shift 1').length, 0);
});

test('formatDisplayDate and sheetToCsv format accurately', () => {
  assert.equal(formatDisplayDate('2026-11-23'), '23/11/2026');
  const sample = createSampleSheet();
  const csv = sheetToCsv(sample);
  assert.ok(csv.includes("OIL & LUBRICANT'S CONSUMPTION LOG SHEET"));
  assert.ok(csv.includes('DT-204'));
  assert.ok(csv.includes('SAE 15W-40 Engine Oil'));
});
