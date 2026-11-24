import type { LogSheet } from '../types/logSheet';
import {
  computeSheetTotals,
  detectSheetAnomalies,
  formatDisplayDate,
  isConsumptionRowFilled,
  normalizeStatusCode,
  parseLocaleNumber,
} from './logSheet';
import { inferMaterialCode, resolveUnitIdentity } from './outputMapper';

export interface DashboardFilter {
  shift: string; // 'ALL' | shift name
  location: string; // 'ALL' | location string
}

export interface TimelinePoint {
  sheetId: string;
  label: string;
  subLabel: string;
  sortKey: string;
  stockInQty: number;
  flowmeterLiters: number;
  collantLiters: number;
  greasingKg: number;
  entries: number;
}

export interface HourlyBucket {
  hourLabel: string; // e.g., "08:00"
  hourNum: number;
  entries: number;
  flowmeterLiters: number;
  greasingKg: number;
}

export interface StatusBreakdownItem {
  code: 'PM' | 'ADD' | 'BD' | 'OTHER';
  label: string;
  count: number;
  liters: number;
  sharePercent: number;
}

export interface TopOilMetric {
  oilName: string;
  materialCode: string;
  liters: number;
  entries: number;
  sharePercent: number;
}

export interface TopUnitMetric {
  unitCode: string;
  codeAlias: string;
  modelUnit: string;
  lastHm: string;
  oilLiters: number;
  greaseKg: number;
  coolantLiters: number;
  entries: number;
}

export interface DashboardAnomalyItem {
  sheetId: string;
  sheetLabel: string;
  rowNumber: number;
  message: string;
}

export interface DashboardSheetRow {
  sheetId: string;
  displayDate: string;
  shift: string;
  location: string;
  filledRows: number;
  stockInQty: number;
  flowmeterLiters: number;
  greasingKg: number;
  collantLiters: number;
  anomaliesCount: number;
}

export interface DashboardMetrics {
  sheetCount: number;
  totalEntries: number;
  uniqueUnitsCount: number;
  totalStockInQty: number;
  totalFlowmeterLiters: number;
  totalGreasingKg: number;
  totalGreasingMinutes: number;
  totalCollantLiters: number;
  totalCollantMinutes: number;
  netStockBalance: number;
  avgLitersPerEntry: number;
  pmSharePercent: number;
  availableShifts: string[];
  availableLocations: string[];
  timeline: TimelinePoint[];
  hourlyBuckets: HourlyBucket[];
  statusBreakdown: StatusBreakdownItem[];
  topOils: TopOilMetric[];
  topUnits: TopUnitMetric[];
  anomalies: DashboardAnomalyItem[];
  sheetRows: DashboardSheetRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function extractHour(rawTime: string): number | null {
  const cleaned = rawTime.trim().replace('.', ':');
  const match = /^(\d{1,2})(?::(\d{1,2}))?/.exec(cleaned);
  if (!match) return null;
  const h = Number(match[1]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  return h;
}

export function computeDashboardMetrics(
  allSheets: LogSheet[],
  filter: DashboardFilter = { shift: 'ALL', location: 'ALL' }
): DashboardMetrics {
  const shiftSet = new Set<string>();
  const locationSet = new Set<string>();

  for (const s of allSheets) {
    if (s.workingShift.trim()) shiftSet.add(s.workingShift.trim());
    if (s.storageLocation.trim()) locationSet.add(s.storageLocation.trim());
  }

  const filteredSheets = allSheets.filter((s) => {
    if (filter.shift !== 'ALL' && s.workingShift.trim() !== filter.shift) {
      return false;
    }
    if (
      filter.location !== 'ALL' &&
      s.storageLocation.trim() !== filter.location
    ) {
      return false;
    }
    return true;
  });

  let totalEntries = 0;
  let totalStockInQty = 0;
  let totalFlowmeterLiters = 0;
  let totalGreasingKg = 0;
  let totalGreasingMinutes = 0;
  let totalCollantLiters = 0;
  let totalCollantMinutes = 0;

  const statusAgg: Record<
    'PM' | 'ADD' | 'BD' | 'OTHER',
    { count: number; liters: number }
  > = {
    PM: { count: 0, liters: 0 },
    ADD: { count: 0, liters: 0 },
    BD: { count: 0, liters: 0 },
    OTHER: { count: 0, liters: 0 },
  };

  const oilMap = new Map<string, { liters: number; entries: number }>();
  const unitMap = new Map<
    string,
    {
      unitCode: string;
      codeAlias: string;
      modelUnit: string;
      lastHm: string;
      oilLiters: number;
      greaseKg: number;
      coolantLiters: number;
      entries: number;
    }
  >();
  const hourMap = new Map<
    number,
    { entries: number; flowmeterLiters: number; greasingKg: number }
  >();

  const timeline: TimelinePoint[] = [];
  const anomalies: DashboardAnomalyItem[] = [];
  const sheetRows: DashboardSheetRow[] = [];

  for (const sheet of filteredSheets) {
    const st = computeSheetTotals(sheet);
    const displayDate = formatDisplayDate(sheet.date) || 'Tanpa Tgl';
    const shiftLabel = sheet.workingShift.trim() || '-';
    const locLabel = sheet.storageLocation.trim() || '-';

    totalEntries += st.filledConsumptionRows;
    totalStockInQty += st.totalStockInQty;
    totalFlowmeterLiters += st.totalFlowmeterLiters;
    totalGreasingKg += st.totalGreasingKg;
    totalGreasingMinutes += st.totalGreasingMinutes;
    totalCollantLiters += st.totalCollantLiters;
    totalCollantMinutes += st.totalCollantMinutes;

    timeline.push({
      sheetId: sheet.id,
      label: displayDate,
      subLabel: shiftLabel,
      sortKey: `${sheet.date}_${sheet.createdAt}`,
      stockInQty: st.totalStockInQty,
      flowmeterLiters: st.totalFlowmeterLiters,
      collantLiters: st.totalCollantLiters,
      greasingKg: st.totalGreasingKg,
      entries: st.filledConsumptionRows,
    });

    sheetRows.push({
      sheetId: sheet.id,
      displayDate,
      shift: shiftLabel,
      location: locLabel,
      filledRows: st.filledConsumptionRows,
      stockInQty: st.totalStockInQty,
      flowmeterLiters: st.totalFlowmeterLiters,
      greasingKg: st.totalGreasingKg,
      collantLiters: st.totalCollantLiters,
      anomaliesCount: st.anomaliesCount,
    });

    for (const a of detectSheetAnomalies(sheet)) {
      anomalies.push({
        sheetId: sheet.id,
        sheetLabel: `${displayDate} · ${shiftLabel}`,
        rowNumber: a.rowNumber,
        message: a.message,
      });
    }

    for (const row of sheet.rows) {
      if (!isConsumptionRowFilled(row)) continue;

      const fm = Math.max(0, parseLocaleNumber(row.flowmeterLiter) ?? 0);
      const gk = Math.max(0, parseLocaleNumber(row.greasingKg) ?? 0);
      const cl = Math.max(0, parseLocaleNumber(row.collantLiter) ?? 0);

      const status = normalizeStatusCode(row.keteranganStatus) || 'OTHER';
      statusAgg[status].count += 1;
      statusAgg[status].liters = round2(statusAgg[status].liters + fm);

      const hour = extractHour(row.waktu);
      if (hour !== null) {
        const prevHour = hourMap.get(hour) ?? {
          entries: 0,
          flowmeterLiters: 0,
          greasingKg: 0,
        };
        hourMap.set(hour, {
          entries: prevHour.entries + 1,
          flowmeterLiters: round2(prevHour.flowmeterLiters + fm),
          greasingKg: round2(prevHour.greasingKg + gk),
        });
      }

      const oilName = row.oilLubeDescription.trim() || '(Belum diisi)';
      const prevOil = oilMap.get(oilName) ?? { liters: 0, entries: 0 };
      oilMap.set(oilName, {
        liters: round2(prevOil.liters + fm),
        entries: prevOil.entries + 1,
      });

      if (row.noUnit.trim()) {
        const identity = resolveUnitIdentity(row.noUnit);
        const unitKey = `${identity.unitCode.toUpperCase()}__${identity.codeAlias.toUpperCase()}`;
        const prevUnit = unitMap.get(unitKey) ?? {
          unitCode: identity.unitCode,
          codeAlias: identity.codeAlias,
          modelUnit: row.modelUnit.trim(),
          lastHm: row.hm.trim(),
          oilLiters: 0,
          greaseKg: 0,
          coolantLiters: 0,
          entries: 0,
        };

        const hmNew = parseLocaleNumber(row.hm);
        const hmOld = parseLocaleNumber(prevUnit.lastHm);
        const resolvedHm =
          hmNew !== null && (hmOld === null || hmNew >= hmOld)
            ? row.hm.trim()
            : prevUnit.lastHm || row.hm.trim();

        unitMap.set(unitKey, {
          unitCode: prevUnit.unitCode,
          codeAlias: prevUnit.codeAlias,
          modelUnit: prevUnit.modelUnit || row.modelUnit.trim(),
          lastHm: resolvedHm,
          oilLiters: round2(prevUnit.oilLiters + fm),
          greaseKg: round2(prevUnit.greaseKg + gk),
          coolantLiters: round2(prevUnit.coolantLiters + cl),
          entries: prevUnit.entries + 1,
        });
      }
    }
  }

  const roundedStockIn = round2(totalStockInQty);
  const roundedFlowmeter = round2(totalFlowmeterLiters);
  const roundedCollant = round2(totalCollantLiters);
  const totalOutFluids = round2(roundedFlowmeter + roundedCollant);

  const totalStatusCount =
    statusAgg.PM.count +
    statusAgg.ADD.count +
    statusAgg.BD.count +
    statusAgg.OTHER.count;

  const statusMeta: Array<{
    code: 'PM' | 'ADD' | 'BD' | 'OTHER';
    label: string;
  }> = [
    { code: 'PM', label: 'PM (Preventive Maintenance)' },
    { code: 'ADD', label: 'ADD (Additional / Top Up)' },
    { code: 'BD', label: 'BD (Breakdown)' },
    { code: 'OTHER', label: 'Lainnya / Belum Diisi' },
  ];

  const statusBreakdown: StatusBreakdownItem[] = statusMeta.map((item) => {
    const agg = statusAgg[item.code];
    return {
      code: item.code,
      label: item.label,
      count: agg.count,
      liters: round2(agg.liters),
      sharePercent:
        totalStatusCount > 0
          ? Math.round((agg.count / totalStatusCount) * 100)
          : 0,
    };
  });

  const topOils: TopOilMetric[] = Array.from(oilMap.entries())
    .map(([oilName, data]) => ({
      oilName,
      materialCode:
        oilName === '(Belum diisi)' ? '' : inferMaterialCode(oilName, 'oil'),
      liters: data.liters,
      entries: data.entries,
      sharePercent:
        roundedFlowmeter > 0
          ? Math.round((data.liters / roundedFlowmeter) * 100)
          : 0,
    }))
    .sort((a, b) => b.liters - a.liters || b.entries - a.entries);

  const topUnits: TopUnitMetric[] = Array.from(unitMap.values()).sort(
    (a, b) =>
      b.oilLiters - a.oilLiters ||
      b.greaseKg - a.greaseKg ||
      b.coolantLiters - a.coolantLiters
  );

  const hourlyBuckets: HourlyBucket[] = Array.from(hourMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hourNum, data]) => ({
      hourNum,
      hourLabel: `${String(hourNum).padStart(2, '0')}:00`,
      entries: data.entries,
      flowmeterLiters: data.flowmeterLiters,
      greasingKg: data.greasingKg,
    }));

  // Chronological order for timeline chart (oldest -> newest)
  const orderedTimeline = [...timeline].reverse();

  return {
    sheetCount: filteredSheets.length,
    totalEntries,
    uniqueUnitsCount: topUnits.length,
    totalStockInQty: roundedStockIn,
    totalFlowmeterLiters: roundedFlowmeter,
    totalGreasingKg: round2(totalGreasingKg),
    totalGreasingMinutes: round2(totalGreasingMinutes),
    totalCollantLiters: roundedCollant,
    totalCollantMinutes: round2(totalCollantMinutes),
    netStockBalance: round2(roundedStockIn - totalOutFluids),
    avgLitersPerEntry:
      totalEntries > 0 ? round2(roundedFlowmeter / totalEntries) : 0,
    pmSharePercent:
      totalStatusCount > 0
        ? Math.round((statusAgg.PM.count / totalStatusCount) * 100)
        : 0,
    availableShifts: Array.from(shiftSet).sort(),
    availableLocations: Array.from(locationSet).sort(),
    timeline: orderedTimeline,
    hourlyBuckets,
    statusBreakdown,
    topOils,
    topUnits,
    anomalies,
    sheetRows,
  };
}
