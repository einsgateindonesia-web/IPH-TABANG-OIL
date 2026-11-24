import assert from 'node:assert/strict';
import test from 'node:test';
import { createSampleSheet } from './logSheet';
import {
  buildAppendTargets,
  buildFormattingRequests,
  buildSheetSyncPlan,
  buildSpreadsheetWorksheets,
  columnIndexToLetter,
  extractSpreadsheetId,
  filterUnsentWorksheets,
} from './spreadsheetBuilder';

test('extractSpreadsheetId parses full Google Sheets URLs and raw IDs', () => {
  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'
    ),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(
    extractSpreadsheetId('  1AbCdefGhIJklMNopQRstUVwxyz012345  '),
    '1AbCdefGhIJklMNopQRstUVwxyz012345'
  );
  assert.equal(extractSpreadsheetId('invalid'), '');
});

test('columnIndexToLetter handles single and double letter spreadsheet columns', () => {
  assert.equal(columnIndexToLetter(0), 'A');
  assert.equal(columnIndexToLetter(9), 'J');
  assert.equal(columnIndexToLetter(21), 'V');
  assert.equal(columnIndexToLetter(25), 'Z');
  assert.equal(columnIndexToLetter(26), 'AA');
});

test('buildSpreadsheetWorksheets generates Format Output, Log Sheet, Stock In, and Master tabs', () => {
  const sample = createSampleSheet();
  const sheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: true,
      includeStockIn: true,
      includeMasterTabs: true,
      splitGreaseAndCoolant: true,
    },
  });

  assert.deepEqual(
    sheets.map((s) => s.title),
    [
      'Format Output',
      'Log Sheet',
      'Stock In',
      'Storage Loc',
      'Compnent',
      'Type Of Out',
      'Material Code',
      'Unit Code',
    ]
  );

  const outputSheet = sheets[0];
  assert.equal(outputSheet.headers.length, 10);
  assert.equal(outputSheet.headers[0], 'Unit Code*');
  assert.equal(outputSheet.headers[9], 'Qty* (Liter)');
  assert.ok(outputSheet.rows.length >= 4);
  // First row has numeric HM (6420) and numeric Qty (28)
  assert.equal(outputSheet.rows[0][7], 6420);
  assert.equal(outputSheet.rows[0][9], 28);

  const logSheet = sheets[1];
  assert.equal(logSheet.rows.length, 4);
  assert.equal(logSheet.rows[0][5], 'DT-204');

  const stockIn = sheets[2];
  assert.equal(stockIn.rows.length, 2);
  assert.equal(stockIn.rows[0][6], 209);

  const unitTab = sheets.find((s) => s.title === 'Unit Code');
  assert.ok(unitTab);
  assert.equal(unitTab.rows.length, 595);
});

test('buildSheetSyncPlan never assumes Sheet1 and creates missing tabs while clearing existing ones', () => {
  const sample = createSampleSheet();
  const worksheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: true,
      includeStockIn: false,
      includeMasterTabs: false,
      splitGreaseAndCoolant: true,
    },
  });

  const plan = buildSheetSyncPlan(
    [
      { sheetId: 101, title: 'Custom Tab Name' },
      { sheetId: 202, title: 'Format Output' },
    ],
    worksheets
  );

  assert.deepEqual(plan.tabsToCreate, ['Log Sheet']);
  assert.deepEqual(plan.clearRanges, ["'Format Output'"]);
  assert.equal(plan.valueRanges.length, 2);
  assert.ok(plan.valueRanges[0].range.startsWith("'Format Output'!A1:J"));
  assert.ok(plan.valueRanges[1].range.startsWith("'Log Sheet'!A1:V"));
});

test('buildAppendTargets omits duplicate headers on populated tabs and includes headers on new tabs', () => {
  const sample = createSampleSheet();
  const worksheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: true,
      includeStockIn: false,
      includeMasterTabs: false,
      splitGreaseAndCoolant: true,
    },
  });

  const targets = buildAppendTargets(new Set(['Format Output']), worksheets);
  const outputTarget = targets.find((t) => t.title === 'Format Output');
  const logTarget = targets.find((t) => t.title === 'Log Sheet');

  assert.ok(outputTarget);
  assert.equal(outputTarget.needsHeader, false);
  assert.equal(outputTarget.values.length, worksheets[0].rows.length);

  assert.ok(logTarget);
  assert.equal(logTarget.needsHeader, true);
  assert.equal(logTarget.values.length, worksheets[1].rows.length + 1);
  assert.equal(logTarget.values[0][0], 'Tanggal');
});

test('filterUnsentWorksheets excludes previously synced rows and retains new edits', () => {
  const sample = createSampleSheet();
  const worksheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: false,
      includeStockIn: false,
      includeMasterTabs: false,
      splitGreaseAndCoolant: true,
    },
  });

  const initialDiff = filterUnsentWorksheets(worksheets, new Set());
  assert.equal(initialDiff.totalUnsentRows, worksheets[0].rows.length);

  // Mark all initial rows synced, then add one new row
  const syncedSet = new Set(initialDiff.allCurrentRowKeys);
  const secondDiff = filterUnsentWorksheets(worksheets, syncedSet);
  assert.equal(secondDiff.totalUnsentRows, 0);
  assert.equal(secondDiff.unsentWorksheets.length, 0);

  // Add a 5th row to sample sheet
  sample.rows[4] = {
    ...sample.rows[4],
    waktu: '15:00',
    noUnit: 'DT-210',
    hm: '7000',
    oilLubeDescription: 'SAE 15W-40 Engine Oil',
    flowmeterLiter: '20',
    keteranganStatus: 'PM',
  };
  const updatedWorksheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: false,
      includeStockIn: false,
      includeMasterTabs: false,
      splitGreaseAndCoolant: true,
    },
  });
  const thirdDiff = filterUnsentWorksheets(updatedWorksheets, syncedSet);
  assert.equal(thirdDiff.totalUnsentRows, 1);
  assert.equal(thirdDiff.unsentWorksheets[0].rows[0][0], 'DT-210');
});

test('buildFormattingRequests builds navy header, zebra shading, borders, frozen row, and widths', () => {
  const sample = createSampleSheet();
  const worksheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: false,
      includeStockIn: false,
      includeMasterTabs: false,
      splitGreaseAndCoolant: true,
    },
  });

  const requests = buildFormattingRequests(
    new Map([['Format Output', 0]]),
    worksheets
  );
  assert.ok(requests.length > 5);
  assert.ok(
    requests.some((r) => 'updateSheetProperties' in r),
    'Should freeze header row'
  );
  assert.ok(
    requests.some((r) => 'updateBorders' in r),
    'Should apply cell borders'
  );
});

test('computeSyncStatusSummary classifies unconnected, empty, pending, and synced states accurately', async () => {
  const { computeSyncStatusSummary } = await import('./spreadsheetBuilder');
  const sample = createSampleSheet();
  const worksheets = buildSpreadsheetWorksheets({
    sheets: [sample],
    overrides: {},
    fallbackStorageCode: 'LST21',
    options: {
      includeOutput: true,
      includeLogSheet: false,
      includeStockIn: false,
      includeMasterTabs: true,
      splitGreaseAndCoolant: true,
    },
  });

  // Unconnected state ignores master tab noise and shows Sinkron ke Sheets
  const unconnected = computeSyncStatusSummary(worksheets, new Set(), false);
  assert.equal(unconnected.state, 'unconnected');
  assert.equal(unconnected.buttonLabel, 'Sinkron ke Sheets');
  assert.equal(unconnected.totalOperationalRows, worksheets[0].rows.length);

  // Connected with unsent operational rows
  const pending = computeSyncStatusSummary(worksheets, new Set(), true);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.unsentOperationalRows, worksheets[0].rows.length);
  assert.equal(pending.buttonLabel, `Sinkron (${worksheets[0].rows.length})`);

  // Connected when all operational rows are already synced (even if master tabs aren't in syncedSet)
  const diff = filterUnsentWorksheets([worksheets[0]], new Set());
  const synced = computeSyncStatusSummary(
    worksheets,
    new Set(diff.allCurrentRowKeys),
    true
  );
  assert.equal(synced.state, 'synced');
  assert.equal(synced.unsentOperationalRows, 0);
  assert.equal(synced.buttonLabel, 'Sinkron Ulang');

  // Connected with empty operational sheet
  const empty = computeSyncStatusSummary(
    [{ ...worksheets[0], rows: [] }, worksheets[1]],
    new Set(),
    true
  );
  assert.equal(empty.state, 'empty');
  assert.equal(empty.totalOperationalRows, 0);
  assert.equal(empty.buttonLabel, 'Sinkron');
});
