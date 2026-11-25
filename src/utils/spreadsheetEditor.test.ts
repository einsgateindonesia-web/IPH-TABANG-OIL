import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankSheet } from './logSheet';
import { mapSheetsToOutputRows } from './outputMapper';
import {
  commitOutputDraftToSheet,
  findFirstEmptyConsumptionRowIndex,
  updateSheetConsumptionCell,
  updateSheetStockInCell,
} from './spreadsheetEditor';

test('updateSheetConsumptionCell updates cells directly, calculates flowmeter liters, and expands beyond 20 rows', () => {
  let sheet = createBlankSheet({
    date: '2026-11-24',
    storageLocation: 'LST21 - LS WORKSHOP MUARA PAHU TBG-IPH',
    autoCalcFlowmeter: true,
  });

  sheet = updateSheetConsumptionCell(sheet, 0, 'noUnit', 'DLKY200');
  sheet = updateSheetConsumptionCell(sheet, 0, 'oilLubeDescription', 'LO1PAN-SAE15W-40DR');
  sheet = updateSheetConsumptionCell(sheet, 0, 'flowmeterAwal', '100');
  sheet = updateSheetConsumptionCell(sheet, 0, 'flowmeterAkhir', '132');
  sheet = updateSheetConsumptionCell(sheet, 0, 'keteranganStatus', 'PM');

  assert.equal(sheet.rows[0].flowmeterLiter, '32');

  // Verify immediately reflects in Format Output
  const mapped = mapSheetsToOutputRows([sheet], { overrides: {} });
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].unitCode, 'DLKY200');
  assert.equal(mapped[0].codeAlias, 'DL200');
  assert.equal(mapped[0].materialCode, 'LO1PAN-SAE15W-40DR');
  assert.equal(mapped[0].qtyLiter, '32');

  // Adding at index 20 expands rows cleanly
  sheet = updateSheetConsumptionCell(sheet, 20, 'noUnit', 'GSIV008');
  assert.equal(sheet.rows.length, 21);
  assert.equal(sheet.rows[20].rowNumber, 21);
});

test('commitOutputDraftToSheet saves new Spreadsheet Format Output entry into Log Sheet and Format Output', () => {
  const sheet = createBlankSheet({
    date: '2026-11-24',
    storageLocation: 'LST21 - LS WORKSHOP MUARA PAHU TBG-IPH',
  });

  const firstCommit = commitOutputDraftToSheet(
    sheet,
    {
      unitCode: 'DLKD216',
      codeAlias: 'DL216',
      timeHHMM: '10:15',
      componentCode: 'EN001',
      typeOfOutCode: '1',
      storageLocCode: 'LST21',
      hmKm: '4500',
      materialCode: 'DEL15W-40SPDR',
      qtyLiter: '24',
    },
    'LST21'
  );

  assert.equal(firstCommit.updatedSheet.rows[0].noUnit, 'DLKD216');
  assert.equal(firstCommit.updatedSheet.rows[0].oilLubeDescription, 'DEL15W-40SPDR');
  assert.equal(firstCommit.updatedSheet.rows[0].flowmeterLiter, '24');
  assert.equal(firstCommit.updatedSheet.rows[0].keteranganStatus, 'PM');
  assert.equal(firstCommit.overridePatch, undefined);

  // Second entry with grease AU001 goes into greasingKg and preserves materialCode
  const secondCommit = commitOutputDraftToSheet(
    firstCommit.updatedSheet,
    {
      unitCode: 'DLKD217',
      codeAlias: '',
      timeHHMM: '10:45',
      componentCode: 'AU001',
      typeOfOutCode: '3',
      storageLocCode: 'LST13',
      hmKm: '5100',
      materialCode: 'EP2DR',
      qtyLiter: '6',
    },
    'LST21'
  );

  assert.equal(findFirstEmptyConsumptionRowIndex(secondCommit.updatedSheet), 2);
  assert.equal(secondCommit.updatedSheet.rows[1].greasingKg, '6');
  assert.equal(secondCommit.updatedSheet.rows[1].keteranganStatus, 'ADD');
  assert.deepEqual(secondCommit.overridePatch, { storageLocCode: 'LST13' });

  const mapped = mapSheetsToOutputRows([secondCommit.updatedSheet], {
    overrides: secondCommit.overridePatch
      ? { [secondCommit.rowKey]: secondCommit.overridePatch }
      : {},
  });
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].materialCode, 'DEL15W-40SPDR');
  assert.equal(mapped[0].qtyLiter, '24');
  assert.equal(mapped[1].materialCode, 'EP2DR');
  assert.equal(mapped[1].storageLocCode, 'LST13');
  assert.equal(mapped[1].qtyLiter, '6');
});

test('updateSheetStockInCell updates and expands stockIn rows cleanly', () => {
  let sheet = createBlankSheet();
  sheet = updateSheetStockInCell(sheet, 0, 'waktu', '07:30');
  sheet = updateSheetStockInCell(sheet, 0, 'description', 'DEL15W-40SPDR');
  sheet = updateSheetStockInCell(sheet, 0, 'quantity', '208');

  assert.equal(sheet.stockIn[0].description, 'DEL15W-40SPDR');
  assert.equal(sheet.stockIn[0].quantity, '208');
});
