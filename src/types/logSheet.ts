export type UnitStatusCode = '' | 'PM' | 'ADD' | 'BD';

export interface StockInRow {
  rowNumber: number; // 1..5
  waktu: string;
  description: string;
  quantity: string;
}

export interface ConsumptionRow {
  rowNumber: number; // 1..20
  waktu: string;
  noUnit: string;
  modelUnit: string;
  hm: string;
  oilLubeDescription: string;
  flowmeterAwal: string;
  flowmeterAkhir: string;
  flowmeterLiter: string;
  flowmeterManualOverride?: boolean;
  greasingMenit: string;
  greasingKg: string;
  collantMenit: string;
  collantLiter: string;
  keteranganStatus: string;
}

export interface SheetSignatures {
  driverMechanic: string;
  glSpvPlant: string;
  glSpvScm: string;
  deptHeadPlant: string;
}

export interface LogSheet {
  id: string;
  date: string; // e.g., "2026-11-23" or formatted text
  workingShift: string; // e.g., "Shift 1"
  storageLocation: string; // e.g., "LST21 - LS WORKSHOP MUARA PAHU TBG-IPH"
  stockIn: StockInRow[]; // Always 5 rows
  rows: ConsumptionRow[]; // Always 20 rows
  signatures: SheetSignatures;
  autoCalcFlowmeter: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface SheetTotals {
  filledConsumptionRows: number;
  filledStockInRows: number;
  totalStockInQty: number;
  totalFlowmeterLiters: number;
  totalGreasingMinutes: number;
  totalGreasingKg: number;
  totalCollantMinutes: number;
  totalCollantLiters: number;
  statusCounts: {
    PM: number;
    ADD: number;
    BD: number;
    OTHER: number;
  };
  anomaliesCount: number;
}

export interface RowAnomaly {
  rowNumber: number;
  message: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'sheet'
  | 'output'
  | 'spreadsheet'
  | 'history'
  | 'summary';

export interface SpreadsheetIncludeOptions {
  includeOutput: boolean;
  includeLogSheet: boolean;
  includeStockIn: boolean;
  includeMasterTabs: boolean;
  splitGreaseAndCoolant: boolean;
}

export interface LinkedGoogleSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  updatedAt: string;
}

export interface PrimarySpreadsheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  defaultMode: 'append' | 'overwrite';
  includeOutput: boolean;
  includeLogSheet: boolean;
  includeStockIn: boolean;
  includeMasterTabs: boolean;
  lastSyncedAt?: string;
}

export type OutputMediumKind = 'oil' | 'grease' | 'coolant';

export interface OutputRowOverride {
  unitCode?: string;
  codeAlias?: string;
  componentCode?: string;
  typeOfOutCode?: string;
  storageLocCode?: string;
  materialCode?: string;
  qtyLiter?: string;
}

export type OutputOverrideMap = Record<string, OutputRowOverride>;

export interface OutputFormatRow {
  rowKey: string;
  sourceSheetId: string;
  sourceRowNumber: number;
  mediumKind: OutputMediumKind;
  unitCode: string;
  codeAlias: string;
  dateYYYYMMDD: string;
  timeHHMM: string;
  componentCode: string;
  typeOfOutCode: string;
  storageLocCode: string;
  hmKm: string;
  materialCode: string;
  qtyLiter: string;
  rawOilDescription: string;
  rawStatus: string;
  rawStorageLocation: string;
}
