import type {
  ConsumptionRow,
  LogSheet,
  OutputMediumKind,
  OutputRowOverride,
  StockInRow,
} from '../types/logSheet';
import {
  calculateFlowmeterLiters,
  getCurrentTimeHHmm,
  isConsumptionRowFilled,
  isStockInRowFilled,
} from './logSheet';
import {
  inferComponentCode,
  inferStorageLocCode,
  inferTypeOfOutCode,
  resolveUnitIdentity,
} from './outputMapper';

export interface QuickOutputDraft {
  unitCode: string;
  codeAlias: string;
  timeHHMM: string;
  componentCode: string;
  typeOfOutCode: string;
  storageLocCode: string;
  hmKm: string;
  materialCode: string;
  qtyLiter: string;
}

export function createEmptyConsumptionRow(rowNumber: number): ConsumptionRow {
  return {
    rowNumber,
    waktu: '',
    noUnit: '',
    modelUnit: '',
    hm: '',
    oilLubeDescription: '',
    flowmeterAwal: '',
    flowmeterAkhir: '',
    flowmeterLiter: '',
    flowmeterManualOverride: false,
    greasingMenit: '',
    greasingKg: '',
    collantMenit: '',
    collantLiter: '',
    keteranganStatus: '',
  };
}

export function updateSheetConsumptionCell(
  sheet: LogSheet,
  rowIndex: number,
  field: keyof Omit<ConsumptionRow, 'rowNumber'>,
  value: string
): LogSheet {
  const nextRows = [...sheet.rows];
  while (nextRows.length <= rowIndex) {
    nextRows.push(createEmptyConsumptionRow(nextRows.length + 1));
  }

  const target = nextRows[rowIndex];
  const updated: ConsumptionRow = {
    ...target,
    [field]: value,
  };

  if (field === 'flowmeterLiter') {
    updated.flowmeterManualOverride = value.trim() !== '';
    if (value.trim() === '' && sheet.autoCalcFlowmeter) {
      const calc = calculateFlowmeterLiters(
        updated.flowmeterAwal,
        updated.flowmeterAkhir
      );
      updated.flowmeterLiter = calc.liter;
      updated.flowmeterManualOverride = false;
    }
  } else if (
    (field === 'flowmeterAwal' || field === 'flowmeterAkhir') &&
    sheet.autoCalcFlowmeter &&
    !target.flowmeterManualOverride
  ) {
    const calc = calculateFlowmeterLiters(
      updated.flowmeterAwal,
      updated.flowmeterAkhir
    );
    updated.flowmeterLiter = calc.liter;
  }

  nextRows[rowIndex] = updated;

  return {
    ...sheet,
    rows: nextRows,
    updatedAt: new Date().toISOString(),
  };
}

export function updateSheetStockInCell(
  sheet: LogSheet,
  rowIndex: number,
  field: keyof Omit<StockInRow, 'rowNumber'>,
  value: string
): LogSheet {
  const nextStockIn = [...sheet.stockIn];
  while (nextStockIn.length <= rowIndex) {
    nextStockIn.push({
      rowNumber: nextStockIn.length + 1,
      waktu: '',
      description: '',
      quantity: '',
    });
  }

  nextStockIn[rowIndex] = {
    ...nextStockIn[rowIndex],
    [field]: value,
  };

  return {
    ...sheet,
    stockIn: nextStockIn,
    updatedAt: new Date().toISOString(),
  };
}

export function findFirstEmptyConsumptionRowIndex(sheet: LogSheet): number {
  const idx = sheet.rows.findIndex((r) => !isConsumptionRowFilled(r));
  return idx !== -1 ? idx : sheet.rows.length;
}

export function findFirstEmptyStockInRowIndex(sheet: LogSheet): number {
  const idx = sheet.stockIn.findIndex((r) => !isStockInRowFilled(r));
  return idx !== -1 ? idx : sheet.stockIn.length;
}

export function typeOfOutCodeToLogStatus(code: string): string {
  const clean = code.trim();
  if (clean === '1') return 'PM';
  if (clean === '2') return 'BD';
  if (clean === '3') return 'ADD';
  return clean;
}

export function isQuickOutputDraftReady(draft: QuickOutputDraft): boolean {
  return Boolean(
    draft.unitCode.trim() ||
      draft.materialCode.trim() ||
      draft.qtyLiter.trim() ||
      draft.hmKm.trim()
  );
}

export function commitOutputDraftToSheet(
  sheet: LogSheet,
  draft: QuickOutputDraft,
  fallbackStorageCode = ''
): {
  updatedSheet: LogSheet;
  rowKey: string;
  overridePatch?: Partial<OutputRowOverride>;
} {
  const targetIdx = findFirstEmptyConsumptionRowIndex(sheet);
  const nextRows = [...sheet.rows];
  while (nextRows.length <= targetIdx) {
    nextRows.push(createEmptyConsumptionRow(nextRows.length + 1));
  }

  const baseRow = nextRows[targetIdx];
  const cleanUnit = draft.unitCode.trim();
  const cleanMaterial = draft.materialCode.trim();
  const cleanQty = draft.qtyLiter.trim();
  const cleanTime = draft.timeHHMM.trim() || getCurrentTimeHHmm();
  const cleanHm = draft.hmKm.trim();
  const cleanType = draft.typeOfOutCode.trim();
  const cleanComp =
    draft.componentCode.trim() || inferComponentCode(cleanMaterial, 'oil');

  let mediumKind: OutputMediumKind = 'oil';
  if (cleanComp === 'AU001') {
    mediumKind = 'grease';
  } else if (cleanComp === 'CO001') {
    mediumKind = 'coolant';
  }

  const nextRow: ConsumptionRow = {
    ...baseRow,
    waktu: cleanTime,
    noUnit: cleanUnit,
    hm: cleanHm,
    oilLubeDescription: cleanMaterial,
    keteranganStatus: typeOfOutCodeToLogStatus(cleanType),
  };

  if (mediumKind === 'grease') {
    nextRow.greasingKg = cleanQty;
  } else if (mediumKind === 'coolant') {
    nextRow.collantLiter = cleanQty;
  } else {
    nextRow.flowmeterLiter = cleanQty;
    nextRow.flowmeterManualOverride = cleanQty !== '';
  }

  nextRows[targetIdx] = nextRow;

  const updatedSheet: LogSheet = {
    ...sheet,
    rows: nextRows,
    updatedAt: new Date().toISOString(),
  };

  const rowKey = `${sheet.id}:${nextRow.rowNumber}:${mediumKind}`;
  const overridePatch: Partial<OutputRowOverride> = {};

  const resolvedUnit = resolveUnitIdentity(cleanUnit);
  const cleanAlias = draft.codeAlias.trim();
  if (cleanAlias && cleanAlias !== resolvedUnit.codeAlias) {
    overridePatch.codeAlias = cleanAlias;
  }

  const inferredComp = inferComponentCode(cleanMaterial, mediumKind);
  if (cleanComp && cleanComp !== inferredComp) {
    overridePatch.componentCode = cleanComp;
  }

  const inferredType = inferTypeOfOutCode(nextRow.keteranganStatus);
  if (cleanType && cleanType !== inferredType) {
    overridePatch.typeOfOutCode = cleanType;
  }

  const inferredLoc = inferStorageLocCode(
    sheet.storageLocation,
    fallbackStorageCode
  );
  const cleanLoc = draft.storageLocCode.trim();
  if (cleanLoc && cleanLoc !== inferredLoc) {
    overridePatch.storageLocCode = cleanLoc;
  }

  return {
    updatedSheet,
    rowKey,
    overridePatch:
      Object.keys(overridePatch).length > 0 ? overridePatch : undefined,
  };
}
