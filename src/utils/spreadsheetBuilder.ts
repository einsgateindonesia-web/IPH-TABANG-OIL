import {
  COMPARTEMENTS,
  MATERIAL_CODES,
  TYPE_OF_OUT_OPTIONS,
  UNIT_CODES,
  WAREHOUSE_LOCATIONS,
} from '../data/masterData';
import type {
  LogSheet,
  OutputOverrideMap,
  SpreadsheetIncludeOptions,
} from '../types/logSheet';
import {
  formatDisplayDate,
  isConsumptionRowFilled,
  isStockInRowFilled,
  parseLocaleNumber,
} from './logSheet';
import {
  OUTPUT_HEADERS,
  mapSheetsToOutputRows,
  resolveUnitIdentity,
} from './outputMapper';

export type CellValue = string | number;

export interface WorksheetSpec {
  title: string;
  headers: string[];
  rows: CellValue[][];
  columnWidths: number[]; // approximate character width
  numericColumns?: number[]; // 0-based column indices right-aligned in UI/sheets
  headerBgHex: string; // e.g. '#000080'
  zebraBgHex: string; // e.g. '#D9E2F3'
}

export interface BuildSpreadsheetInput {
  sheets: LogSheet[];
  overrides: OutputOverrideMap;
  fallbackStorageCode: string;
  options: SpreadsheetIncludeOptions;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  // Raw ID (no slashes)
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return '';
}

function toNumericOrString(raw: string): CellValue {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const num = parseLocaleNumber(trimmed);
  return num !== null ? num : trimmed;
}

export function columnIndexToLetter(index: number): string {
  let n = index;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function buildSpreadsheetWorksheets(
  input: BuildSpreadsheetInput
): WorksheetSpec[] {
  const { sheets, overrides, fallbackStorageCode, options } = input;
  const result: WorksheetSpec[] = [];

  if (options.includeOutput) {
    const outputRows = mapSheetsToOutputRows(sheets, {
      overrides,
      fallbackStorageCode,
      splitGreaseAndCoolant: options.splitGreaseAndCoolant,
    });

    result.push({
      title: 'Format Output',
      headers: [...OUTPUT_HEADERS],
      rows: outputRows.map((r) => [
        r.unitCode,
        r.codeAlias,
        r.dateYYYYMMDD,
        r.timeHHMM,
        r.componentCode,
        r.typeOfOutCode,
        r.storageLocCode,
        toNumericOrString(r.hmKm),
        r.materialCode,
        toNumericOrString(r.qtyLiter),
      ]),
      columnWidths: [14, 16, 15, 13, 13, 13, 18, 12, 24, 14],
      numericColumns: [7, 9],
      headerBgHex: '#000080',
      zebraBgHex: '#D9E2F3',
    });
  }

  if (options.includeLogSheet) {
    const logHeaders = [
      'Tanggal',
      'Shift',
      'Lokasi Penyimpanan',
      'No.',
      'Waktu',
      'No. Unit',
      'Code Alias',
      'Model Unit',
      'HM',
      'Oil & Lube Description',
      'Flowmeter Awal',
      'Flowmeter Akhir',
      'Flowmeter Liter',
      'Greasing Menit',
      'Greasing Kg',
      'Collant Menit',
      'Collant Liter',
      'Keterangan / Status',
      'Driver / Mechanic',
      'GL / SPV Plant',
      'GL / SPV SCM',
      'Dept. Head Plant',
    ];

    const logRows: CellValue[][] = [];
    for (const sheet of sheets) {
      const displayDate = formatDisplayDate(sheet.date) || sheet.date;
      for (const row of sheet.rows) {
        if (!isConsumptionRowFilled(row)) continue;
        const unit = resolveUnitIdentity(row.noUnit);
        logRows.push([
          displayDate,
          sheet.workingShift,
          sheet.storageLocation,
          row.rowNumber,
          row.waktu,
          row.noUnit,
          unit.codeAlias,
          row.modelUnit,
          toNumericOrString(row.hm),
          row.oilLubeDescription,
          toNumericOrString(row.flowmeterAwal),
          toNumericOrString(row.flowmeterAkhir),
          toNumericOrString(row.flowmeterLiter),
          toNumericOrString(row.greasingMenit),
          toNumericOrString(row.greasingKg),
          toNumericOrString(row.collantMenit),
          toNumericOrString(row.collantLiter),
          row.keteranganStatus,
          sheet.signatures.driverMechanic,
          sheet.signatures.glSpvPlant,
          sheet.signatures.glSpvScm,
          sheet.signatures.deptHeadPlant,
        ]);
      }
    }

    result.push({
      title: 'Log Sheet',
      headers: logHeaders,
      rows: logRows,
      columnWidths: [
        13, 10, 22, 6, 9, 13, 14, 18, 10, 28, 15, 15, 15, 15, 13, 14, 14, 18,
        18, 18, 18, 20,
      ],
      numericColumns: [3, 8, 10, 11, 12, 13, 14, 15, 16],
      headerBgHex: '#000080',
      zebraBgHex: '#D9E2F3',
    });
  }

  if (options.includeStockIn) {
    const stockInRows: CellValue[][] = [];
    for (const sheet of sheets) {
      const displayDate = formatDisplayDate(sheet.date) || sheet.date;
      for (const sRow of sheet.stockIn) {
        if (!isStockInRowFilled(sRow)) continue;
        stockInRows.push([
          displayDate,
          sheet.workingShift,
          sheet.storageLocation,
          sRow.rowNumber,
          sRow.waktu,
          sRow.description,
          toNumericOrString(sRow.quantity),
        ]);
      }
    }

    result.push({
      title: 'Stock In',
      headers: [
        'Tanggal',
        'Shift',
        'Lokasi Penyimpanan',
        'No.',
        'Waktu',
        'Oil & Lube Description',
        'Quantity',
      ],
      rows: stockInRows,
      columnWidths: [14, 10, 24, 6, 10, 32, 12],
      numericColumns: [3, 6],
      headerBgHex: '#000080',
      zebraBgHex: '#D9E2F3',
    });
  }

  if (options.includeMasterTabs) {
    result.push({
      title: 'Storage Loc',
      headers: ['Code', 'Warehouse Name'],
      rows: WAREHOUSE_LOCATIONS.map((w) => [w.code, w.warehouseName]),
      columnWidths: [14, 42],
      headerBgHex: '#000080',
      zebraBgHex: '#F1F5F9',
    });

    result.push({
      title: 'Compnent',
      headers: ['Code', 'Compartement'],
      rows: COMPARTEMENTS.map((c) => [c.code, c.compartement]),
      columnWidths: [14, 42],
      headerBgHex: '#000080',
      zebraBgHex: '#F1F5F9',
    });

    result.push({
      title: 'Type Of Out',
      headers: ['Code', 'Type of Out'],
      rows: TYPE_OF_OUT_OPTIONS.map((t) => [t.code, t.typeOfOut]),
      columnWidths: [12, 32],
      headerBgHex: '#000080',
      zebraBgHex: '#F1F5F9',
    });

    result.push({
      title: 'Material Code',
      headers: ['Material Code', 'Oil Name'],
      rows: MATERIAL_CODES.map((m) => [m.materialCode, m.oilName]),
      columnWidths: [26, 56],
      headerBgHex: '#000080',
      zebraBgHex: '#F1F5F9',
    });

    result.push({
      title: 'Unit Code',
      headers: ['Unit Code', 'Code Alias'],
      rows: UNIT_CODES.map((u) => [u.unitCode, u.codeAlias]),
      columnWidths: [18, 24],
      headerBgHex: '#000080',
      zebraBgHex: '#F1F5F9',
    });
  }

  return result;
}

export interface SheetsRgbColor {
  red: number;
  green: number;
  blue: number;
}

export function hexToSheetsColor(hex: string): SheetsRgbColor {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

export interface ExistingSheetMeta {
  sheetId: number;
  title: string;
}

export interface SheetSyncPlan {
  tabsToCreate: string[];
  valueRanges: { range: string; values: CellValue[][] }[];
  clearRanges: string[];
}

export function buildSheetSyncPlan(
  existingSheets: ExistingSheetMeta[],
  worksheets: WorksheetSpec[]
): SheetSyncPlan {
  const existingTitles = new Set(existingSheets.map((s) => s.title));
  const tabsToCreate: string[] = [];
  const valueRanges: { range: string; values: CellValue[][] }[] = [];
  const clearRanges: string[] = [];

  for (const ws of worksheets) {
    if (!existingTitles.has(ws.title)) {
      tabsToCreate.push(ws.title);
    } else {
      clearRanges.push(`'${ws.title.replace(/'/g, "''")}'`);
    }
    const escapedTitle = `'${ws.title.replace(/'/g, "''")}'`;
    const lastCol = columnIndexToLetter(Math.max(ws.headers.length - 1, 0));
    const totalRows = Math.max(1 + ws.rows.length, 1);
    valueRanges.push({
      range: `${escapedTitle}!A1:${lastCol}${totalRows}`,
      values: [ws.headers, ...ws.rows],
    });
  }

  return { tabsToCreate, valueRanges, clearRanges };
}

export interface AppendTargetPlan {
  title: string;
  range: string;
  values: CellValue[][];
  needsHeader: boolean;
}

export function buildAppendTargets(
  tabsWithHeaderPresent: Set<string>,
  worksheets: WorksheetSpec[]
): AppendTargetPlan[] {
  const targets: AppendTargetPlan[] = [];
  for (const ws of worksheets) {
    if (ws.rows.length === 0 && tabsWithHeaderPresent.has(ws.title)) {
      continue;
    }
    const escapedTitle = `'${ws.title.replace(/'/g, "''")}'`;
    const lastCol = columnIndexToLetter(Math.max(ws.headers.length - 1, 0));
    const hasHeader = tabsWithHeaderPresent.has(ws.title);
    targets.push({
      title: ws.title,
      range: `${escapedTitle}!A:${lastCol}`,
      values: hasHeader ? ws.rows : [ws.headers, ...ws.rows],
      needsHeader: !hasHeader,
    });
  }
  return targets;
}

export function computeRowSyncKey(title: string, row: CellValue[]): string {
  return `${title}::${JSON.stringify(row)}`;
}

export interface UnsentWorksheetDiff {
  unsentWorksheets: WorksheetSpec[];
  totalUnsentRows: number;
  allCurrentRowKeys: string[];
}

export function filterUnsentWorksheets(
  worksheets: WorksheetSpec[],
  alreadySyncedKeys: Set<string>
): UnsentWorksheetDiff {
  const unsentWorksheets: WorksheetSpec[] = [];
  const allCurrentRowKeys: string[] = [];
  let totalUnsentRows = 0;

  for (const ws of worksheets) {
    // Master tabs are static reference tables; only append them if the tab itself hasn't been synced yet
    const unsentRows: CellValue[][] = [];
    for (const row of ws.rows) {
      const key = computeRowSyncKey(ws.title, row);
      allCurrentRowKeys.push(key);
      if (!alreadySyncedKeys.has(key)) {
        unsentRows.push(row);
      }
    }
    if (unsentRows.length > 0) {
      totalUnsentRows += unsentRows.length;
      unsentWorksheets.push({
        ...ws,
        rows: unsentRows,
      });
    }
  }

  return { unsentWorksheets, totalUnsentRows, allCurrentRowKeys };
}

const OPERATIONAL_SHEET_TITLES = new Set([
  'Format Output',
  'Log Sheet',
  'Stock In',
]);

export interface SyncStatusSummary {
  state: 'unconnected' | 'empty' | 'pending' | 'synced';
  totalOperationalRows: number;
  unsentOperationalRows: number;
  buttonLabel: string;
}

export function computeSyncStatusSummary(
  worksheets: WorksheetSpec[],
  alreadySyncedKeys: Set<string>,
  isConnected: boolean
): SyncStatusSummary {
  const operationalSheets = worksheets.filter((ws) =>
    OPERATIONAL_SHEET_TITLES.has(ws.title)
  );
  const targetSheets =
    operationalSheets.length > 0 ? operationalSheets : worksheets;

  const totalOperationalRows = targetSheets.reduce(
    (sum, ws) => sum + ws.rows.length,
    0
  );

  if (!isConnected) {
    return {
      state: 'unconnected',
      totalOperationalRows,
      unsentOperationalRows: totalOperationalRows,
      buttonLabel: 'Sinkron ke Sheets',
    };
  }

  if (totalOperationalRows === 0) {
    return {
      state: 'empty',
      totalOperationalRows: 0,
      unsentOperationalRows: 0,
      buttonLabel: 'Sinkron',
    };
  }

  const diff = filterUnsentWorksheets(targetSheets, alreadySyncedKeys);
  if (diff.totalUnsentRows > 0) {
    return {
      state: 'pending',
      totalOperationalRows,
      unsentOperationalRows: diff.totalUnsentRows,
      buttonLabel: `Sinkron (${diff.totalUnsentRows})`,
    };
  }

  return {
    state: 'synced',
    totalOperationalRows,
    unsentOperationalRows: 0,
    buttonLabel: 'Sinkron Ulang',
  };
}

export function buildFormattingRequests(
  sheetIdByTitle: Map<string, number>,
  worksheets: WorksheetSpec[]
): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];

  for (const ws of worksheets) {
    const sheetId = sheetIdByTitle.get(ws.title);
    if (sheetId === undefined) continue;

    const colCount = Math.max(ws.headers.length, 1);
    const totalRows = 1 + ws.rows.length;

    // Header styling (#000080 navy background, white bold text)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: colCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: hexToSheetsColor(ws.headerBgHex),
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 10,
            },
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    });

    // Zebra alternating light-blue rows on even data rows (index 1, 3, 5... => 1-based row 2, 4, 6...)
    for (let r = 0; r < ws.rows.length; r += 2) {
      const rowIdx = 1 + r;
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIdx,
            endRowIndex: rowIdx + 1,
            startColumnIndex: 0,
            endColumnIndex: colCount,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: hexToSheetsColor(ws.zebraBgHex),
            },
          },
          fields: 'userEnteredFormat.backgroundColor',
        },
      });
    }

    // Thin solid slate borders around all populated cells
    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: totalRows,
          startColumnIndex: 0,
          endColumnIndex: colCount,
        },
        top: { style: 'SOLID', width: 1, color: { red: 0.78, green: 0.82, blue: 0.88 } },
        bottom: { style: 'SOLID', width: 1, color: { red: 0.78, green: 0.82, blue: 0.88 } },
        left: { style: 'SOLID', width: 1, color: { red: 0.78, green: 0.82, blue: 0.88 } },
        right: { style: 'SOLID', width: 1, color: { red: 0.78, green: 0.82, blue: 0.88 } },
        innerHorizontal: {
          style: 'SOLID',
          width: 1,
          color: { red: 0.82, green: 0.85, blue: 0.9 },
        },
        innerVertical: {
          style: 'SOLID',
          width: 1,
          color: { red: 0.82, green: 0.85, blue: 0.9 },
        },
      },
    });

    // Freeze header row
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // Explicit column pixel widths (~7.5px per character)
    ws.columnWidths.forEach((chars, idx) => {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: idx,
            endIndex: idx + 1,
          },
          properties: {
            pixelSize: Math.max(70, Math.round(chars * 8)),
          },
          fields: 'pixelSize',
        },
      });
    });
  }

  return requests;
}
