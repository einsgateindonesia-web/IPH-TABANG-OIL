import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIT_CODES } from '../data/masterData';
import { createBlankSheet, createSampleSheet } from './logSheet';
import {
  formatDateYYYYMMDD,
  inferComponentCode,
  inferMaterialCode,
  inferStorageLocCode,
  inferTypeOfOutCode,
  mapSheetsToOutputRows,
  normalizeTimeHHMM,
  outputRowsToCsv,
  outputRowsToTsv,
  resolveUnitIdentity,
} from './outputMapper';

test('formatDateYYYYMMDD and normalizeTimeHHMM format dates and times consistently', () => {
  assert.equal(formatDateYYYYMMDD('2026-11-23'), '20261123');
  assert.equal(formatDateYYYYMMDD('23/11/2026'), '20261123');
  assert.equal(formatDateYYYYMMDD('20261123'), '20261123');
  assert.equal(normalizeTimeHHMM('8:30'), '08:30');
  assert.equal(normalizeTimeHHMM('14.05'), '14:05');
});

test('inferStorageLocCode, inferTypeOfOutCode, and inferComponentCode map master codes accurately', () => {
  assert.equal(inferStorageLocCode('LST21 - LS WORKSHOP MUARA PAHU TBG-IPH'), 'LST21');
  assert.equal(inferStorageLocCode('WHS OIL & GREASE SITE SENYIUR IPR-SYR'), 'WOG18');
  assert.equal(inferStorageLocCode('Lube Station Pit A', 'LST21'), 'LST21');

  assert.equal(inferTypeOfOutCode('PM'), '1');
  assert.equal(inferTypeOfOutCode('BD'), '2');
  assert.equal(inferTypeOfOutCode('ADD'), '3');

  assert.equal(inferComponentCode('SAE 15W-40 Engine Oil', 'oil'), 'EN001');
  assert.equal(inferComponentCode('SAE 10W Hydraulic Oil', 'oil'), 'HY001');
  assert.equal(inferComponentCode('SAE 30 Transmission Oil', 'oil'), 'TR001');
  assert.equal(inferComponentCode('Anything', 'grease'), 'AU001');
  assert.equal(inferComponentCode('Anything', 'coolant'), 'CO001');
});

test('inferMaterialCode matches known oils, greases, coolants, and explicit codes', () => {
  assert.equal(inferMaterialCode('LO1MOB-DEL15W-40SPDR', 'oil'), 'LO1MOB-DEL15W-40SPDR');
  assert.equal(inferMaterialCode('SAE 15W-40 Engine Oil', 'oil'), 'LO1PAN-SAE15W-40DR');
  assert.equal(inferMaterialCode('SAE 10W Hydraulic Oil', 'oil'), 'LO1PAN-HYD10WDR');
  assert.equal(inferMaterialCode('', 'grease'), 'LO2MOB-EP2');
  assert.equal(inferMaterialCode('', 'coolant'), 'COOLANTHD50');
});

test('mapSheetsToOutputRows splits oil, grease, and coolant and applies manual overrides', () => {
  const sample = createSampleSheet();
  sample.date = '2026-11-23';
  sample.storageLocation = 'LST21 - LS WORKSHOP MUARA PAHU TBG-IPH';

  const splitRows = mapSheetsToOutputRows([sample], {
    overrides: {
      [`${sample.id}:1:oil`]: { codeAlias: 'SYSHAB', materialCode: 'DEL15W-40SPDR' },
    },
    splitGreaseAndCoolant: true,
  });

  // Sample has 4 oil rows + 4 grease rows + 2 coolant rows = 10 output rows
  assert.equal(splitRows.length, 10);
  assert.equal(splitRows[0].unitCode, 'DT-204');
  assert.equal(splitRows[0].codeAlias, 'SYSHAB');
  assert.equal(splitRows[0].dateYYYYMMDD, '20261123');
  assert.equal(splitRows[0].timeHHMM, '08:10');
  assert.equal(splitRows[0].componentCode, 'EN001');
  assert.equal(splitRows[0].typeOfOutCode, '1');
  assert.equal(splitRows[0].storageLocCode, 'LST21');
  assert.equal(splitRows[0].hmKm, '6420');
  assert.equal(splitRows[0].materialCode, 'DEL15W-40SPDR');
  assert.equal(splitRows[0].qtyLiter, '28');

  // Row 1 grease row
  assert.equal(splitRows[1].mediumKind, 'grease');
  assert.equal(splitRows[1].componentCode, 'AU001');
  assert.equal(splitRows[1].qtyLiter, '1.5');

  // Row 1 coolant row
  assert.equal(splitRows[2].mediumKind, 'coolant');
  assert.equal(splitRows[2].componentCode, 'CO001');
  assert.equal(splitRows[2].qtyLiter, '4');

  // Without splitting grease/coolant
  const oilOnlyRows = mapSheetsToOutputRows([sample], {
    overrides: {},
    splitGreaseAndCoolant: false,
  });
  assert.equal(oilOnlyRows.length, 4);
});

test('outputRowsToTsv and outputRowsToCsv generate exact 10-column headers and values', () => {
  const sheet = createBlankSheet({
    date: '2026-11-23',
    storageLocation: 'LST21',
  });
  sheet.rows[0].noUnit = 'SYSHAB';
  sheet.rows[0].waktu = '08:30';
  sheet.rows[0].hm = '100';
  sheet.rows[0].oilLubeDescription = 'Grease EP2';
  sheet.rows[0].flowmeterLiter = '1';
  sheet.rows[0].keteranganStatus = 'PM';

  const rows = mapSheetsToOutputRows([sheet], { overrides: {} });
  const tsv = outputRowsToTsv(rows);
  const csv = outputRowsToCsv(rows);

  assert.ok(tsv.startsWith('Unit Code*\tCode Alias\tDate YYYYMMDD*\tTime HH:MM*\tCompnent*\tType Of Out\tCode Storage Loc.\tHm/Km*\tMaterial Code*\tQty* (Liter)'));
  assert.ok(tsv.includes('SYSHAB\tSYSHAB\t20261123\t08:30\tAU001\t1\tLST21\t100\t'));
  assert.ok(csv.includes('SYSHAB,SYSHAB,20261123,08:30,AU001,1,LST21,100,'));
});

test('UNIT_CODES catalog and resolveUnitIdentity resolve Unit Code and Code Alias bidirectionally', () => {
  assert.equal(UNIT_CODES.length, 595);

  // Lookup by official Unit Code -> resolves exact Code Alias
  assert.deepEqual(resolveUnitIdentity('DLKY200'), {
    unitCode: 'DLKY200',
    codeAlias: 'DL200',
  });
  assert.deepEqual(resolveUnitIdentity('WBLG111'), {
    unitCode: 'WBLG111',
    codeAlias: 'DTLG111',
  });
  assert.deepEqual(resolveUnitIdentity('TSMT001'), {
    unitCode: 'TSMT001',
    codeAlias: 'TS002-KT8693YG',
  });
  assert.deepEqual(resolveUnitIdentity('EXXC028'), {
    unitCode: 'EXXC028',
    codeAlias: 'EXXC028',
  });

  // Lookup by Code Alias (including lowercase / hyphenated field notation) -> resolves official Unit Code
  assert.deepEqual(resolveUnitIdentity('SDTR211'), {
    unitCode: 'TAKD211',
    codeAlias: 'SDTR211',
  });
  assert.deepEqual(resolveUnitIdentity('sdtr-211'), {
    unitCode: 'TAKD211',
    codeAlias: 'SDTR211',
  });
  assert.deepEqual(resolveUnitIdentity('LV006'), {
    unitCode: 'LVIZ017',
    codeAlias: 'LV006',
  });

  // Unknown unit code passes through unchanged
  assert.deepEqual(resolveUnitIdentity('DT-204'), {
    unitCode: 'DT-204',
    codeAlias: 'DT-204',
  });

  // End-to-end check inside mapSheetsToOutputRows + manual override
  const sheet = createBlankSheet({ date: '2026-11-23', storageLocation: 'LST21' });
  sheet.rows[0].noUnit = 'SDTR211';
  sheet.rows[0].waktu = '09:00';
  sheet.rows[0].hm = '500';
  sheet.rows[0].oilLubeDescription = 'SAE 15W-40 Engine Oil';
  sheet.rows[0].flowmeterLiter = '12';
  sheet.rows[0].keteranganStatus = 'PM';

  sheet.rows[1].noUnit = 'LV027';
  sheet.rows[1].waktu = '09:15';
  sheet.rows[1].hm = '320';
  sheet.rows[1].oilLubeDescription = 'SAE 15W-40 Engine Oil';
  sheet.rows[1].flowmeterLiter = '6';
  sheet.rows[1].keteranganStatus = 'ADD';

  const mapped = mapSheetsToOutputRows([sheet], {
    overrides: {
      [`${sheet.id}:2:oil`]: { unitCode: 'LVMT087' },
    },
  });

  assert.equal(mapped[0].unitCode, 'TAKD211');
  assert.equal(mapped[0].codeAlias, 'SDTR211');
  assert.equal(mapped[1].unitCode, 'LVMT087');
  assert.equal(mapped[1].codeAlias, 'LV027');
});

test('single grease-only or coolant-only input without flowmeter emits 1 row instead of duplicating', () => {
  const sheet = createBlankSheet({
    date: '2026-11-24',
    storageLocation: 'LST21',
  });
  // User enters EP2DR grease + Greasing Kg = 6, leaving Flowmeter empty
  sheet.rows[0].waktu = '14:10';
  sheet.rows[0].noUnit = 'DLKD216';
  sheet.rows[0].hm = '4285';
  sheet.rows[0].oilLubeDescription = 'EP2DR';
  sheet.rows[0].greasingKg = '6';
  sheet.rows[0].keteranganStatus = 'PM';

  // User enters COOLANTHD50 + Collant Liter = 5, leaving Flowmeter empty
  sheet.rows[1].waktu = '14:20';
  sheet.rows[1].noUnit = 'DLKD217';
  sheet.rows[1].hm = '5100';
  sheet.rows[1].oilLubeDescription = 'COOLANTHD50';
  sheet.rows[1].collantLiter = '5';
  sheet.rows[1].keteranganStatus = 'ADD';

  const splitRows = mapSheetsToOutputRows([sheet], {
    overrides: {},
    splitGreaseAndCoolant: true,
  });

  assert.equal(splitRows.length, 2);
  assert.equal(splitRows[0].unitCode, 'DLKD216');
  assert.equal(splitRows[0].codeAlias, 'DL216');
  assert.equal(splitRows[0].componentCode, 'AU001');
  assert.equal(splitRows[0].materialCode, 'EP2DR');
  assert.equal(splitRows[0].qtyLiter, '6');

  assert.equal(splitRows[1].unitCode, 'DLKD217');
  assert.equal(splitRows[1].componentCode, 'CO001');
  assert.equal(splitRows[1].materialCode, 'COOLANTHD50');
  assert.equal(splitRows[1].qtyLiter, '5');

  const unsplitRows = mapSheetsToOutputRows([sheet], {
    overrides: {},
    splitGreaseAndCoolant: false,
  });
  assert.equal(unsplitRows.length, 2);
  assert.equal(unsplitRows[0].qtyLiter, '6');
  assert.equal(unsplitRows[1].qtyLiter, '5');
});

test('OIL & LUBE DESCRIPTION in Lembar Log always matches Format Output Material Code* verbatim and resolves Compnent*', () => {
  const sheet = createBlankSheet({
    date: '2026-11-24',
    storageLocation: 'LST21',
  });
  sheet.rows[0].waktu = '08:00';
  sheet.rows[0].noUnit = 'DLKY200';
  sheet.rows[0].hm = '1000';
  sheet.rows[0].oilLubeDescription = 'LO1PAN-TRSMS50DR';
  sheet.rows[0].flowmeterLiter = '15';
  sheet.rows[0].keteranganStatus = 'PM';

  sheet.rows[1].waktu = '08:30';
  sheet.rows[1].noUnit = 'DT-204';
  sheet.rows[1].hm = '2000';
  sheet.rows[1].oilLubeDescription = 'CUSTOM ENGINE OIL 15W-40';
  sheet.rows[1].flowmeterLiter = '20';
  sheet.rows[1].keteranganStatus = 'ADD';

  const mapped = mapSheetsToOutputRows([sheet], { overrides: {} });
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].materialCode, 'LO1PAN-TRSMS50DR');
  assert.equal(mapped[0].componentCode, 'TR001');
  assert.equal(mapped[1].materialCode, 'CUSTOM ENGINE OIL 15W-40');
  assert.equal(mapped[1].componentCode, 'EN001');
});

