import {
  COMPARTEMENTS,
  MATERIAL_CODES,
  TYPE_OF_OUT_OPTIONS,
  UNIT_CODES,
  type UnitMaster,
  WAREHOUSE_LOCATIONS,
} from '../data/masterData';
import type {
  LogSheet,
  OutputFormatRow,
  OutputMediumKind,
  OutputOverrideMap,
} from '../types/logSheet';
import { isConsumptionRowFilled, parseLocaleNumber } from './logSheet';

const UNIT_BY_CODE = new Map<string, UnitMaster>();
const UNIT_BY_ALIAS = new Map<string, UnitMaster>();
const UNIT_BY_COMPACT_CODE = new Map<string, UnitMaster>();
const UNIT_BY_COMPACT_ALIAS = new Map<string, UnitMaster>();

for (const u of UNIT_CODES) {
  const codeKey = u.unitCode.trim().toUpperCase();
  const aliasKey = u.codeAlias.trim().toUpperCase();
  if (!UNIT_BY_CODE.has(codeKey)) {
    UNIT_BY_CODE.set(codeKey, u);
  }
  if (!UNIT_BY_ALIAS.has(aliasKey)) {
    UNIT_BY_ALIAS.set(aliasKey, u);
  }
  const compactCode = codeKey.replace(/[\s-]+/g, '');
  const compactAlias = aliasKey.replace(/[\s-]+/g, '');
  if (!UNIT_BY_COMPACT_CODE.has(compactCode)) {
    UNIT_BY_COMPACT_CODE.set(compactCode, u);
  }
  if (!UNIT_BY_COMPACT_ALIAS.has(compactAlias)) {
    UNIT_BY_COMPACT_ALIAS.set(compactAlias, u);
  }
}

export function resolveUnitIdentity(rawNoUnit: string): {
  unitCode: string;
  codeAlias: string;
} {
  const trimmed = rawNoUnit.trim();
  if (!trimmed) {
    return { unitCode: '', codeAlias: '' };
  }

  const upper = trimmed.toUpperCase();
  const byCode = UNIT_BY_CODE.get(upper);
  if (byCode) {
    return { unitCode: byCode.unitCode, codeAlias: byCode.codeAlias };
  }

  const byAlias = UNIT_BY_ALIAS.get(upper);
  if (byAlias) {
    return { unitCode: byAlias.unitCode, codeAlias: byAlias.codeAlias };
  }

  const compact = upper.replace(/[\s-]+/g, '');
  const byCompactCode = UNIT_BY_COMPACT_CODE.get(compact);
  if (byCompactCode) {
    return {
      unitCode: byCompactCode.unitCode,
      codeAlias: byCompactCode.codeAlias,
    };
  }

  const byCompactAlias = UNIT_BY_COMPACT_ALIAS.get(compact);
  if (byCompactAlias) {
    return {
      unitCode: byCompactAlias.unitCode,
      codeAlias: byCompactAlias.codeAlias,
    };
  }

  return { unitCode: trimmed, codeAlias: trimmed };
}

export function formatDateYYYYMMDD(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (!trimmed) return '';

  // ISO: YYYY-MM-DD
  const isoMatch = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
  }

  // Already YYYYMMDD
  if (/^\d{8}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    return `${dmyMatch[3]}${mm}${dd}`;
  }

  return trimmed;
}

export function normalizeTimeHHMM(rawTime: string): string {
  const trimmed = rawTime.trim().replace('.', ':');
  if (!trimmed) return '';

  const match = /^(\d{1,2}):(\d{1,2})/.exec(trimmed);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
  }

  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}:${trimmed.slice(2, 4)}`;
  }

  return trimmed;
}

export function inferStorageLocCode(
  storageLocation: string,
  fallbackCode = ''
): string {
  const upper = storageLocation.trim().toUpperCase();
  if (!upper) return fallbackCode;

  // Direct code match anywhere in string (e.g., "LST21 - LS WORKSHOP...")
  for (const loc of WAREHOUSE_LOCATIONS) {
    if (upper.includes(loc.code)) {
      return loc.code;
    }
  }

  // Exact or keyword match against warehouse name
  if (upper.includes('WHS') || upper.includes('OIL & GREASE')) {
    if (upper.includes('SENYIUR')) return 'WOG18';
    if (upper.includes('MUARA PAHU')) return 'WOG13';
  }
  if (upper.includes('MUARA PAHU')) return 'LST21';
  if (upper.includes('SENYIUR')) return 'LST13';
  if (upper.includes('TAPAK')) return 'LST22';

  return fallbackCode;
}

export function inferTypeOfOutCode(rawStatus: string): string {
  const upper = rawStatus.trim().toUpperCase();
  if (!upper) return '';

  // Direct numeric code 1..8
  if (/^[1-8]$/.test(upper)) return upper;

  // Map log sheet status abbreviations (PM, ADD, BD) to Type Of Out code
  if (upper === 'PM' || upper.includes('PLANNED') || upper.includes('PREVENTIVE')) {
    return '1';
  }
  if (upper === 'BD' || upper.includes('BREAKDOWN')) {
    return '2';
  }
  if (upper === 'ADD' || upper.includes('ADDITIONAL') || upper.includes('TOP UP')) {
    return '3';
  }
  if (upper.includes('INCIDENT')) return '4';
  if (upper.includes('LEAKING') || upper.includes('BOCOR')) return '5';
  if (upper.includes('FLUSHING')) return '6';
  if (upper.includes('RECONDITION')) return '7';
  if (upper.includes('NON PM')) return '8';

  for (const item of TYPE_OF_OUT_OPTIONS) {
    if (upper === item.typeOfOut) return item.code;
  }

  return '';
}

export function inferComponentCode(
  oilDescription: string,
  mediumKind: OutputMediumKind
): string {
  if (mediumKind === 'grease') return 'AU001';
  if (mediumKind === 'coolant') return 'CO001';

  const upper = oilDescription.trim().toUpperCase();
  if (!upper) return '';

  // Direct component code match
  for (const comp of COMPARTEMENTS) {
    if (upper === comp.code || upper.startsWith(`${comp.code} `)) {
      return comp.code;
    }
  }

  if (
    upper.includes('COOLANT') ||
    upper.includes('RADIATOR') ||
    upper.includes('VCS') ||
    upper.includes('AF-NAC') ||
    upper.includes('FRIZGUARD')
  ) {
    return 'CO001';
  }
  if (
    upper.includes('GREASE') ||
    upper.includes('AUTOLUBE') ||
    upper.includes('NLGI') ||
    upper.includes('XHP') ||
    upper.includes('EP2') ||
    upper.includes('EP 2') ||
    upper.includes('EPX') ||
    upper.includes('LCEP') ||
    upper.includes('LICX')
  ) {
    return 'AU001';
  }
  if (upper.includes('WET BRAKE')) return 'BR002';
  if (upper.includes('BRAKE') || upper.includes('MINYAK REM')) return 'BR001';
  if (upper.includes('STEERING')) return 'ST001';
  if (upper.includes('FINAL DRIVE')) return 'FI001';
  if (
    upper.includes('DIFFERENTIAL') ||
    upper.includes('80W-90') ||
    upper.includes('80W90') ||
    upper.includes('80W-140') ||
    upper.includes('80W140') ||
    upper.includes('85W-140') ||
    upper.includes('85W140')
  ) {
    return 'DI001';
  }
  if (
    upper.includes('TRANSMISSION') ||
    upper.includes('TRANSMISI') ||
    upper.includes('GEARBOX') ||
    upper.includes('ATF') ||
    upper.includes('HD 30') ||
    upper.includes('HD30') ||
    upper.includes('HD 50') ||
    upper.includes('HD50') ||
    upper.includes('SAE 30') ||
    upper.includes('SAE30') ||
    upper.includes('SAE 50') ||
    upper.includes('SAE50') ||
    upper.includes('UNITRANS') ||
    upper.includes('MOBILTRANS') ||
    upper.includes('TRANSLIK')
  ) {
    return 'TR001';
  }
  if (
    upper.includes('HYDRAULIC') ||
    upper.includes('HYD') ||
    upper.includes('TURALIK') ||
    upper.includes('NUTO') ||
    upper.includes('LORENT') ||
    upper.includes('SAE 10') ||
    upper.includes('SAE10') ||
    upper.includes('10W')
  ) {
    return 'HY001';
  }
  if (
    upper.includes('ENGINE') ||
    upper.includes('15W-40') ||
    upper.includes('15W40') ||
    upper.includes('5W40') ||
    upper.includes('5W-40') ||
    upper.includes('DELVAC') ||
    upper.includes('MEDITRAN') ||
    upper.includes('CTX DIESEL')
  ) {
    return 'EN001';
  }

  return '';
}

export function inferMaterialCode(
  oilDescription: string,
  mediumKind: OutputMediumKind
): string {
  const raw = oilDescription.trim();
  const upper = raw.toUpperCase();

  if (mediumKind === 'grease') {
    if (
      upper.includes('GREASE') ||
      upper.includes('NLGI') ||
      upper.includes('EP2') ||
      upper.includes('EP 2') ||
      upper.includes('EPX') ||
      upper.includes('LCEP') ||
      upper.includes('XHP') ||
      upper.includes('LICX') ||
      upper.includes('ROCOL') ||
      upper.includes('DRS200')
    ) {
      // Fall through to match specific grease if description itself is a grease
    } else {
      return 'LO2MOB-EP2';
    }
  }

  if (mediumKind === 'coolant') {
    if (
      upper.includes('COOLANT') ||
      upper.includes('VCS') ||
      upper.includes('AF-NAC') ||
      upper.includes('FRIZGUARD') ||
      upper.includes('FR-DELTA') ||
      upper.includes('PARCOOL') ||
      upper.includes('5050') ||
      upper.includes('RADIATOR')
    ) {
      // Fall through if description itself names coolant
    } else {
      return 'COOLANTHD50';
    }
  }

  if (!upper) return '';

  // 1. Exact material code match (or prefix "CODE - Name")
  for (const m of MATERIAL_CODES) {
    if (
      upper === m.materialCode.toUpperCase() ||
      upper.startsWith(`${m.materialCode.toUpperCase()} `) ||
      upper.startsWith(`${m.materialCode.toUpperCase()}-`)
    ) {
      return m.materialCode;
    }
  }

  // 2. Exact oil name match
  for (const m of MATERIAL_CODES) {
    if (upper === m.oilName.toUpperCase()) {
      return m.materialCode;
    }
  }

  // 3. Common shorthand mappings from field log descriptions
  if (mediumKind === 'grease') {
    if (upper.includes('XHP 462') || upper.includes('462')) return 'LO2MOB-XHP462MOLYDR';
    if (upper.includes('XHP 222') || upper.includes('222')) return 'LO2MOB-XHP222DR';
    if (upper.includes('EPX')) return 'LO2PTM-EPXNL2DR';
    return 'LO2MOB-EP2';
  }

  if (mediumKind === 'coolant') {
    if (upper.includes('VOLVO') || upper.includes('VCS')) return 'VCSCOOLANT210DR';
    if (upper.includes('SCANIA')) return 'COOLANT5050';
    if (upper.includes('KOMATSU') || upper.includes('AF-NAC')) return 'AFNACCOOLANT';
    return 'COOLANTHD50';
  }

  // 4. Token-overlap scoring across Material Master oil names (prioritizing LO1/LO2/consumables)
  const tokens = upper
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 2 && t !== 'OIL' && t !== 'OLI');

  if (tokens.length > 0) {
    let bestCode = '';
    let bestScore = 0;

    for (const m of MATERIAL_CODES) {
      const target = `${m.materialCode} ${m.oilName}`.toUpperCase();
      // Skip obvious mechanical seal/plug/gasket parts when matching fluid descriptions
      if (
        target.includes('SEAL OIL') ||
        target.includes('OIL SEAL') ||
        target.includes('GASKET') ||
        target.includes('DIPSTICK')
      ) {
        continue;
      }

      let score = 0;
      for (const tok of tokens) {
        if (target.includes(tok)) {
          score += tok.length >= 4 ? 3 : 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestCode = m.materialCode;
      }
    }

    if (bestScore >= 4) {
      return bestCode;
    }
  }

  // 5. Generic viscosity fallbacks
  if (upper.includes('15W-40') || upper.includes('15W40')) {
    return 'LO1PTM-SX15W-40';
  }
  if (upper.includes('10W') || upper.includes('HYDRAULIC')) {
    return 'LO1PTM-SAE10';
  }
  if (upper.includes('SAE 30') || upper.includes('TRANSMISSION')) {
    return 'LO1PTM-SAE30W';
  }
  if (upper.includes('85W-140') || upper.includes('85W140')) {
    return 'LO1PTM-SAE85W140';
  }
  if (upper.includes('80W-90') || upper.includes('80W90')) {
    return 'LO1PTM-SAE80W-90HD';
  }
  if (upper.includes('ATF')) {
    return 'LO1MOB-TRSMS-ATF';
  }

  return '';
}

export interface MapOutputOptions {
  overrides: OutputOverrideMap;
  fallbackStorageCode?: string;
  splitGreaseAndCoolant?: boolean;
}

export function mapSheetsToOutputRows(
  sheets: LogSheet[],
  options: MapOutputOptions
): OutputFormatRow[] {
  const {
    overrides,
    fallbackStorageCode = '',
    splitGreaseAndCoolant = true,
  } = options;

  const result: OutputFormatRow[] = [];

  for (const sheet of sheets) {
    const dateYYYYMMDD = formatDateYYYYMMDD(sheet.date);
    const inferredLoc = inferStorageLocCode(
      sheet.storageLocation,
      fallbackStorageCode
    );

    for (const row of sheet.rows) {
      if (!isConsumptionRowFilled(row)) continue;

      const resolvedUnit = resolveUnitIdentity(row.noUnit);
      const timeHHMM = normalizeTimeHHMM(row.waktu);
      const hmKm = row.hm.trim();
      const inferredType = inferTypeOfOutCode(row.keteranganStatus);

      const oilQtyNum = parseLocaleNumber(row.flowmeterLiter);
      const greaseQtyNum = parseLocaleNumber(row.greasingKg);
      const coolantQtyNum = parseLocaleNumber(row.collantLiter);

      const hasFlowmeterQty = oilQtyNum !== null && oilQtyNum > 0;
      const hasGreaseQty = greaseQtyNum !== null && greaseQtyNum > 0;
      const hasCoolantQty = coolantQtyNum !== null && coolantQtyNum > 0;
      const hasAnyDescription = row.oilLubeDescription.trim() !== '';

      const buildOutputRow = (
        mediumKind: OutputMediumKind,
        defaultQty: string
      ): OutputFormatRow => {
        const rowKey = `${sheet.id}:${row.rowNumber}:${mediumKind}`;
        const ov = overrides[rowKey] ?? {};

        const defaultDesc =
          mediumKind === 'grease'
            ? 'Grease EP-2'
            : mediumKind === 'coolant'
              ? 'Coolant Radiator'
              : row.oilLubeDescription;

        const descComp = inferComponentCode(row.oilLubeDescription, 'oil');
        const materialSourceDesc =
          mediumKind === 'oil'
            ? row.oilLubeDescription
            : mediumKind === 'grease'
              ? !hasFlowmeterQty || descComp === 'AU001'
                ? row.oilLubeDescription || defaultDesc
                : defaultDesc
              : !hasFlowmeterQty || descComp === 'CO001'
                ? row.oilLubeDescription || defaultDesc
                : defaultDesc;

        return {
          rowKey,
          sourceSheetId: sheet.id,
          sourceRowNumber: row.rowNumber,
          mediumKind,
          unitCode: ov.unitCode ?? resolvedUnit.unitCode,
          codeAlias: ov.codeAlias ?? resolvedUnit.codeAlias,
          dateYYYYMMDD,
          timeHHMM,
          componentCode:
            ov.componentCode ??
            inferComponentCode(row.oilLubeDescription, mediumKind),
          typeOfOutCode: ov.typeOfOutCode ?? inferredType,
          storageLocCode: ov.storageLocCode ?? inferredLoc,
          hmKm,
          materialCode:
            ov.materialCode ??
            inferMaterialCode(materialSourceDesc, mediumKind),
          qtyLiter: ov.qtyLiter ?? defaultQty,
          rawOilDescription: row.oilLubeDescription,
          rawStatus: row.keteranganStatus,
          rawStorageLocation: sheet.storageLocation,
        };
      };

      if (splitGreaseAndCoolant) {
        if (
          hasFlowmeterQty ||
          (!hasGreaseQty && !hasCoolantQty && hasAnyDescription)
        ) {
          result.push(buildOutputRow('oil', row.flowmeterLiter.trim()));
        }
        if (hasGreaseQty) {
          result.push(buildOutputRow('grease', row.greasingKg.trim()));
        }
        if (hasCoolantQty) {
          result.push(buildOutputRow('coolant', row.collantLiter.trim()));
        }
      } else {
        if (hasFlowmeterQty) {
          result.push(buildOutputRow('oil', row.flowmeterLiter.trim()));
        } else if (hasGreaseQty) {
          result.push(buildOutputRow('grease', row.greasingKg.trim()));
        } else if (hasCoolantQty) {
          result.push(buildOutputRow('coolant', row.collantLiter.trim()));
        } else if (hasAnyDescription) {
          result.push(buildOutputRow('oil', ''));
        }
      }
    }
  }

  return result;
}

export const OUTPUT_HEADERS = [
  'Unit Code*',
  'Code Alias',
  'Date YYYYMMDD*',
  'Time HH:MM*',
  'Compnent*',
  'Type Of Out',
  'Code Storage Loc.',
  'Hm/Km*',
  'Material Code*',
  'Qty* (Liter)',
] as const;

export function outputRowsToTsv(
  rows: OutputFormatRow[],
  includeHeader = true
): string {
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(OUTPUT_HEADERS.join('\t'));
  }
  for (const r of rows) {
    lines.push(
      [
        r.unitCode,
        r.codeAlias,
        r.dateYYYYMMDD,
        r.timeHHMM,
        r.componentCode,
        r.typeOfOutCode,
        r.storageLocCode,
        r.hmKm,
        r.materialCode,
        r.qtyLiter,
      ]
        .map((v) => (v ?? '').replace(/[\t\r\n]+/g, ' '))
        .join('\t')
    );
  }
  return lines.join('\n');
}

function escapeCsv(val: string): string {
  const s = val ?? '';
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function outputRowsToCsv(rows: OutputFormatRow[]): string {
  const lines: string[] = [OUTPUT_HEADERS.map((h) => escapeCsv(h)).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.unitCode,
        r.codeAlias,
        r.dateYYYYMMDD,
        r.timeHHMM,
        r.componentCode,
        r.typeOfOutCode,
        r.storageLocCode,
        r.hmKm,
        r.materialCode,
        r.qtyLiter,
      ]
        .map((v) => escapeCsv(v))
        .join(',')
    );
  }
  return lines.join('\n');
}
