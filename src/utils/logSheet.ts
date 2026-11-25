import { WAREHOUSE_LOCATIONS } from '../data/masterData';
import type {
  ConsumptionRow,
  LogSheet,
  RowAnomaly,
  SheetTotals,
  StockInRow,
} from '../types/logSheet';

export const STOCK_IN_ROW_COUNT = 5;
export const CONSUMPTION_ROW_COUNT = 20;

export const COMMON_OIL_DESCRIPTIONS = [
  'SAE 15W-40 Engine Oil',
  'SAE 10W Hydraulic Oil',
  'SAE 30 Transmission Oil',
  'SAE 50 Final Drive Oil',
  'SAE 85W-140 Gear Oil',
  'ATF Dexron III',
  'Grease EP-2 Lithium',
  'Coolant Long Life 50/50',
];

export const COMMON_SHIFTS = ['Shift 1', 'Shift 2', 'Day Shift', 'Night Shift'];

export const COMMON_LOCATIONS = WAREHOUSE_LOCATIONS.map(
  (loc) => `${loc.code} - ${loc.warehouseName}`
);

export const DEFAULT_STORAGE_LOCATION =
  COMMON_LOCATIONS[0] ?? 'LST21 - LS WORKSHOP MUARA PAHU TBG-IPH';

export function createEmptyStockInRows(): StockInRow[] {
  return Array.from({ length: STOCK_IN_ROW_COUNT }, (_, idx) => ({
    rowNumber: idx + 1,
    waktu: '',
    description: '',
    quantity: '',
  }));
}

export function createEmptyConsumptionRows(): ConsumptionRow[] {
  return Array.from({ length: CONSUMPTION_ROW_COUNT }, (_, idx) => ({
    rowNumber: idx + 1,
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
  }));
}

export function generateSheetId(): string {
  return `sheet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentTimeHHmm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDisplayDate(isoOrText: string): string {
  if (!isoOrText) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoOrText.trim());
  if (!match) return isoOrText;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function parseLocaleNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function formatNumericValue(num: number): string {
  if (!Number.isFinite(num)) return '';
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export interface FlowmeterCalcResult {
  liter: string;
  isAnomaly: boolean;
}

export function calculateFlowmeterLiters(
  awalRaw: string,
  akhirRaw: string
): FlowmeterCalcResult {
  const awal = parseLocaleNumber(awalRaw);
  const akhir = parseLocaleNumber(akhirRaw);

  if (awal === null || akhir === null) {
    return { liter: '', isAnomaly: false };
  }

  const diff = akhir - awal;
  if (diff < 0) {
    return { liter: formatNumericValue(diff), isAnomaly: true };
  }

  return { liter: formatNumericValue(diff), isAnomaly: false };
}

export function createBlankSheet(overrides?: Partial<LogSheet>): LogSheet {
  const nowIso = new Date().toISOString();
  return {
    id: generateSheetId(),
    date: getTodayIsoDate(),
    workingShift: 'Shift 1',
    storageLocation: DEFAULT_STORAGE_LOCATION,
    stockIn: createEmptyStockInRows(),
    rows: createEmptyConsumptionRows(),
    signatures: {
      driverMechanic: '',
      glSpvPlant: '',
      glSpvScm: '',
      deptHeadPlant: '',
    },
    autoCalcFlowmeter: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

export function createSampleSheet(): LogSheet {
  const stockIn = createEmptyStockInRows();
  stockIn[0] = {
    rowNumber: 1,
    waktu: '07:15',
    description: 'LO1PAN-SAE15W-40DR',
    quantity: '209',
  };
  stockIn[1] = {
    rowNumber: 2,
    waktu: '07:20',
    description: 'LO1PAN-HYD10WDR',
    quantity: '209',
  };

  const rows = createEmptyConsumptionRows();
  rows[0] = {
    rowNumber: 1,
    waktu: '08:10',
    noUnit: 'DT-204',
    modelUnit: 'Hino FM 260 JD',
    hm: '6420',
    oilLubeDescription: 'LO1PAN-SAE15W-40DR',
    flowmeterAwal: '12450',
    flowmeterAkhir: '12478',
    flowmeterLiter: '28',
    flowmeterManualOverride: false,
    greasingMenit: '12',
    greasingKg: '1.5',
    collantMenit: '5',
    collantLiter: '4',
    keteranganStatus: 'PM',
  };
  rows[1] = {
    rowNumber: 2,
    waktu: '09:05',
    noUnit: 'EX-112',
    modelUnit: 'Komatsu PC200-8',
    hm: '8155',
    oilLubeDescription: 'LO1PAN-HYD10WDR',
    flowmeterAwal: '12478',
    flowmeterAkhir: '12513',
    flowmeterLiter: '35',
    flowmeterManualOverride: false,
    greasingMenit: '18',
    greasingKg: '2.5',
    collantMenit: '',
    collantLiter: '',
    keteranganStatus: 'ADD',
  };
  rows[2] = {
    rowNumber: 3,
    waktu: '10:30',
    noUnit: 'DZ-05',
    modelUnit: 'Cat D85ESS',
    hm: '10230',
    oilLubeDescription: 'LO1PTM-SAE30W',
    flowmeterAwal: '12513',
    flowmeterAkhir: '12531',
    flowmeterLiter: '18',
    flowmeterManualOverride: false,
    greasingMenit: '10',
    greasingKg: '1.2',
    collantMenit: '6',
    collantLiter: '6',
    keteranganStatus: 'BD',
  };
  rows[3] = {
    rowNumber: 4,
    waktu: '13:45',
    noUnit: 'DT-209',
    modelUnit: 'Volvo FMX 400',
    hm: '5190',
    oilLubeDescription: 'LO1PAN-SAE15W-40DR',
    flowmeterAwal: '12531',
    flowmeterAkhir: '12563',
    flowmeterLiter: '32',
    flowmeterManualOverride: false,
    greasingMenit: '15',
    greasingKg: '2',
    collantMenit: '',
    collantLiter: '',
    keteranganStatus: 'PM',
  };

  const nowIso = new Date().toISOString();
  return {
    id: generateSheetId(),
    date: getTodayIsoDate(),
    workingShift: 'Shift 1',
    storageLocation: DEFAULT_STORAGE_LOCATION,
    stockIn,
    rows,
    signatures: {
      driverMechanic: 'Budi Santoso',
      glSpvPlant: 'Hendra Wijaya',
      glSpvScm: 'Rizky Pratama',
      deptHeadPlant: 'Agus Salim',
    },
    autoCalcFlowmeter: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function isConsumptionRowFilled(row: ConsumptionRow): boolean {
  return Boolean(
    row.waktu.trim() ||
      row.noUnit.trim() ||
      row.modelUnit.trim() ||
      row.hm.trim() ||
      row.oilLubeDescription.trim() ||
      row.flowmeterAkhir.trim() ||
      row.flowmeterLiter.trim() ||
      row.greasingMenit.trim() ||
      row.greasingKg.trim() ||
      row.collantMenit.trim() ||
      row.collantLiter.trim() ||
      row.keteranganStatus.trim()
  );
}

export function isStockInRowFilled(row: StockInRow): boolean {
  return Boolean(
    row.waktu.trim() || row.description.trim() || row.quantity.trim()
  );
}

export function detectSheetAnomalies(sheet: LogSheet): RowAnomaly[] {
  const anomalies: RowAnomaly[] = [];
  for (const row of sheet.rows) {
    const awal = parseLocaleNumber(row.flowmeterAwal);
    const akhir = parseLocaleNumber(row.flowmeterAkhir);
    if (awal !== null && akhir !== null && akhir < awal) {
      anomalies.push({
        rowNumber: row.rowNumber,
        message: `Baris ${row.rowNumber}: Flowmeter Akhir (${row.flowmeterAkhir}) lebih kecil dari Awal (${row.flowmeterAwal})`,
      });
    }
  }
  return anomalies;
}

export function normalizeStatusCode(raw: string): 'PM' | 'ADD' | 'BD' | 'OTHER' | '' {
  const upper = raw.trim().toUpperCase();
  if (!upper) return '';
  if (upper === 'PM' || upper.startsWith('PM ')) return 'PM';
  if (upper === 'ADD' || upper.startsWith('ADD ')) return 'ADD';
  if (upper === 'BD' || upper.startsWith('BD ')) return 'BD';
  return 'OTHER';
}

export function computeSheetTotals(sheet: LogSheet): SheetTotals {
  let filledStockInRows = 0;
  let totalStockInQty = 0;

  for (const row of sheet.stockIn) {
    if (isStockInRowFilled(row)) filledStockInRows++;
    const qty = parseLocaleNumber(row.quantity);
    if (qty !== null && qty > 0) totalStockInQty += qty;
  }

  let filledConsumptionRows = 0;
  let totalFlowmeterLiters = 0;
  let totalGreasingMinutes = 0;
  let totalGreasingKg = 0;
  let totalCollantMinutes = 0;
  let totalCollantLiters = 0;
  const statusCounts = { PM: 0, ADD: 0, BD: 0, OTHER: 0 };

  for (const row of sheet.rows) {
    if (isConsumptionRowFilled(row)) filledConsumptionRows++;

    const fmLiters = parseLocaleNumber(row.flowmeterLiter);
    if (fmLiters !== null && fmLiters > 0) totalFlowmeterLiters += fmLiters;

    const gMin = parseLocaleNumber(row.greasingMenit);
    if (gMin !== null && gMin > 0) totalGreasingMinutes += gMin;

    const gKg = parseLocaleNumber(row.greasingKg);
    if (gKg !== null && gKg > 0) totalGreasingKg += gKg;

    const cMin = parseLocaleNumber(row.collantMenit);
    if (cMin !== null && cMin > 0) totalCollantMinutes += cMin;

    const cLit = parseLocaleNumber(row.collantLiter);
    if (cLit !== null && cLit > 0) totalCollantLiters += cLit;

    const status = normalizeStatusCode(row.keteranganStatus);
    if (status) {
      statusCounts[status]++;
    }
  }

  const anomaliesCount = detectSheetAnomalies(sheet).length;

  return {
    filledConsumptionRows,
    filledStockInRows,
    totalStockInQty: Math.round(totalStockInQty * 100) / 100,
    totalFlowmeterLiters: Math.round(totalFlowmeterLiters * 100) / 100,
    totalGreasingMinutes: Math.round(totalGreasingMinutes * 100) / 100,
    totalGreasingKg: Math.round(totalGreasingKg * 100) / 100,
    totalCollantMinutes: Math.round(totalCollantMinutes * 100) / 100,
    totalCollantLiters: Math.round(totalCollantLiters * 100) / 100,
    statusCounts,
    anomaliesCount,
  };
}

export function getLastFlowmeterAkhir(sheet: LogSheet): string {
  for (let i = sheet.rows.length - 1; i >= 0; i--) {
    const val = sheet.rows[i].flowmeterAkhir.trim();
    if (val) return val;
  }
  return '';
}

export function createNextShiftSheet(previousSheet: LogSheet): LogSheet {
  const nextShift =
    previousSheet.workingShift === 'Shift 1'
      ? 'Shift 2'
      : previousSheet.workingShift === 'Day Shift'
        ? 'Night Shift'
        : 'Shift 1';

  const lastAkhir = getLastFlowmeterAkhir(previousSheet);
  const rows = createEmptyConsumptionRows();
  if (lastAkhir) {
    rows[0].flowmeterAwal = lastAkhir;
  }

  return createBlankSheet({
    date: getTodayIsoDate(),
    workingShift: nextShift,
    storageLocation: previousSheet.storageLocation,
    rows,
    autoCalcFlowmeter: previousSheet.autoCalcFlowmeter,
  });
}

export function filterSheets(
  sheets: LogSheet[],
  query: string,
  shiftFilter: string
): LogSheet[] {
  const q = query.trim().toLowerCase();
  return sheets.filter((sheet) => {
    if (shiftFilter !== 'ALL' && sheet.workingShift !== shiftFilter) {
      return false;
    }
    if (!q) return true;

    const headerMatch =
      sheet.date.toLowerCase().includes(q) ||
      formatDisplayDate(sheet.date).toLowerCase().includes(q) ||
      sheet.workingShift.toLowerCase().includes(q) ||
      sheet.storageLocation.toLowerCase().includes(q) ||
      sheet.signatures.driverMechanic.toLowerCase().includes(q);

    if (headerMatch) return true;

    const stockMatch = sheet.stockIn.some(
      (s) =>
        s.description.toLowerCase().includes(q) ||
        s.quantity.toLowerCase().includes(q)
    );
    if (stockMatch) return true;

    return sheet.rows.some(
      (r) =>
        r.noUnit.toLowerCase().includes(q) ||
        r.modelUnit.toLowerCase().includes(q) ||
        r.oilLubeDescription.toLowerCase().includes(q) ||
        r.keteranganStatus.toLowerCase().includes(q)
    );
  });
}

function escapeCsvCell(value: string): string {
  const s = value ?? '';
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function sheetToCsv(sheet: LogSheet): string {
  const lines: string[] = [];
  lines.push(`OIL & LUBRICANT'S CONSUMPTION LOG SHEET`);
  lines.push(`DATE / TANGGAL,${escapeCsvCell(formatDisplayDate(sheet.date))}`);
  lines.push(`WORKING SHIFT,${escapeCsvCell(sheet.workingShift)}`);
  lines.push(`STORAGE LOCATION,${escapeCsvCell(sheet.storageLocation)}`);
  lines.push('');
  lines.push('STOCK IN');
  lines.push('No.,Waktu,OIL & LUBE DESCRIPTION,Quantity');
  for (const s of sheet.stockIn) {
    lines.push(
      [s.rowNumber, s.waktu, s.description, s.quantity]
        .map((v) => escapeCsvCell(String(v)))
        .join(',')
    );
  }
  lines.push('');
  lines.push(
    'No.,Waktu,No. Unit,Model Unit,HM,OIL & LUBE DESCRIPTION,FLOWMETER AWAL,FLOWMETER AKHIR,FLOWMETER LITER,GREASING MENIT,GREASING KG,COLLANT MENIT,COLLANT LITER,KETERANGAN STATUS'
  );
  for (const r of sheet.rows) {
    lines.push(
      [
        r.rowNumber,
        r.waktu,
        r.noUnit,
        r.modelUnit,
        r.hm,
        r.oilLubeDescription,
        r.flowmeterAwal,
        r.flowmeterAkhir,
        r.flowmeterLiter,
        r.greasingMenit,
        r.greasingKg,
        r.collantMenit,
        r.collantLiter,
        r.keteranganStatus,
      ]
        .map((v) => escapeCsvCell(String(v)))
        .join(',')
    );
  }
  lines.push('');
  lines.push(
    `Created By (Driver / Mechanic),${escapeCsvCell(sheet.signatures.driverMechanic)}`
  );
  lines.push(
    `Reconcile By (GL / SPV Plant),${escapeCsvCell(sheet.signatures.glSpvPlant)}`
  );
  lines.push(
    `Reconcile By (GL / SPV SCM),${escapeCsvCell(sheet.signatures.glSpvScm)}`
  );
  lines.push(
    `Approved By (DEPARTEMENT HEAD PLANT),${escapeCsvCell(sheet.signatures.deptHeadPlant)}`
  );
  return lines.join('\n');
}
