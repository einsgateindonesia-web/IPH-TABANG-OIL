import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankSheet, createSampleSheet } from './logSheet';
import { computeDashboardMetrics } from './dashboardMetrics';

test('computeDashboardMetrics aggregates totals, status breakdown, hourly buckets, and unit identity resolution', () => {
  const s1 = createSampleSheet();
  s1.date = '2026-11-23';
  s1.workingShift = 'Shift 1';
  s1.storageLocation = 'LST21 - LS WORKSHOP MUARA PAHU TBG-IPH';
  // Replace row 1 unit with Code Alias from master list to verify resolution
  s1.rows[0].noUnit = 'SDTR211';

  const s2 = createBlankSheet({
    date: '2026-11-24',
    workingShift: 'Shift 2',
    storageLocation: 'LST13 - LS WORKSHOP SENYIUR SITE TBG-IPH',
  });
  s2.stockIn[0] = {
    rowNumber: 1,
    waktu: '19:00',
    description: 'SAE 15W-40 Engine Oil',
    quantity: '100',
  };
  s2.rows[0].waktu = '20:15';
  s2.rows[0].noUnit = 'DLKY200';
  s2.rows[0].modelUnit = 'Sany';
  s2.rows[0].hm = '1200';
  s2.rows[0].oilLubeDescription = 'SAE 15W-40 Engine Oil';
  s2.rows[0].flowmeterAwal = '500';
  s2.rows[0].flowmeterAkhir = '490'; // anomaly
  s2.rows[0].flowmeterLiter = '10';
  s2.rows[0].keteranganStatus = 'PM';

  const all = computeDashboardMetrics([s2, s1]);
  assert.equal(all.sheetCount, 2);
  assert.equal(all.totalEntries, 5);
  assert.equal(all.uniqueUnitsCount, 5);
  assert.equal(all.totalStockInQty, 518); // 418 + 100
  assert.equal(all.totalFlowmeterLiters, 123); // 113 + 10
  assert.equal(all.totalCollantLiters, 10);
  assert.equal(all.netStockBalance, 385); // 518 - (123 + 10)
  assert.equal(all.anomalies.length, 1);
  assert.equal(all.anomalies[0].rowNumber, 1);

  // Check unit resolution on topUnits
  const takdUnit = all.topUnits.find((u) => u.unitCode === 'TAKD211');
  assert.ok(takdUnit);
  assert.equal(takdUnit.codeAlias, 'SDTR211');

  const dlUnit = all.topUnits.find((u) => u.unitCode === 'DLKY200');
  assert.ok(dlUnit);
  assert.equal(dlUnit.codeAlias, 'DL200');

  // Check hourly distribution contains hours 8, 9, 10, 13, 20
  assert.deepEqual(
    all.hourlyBuckets.map((h) => h.hourNum),
    [8, 9, 10, 13, 20]
  );

  // Check status breakdown: 3 PM, 1 ADD, 1 BD
  const pmStatus = all.statusBreakdown.find((st) => st.code === 'PM');
  assert.equal(pmStatus?.count, 3);
  assert.equal(all.pmSharePercent, 60);
});

test('computeDashboardMetrics filters accurately by shift and location and handles empty matches', () => {
  const s1 = createSampleSheet();
  s1.workingShift = 'Shift 1';
  s1.storageLocation = 'LST21';

  const s2 = createBlankSheet({
    workingShift: 'Shift 2',
    storageLocation: 'LST13',
  });
  s2.rows[0].noUnit = 'GSIV008';
  s2.rows[0].flowmeterLiter = '15';
  s2.rows[0].keteranganStatus = 'BD';

  const shift2Only = computeDashboardMetrics([s1, s2], {
    shift: 'Shift 2',
    location: 'ALL',
  });
  assert.equal(shift2Only.sheetCount, 1);
  assert.equal(shift2Only.totalFlowmeterLiters, 15);

  const emptyFilter = computeDashboardMetrics([s1, s2], {
    shift: 'Shift 2',
    location: 'LST21',
  });
  assert.equal(emptyFilter.sheetCount, 0);
  assert.equal(emptyFilter.totalEntries, 0);
  assert.equal(emptyFilter.topOils.length, 0);
});
