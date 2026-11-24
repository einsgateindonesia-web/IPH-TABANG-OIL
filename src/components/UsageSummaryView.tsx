import { useMemo } from 'react';
import type { LogSheet } from '../types/logSheet';
import {
  computeSheetTotals,
  isConsumptionRowFilled,
  normalizeStatusCode,
  parseLocaleNumber,
} from '../utils/logSheet';

interface UsageSummaryViewProps {
  sheets: LogSheet[];
  onOpenSheet: (sheetId: string) => void;
}

export function UsageSummaryView({ sheets, onOpenSheet }: UsageSummaryViewProps) {
  const aggregate = useMemo(() => {
    let totalStockIn = 0;
    let totalFlowmeter = 0;
    let totalGreaseKg = 0;
    let totalGreaseMin = 0;
    let totalCollant = 0;
    let totalEntries = 0;
    const statusCounts = { PM: 0, ADD: 0, BD: 0, OTHER: 0 };

    const byOil = new Map<string, { liters: number; entries: number }>();
    const byUnit = new Map<
      string,
      { model: string; oilLiters: number; greaseKg: number; coolantLiters: number; entries: number }
    >();

    for (const sheet of sheets) {
      const st = computeSheetTotals(sheet);
      totalStockIn += st.totalStockInQty;
      totalFlowmeter += st.totalFlowmeterLiters;
      totalGreaseKg += st.totalGreasingKg;
      totalGreaseMin += st.totalGreasingMinutes;
      totalCollant += st.totalCollantLiters;
      totalEntries += st.filledConsumptionRows;
      statusCounts.PM += st.statusCounts.PM;
      statusCounts.ADD += st.statusCounts.ADD;
      statusCounts.BD += st.statusCounts.BD;
      statusCounts.OTHER += st.statusCounts.OTHER;

      for (const row of sheet.rows) {
        if (!isConsumptionRowFilled(row)) continue;

        const fm = parseLocaleNumber(row.flowmeterLiter) ?? 0;
        const gk = parseLocaleNumber(row.greasingKg) ?? 0;
        const cl = parseLocaleNumber(row.collantLiter) ?? 0;

        const oilName = row.oilLubeDescription.trim() || '(Belum diisi)';
        const prevOil = byOil.get(oilName) ?? { liters: 0, entries: 0 };
        byOil.set(oilName, {
          liters: Math.round((prevOil.liters + Math.max(0, fm)) * 100) / 100,
          entries: prevOil.entries + 1,
        });

        const unitName = row.noUnit.trim();
        if (unitName) {
          const prevUnit = byUnit.get(unitName) ?? {
            model: row.modelUnit.trim(),
            oilLiters: 0,
            greaseKg: 0,
            coolantLiters: 0,
            entries: 0,
          };
          byUnit.set(unitName, {
            model: prevUnit.model || row.modelUnit.trim(),
            oilLiters:
              Math.round((prevUnit.oilLiters + Math.max(0, fm)) * 100) / 100,
            greaseKg:
              Math.round((prevUnit.greaseKg + Math.max(0, gk)) * 100) / 100,
            coolantLiters:
              Math.round((prevUnit.coolantLiters + Math.max(0, cl)) * 100) / 100,
            entries: prevUnit.entries + 1,
          });
        }
      }
    }

    const oilList = Array.from(byOil.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.liters - a.liters);

    const unitList = Array.from(byUnit.entries())
      .map(([unit, data]) => ({ unit, ...data }))
      .sort((a, b) => b.oilLiters - a.oilLiters);

    return {
      totalStockIn: Math.round(totalStockIn * 100) / 100,
      totalFlowmeter: Math.round(totalFlowmeter * 100) / 100,
      totalGreaseKg: Math.round(totalGreaseKg * 100) / 100,
      totalGreaseMin: Math.round(totalGreaseMin * 100) / 100,
      totalCollant: Math.round(totalCollant * 100) / 100,
      totalEntries,
      statusCounts,
      oilList,
      unitList,
    };
  }, [sheets]);

  const recentUnits = useMemo(() => {
    const items: Array<{
      sheetId: string;
      date: string;
      shift: string;
      noUnit: string;
      oil: string;
      liter: string;
      status: string;
    }> = [];

    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        if (!isConsumptionRowFilled(row)) continue;
        items.push({
          sheetId: sheet.id,
          date: sheet.date,
          shift: sheet.workingShift,
          noUnit: row.noUnit || '-',
          oil: row.oilLubeDescription || '-',
          liter: row.flowmeterLiter || '0',
          status: normalizeStatusCode(row.keteranganStatus) || '-',
        });
      }
    }
    return items.slice(0, 12);
  }, [sheets]);

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">
          Ringkasan Pemakaian Oli &amp; Pelumas
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Akumulasi otomatis dari {sheets.length} lembar log ({aggregate.totalEntries}{' '}
          catatan pengisian unit).
        </p>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">
            Total Pemakaian Flowmeter
          </div>
          <div className="mt-1 text-2xl font-bold font-data-mono text-slate-900">
            {aggregate.totalFlowmeter}{' '}
            <span className="font-sans text-sm font-medium text-slate-500">
              Liter
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">
            Total Greasing
          </div>
          <div className="mt-1 text-2xl font-bold font-data-mono text-slate-900">
            {aggregate.totalGreaseKg}{' '}
            <span className="font-sans text-sm font-medium text-slate-500">
              Kg · {aggregate.totalGreaseMin} mnt
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">
            Total Collant
          </div>
          <div className="mt-1 text-2xl font-bold font-data-mono text-slate-900">
            {aggregate.totalCollant}{' '}
            <span className="font-sans text-sm font-medium text-slate-500">
              Liter
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">
            Total Stock In &amp; Status Unit
          </div>
          <div className="mt-1 text-2xl font-bold font-data-mono text-slate-900">
            {aggregate.totalStockIn}{' '}
            <span className="font-sans text-sm font-medium text-slate-500">
              Qty
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-600 tabular-nums">
            PM: {aggregate.statusCounts.PM} · ADD: {aggregate.statusCounts.ADD} ·
            BD: {aggregate.statusCounts.BD}
          </div>
        </div>
      </div>

      {/* Two-Column Breakdown Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Per Oil Type */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              Pemakaian per Jenis Oli / Pelumas
            </h2>
          </div>
          {aggregate.oilList.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Belum ada data pemakaian oli yang tercatat.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-left">Oil &amp; Lube Description</th>
                  <th className="py-2.5 px-4 text-right">Pengisian</th>
                  <th className="py-2.5 px-4 text-right">Total Liter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregate.oilList.map((item) => (
                  <tr key={item.name}>
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      {item.name}
                    </td>
                    <td className="py-2.5 px-4 text-right font-data-mono text-slate-600">
                      {item.entries}x
                    </td>
                    <td className="py-2.5 px-4 text-right font-data-mono font-semibold text-slate-900">
                      {item.liters}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Per Unit */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              Pemakaian per No. Unit
            </h2>
          </div>
          {aggregate.unitList.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              Belum ada No. Unit yang tercatat.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-left">No. Unit</th>
                  <th className="py-2.5 px-4 text-left">Model</th>
                  <th className="py-2.5 px-4 text-right">Oli (L)</th>
                  <th className="py-2.5 px-4 text-right">Grease (Kg)</th>
                  <th className="py-2.5 px-4 text-right">Collant (L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregate.unitList.map((u) => (
                  <tr key={u.unit}>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {u.unit}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs">
                      {u.model || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-data-mono font-semibold text-slate-900">
                      {u.oilLiters}
                    </td>
                    <td className="py-2.5 px-4 text-right font-data-mono text-slate-700">
                      {u.greaseKg}
                    </td>
                    <td className="py-2.5 px-4 text-right font-data-mono text-slate-700">
                      {u.coolantLiters}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Entries */}
      {recentUnits.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              Catatan Pengisian Terbaru
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-left">Unit</th>
                  <th className="py-2.5 px-4 text-left">Jenis Oli</th>
                  <th className="py-2.5 px-4 text-left">Shift</th>
                  <th className="py-2.5 px-4 text-left">Status</th>
                  <th className="py-2.5 px-4 text-right">Liter</th>
                  <th className="py-2.5 px-4 text-right">Lembar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recentUnits.map((item, i) => (
                  <tr key={`${item.sheetId}-${i}`}>
                    <td className="py-2 px-4 font-semibold text-slate-900">
                      {item.noUnit}
                    </td>
                    <td className="py-2 px-4 text-slate-700">{item.oil}</td>
                    <td className="py-2 px-4 text-slate-600 text-xs">
                      {item.shift}
                    </td>
                    <td className="py-2 px-4 text-xs font-semibold text-slate-700">
                      {item.status}
                    </td>
                    <td className="py-2 px-4 text-right font-data-mono font-semibold text-slate-900">
                      {item.liter}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenSheet(item.sheetId)}
                        className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                      >
                        Lihat Form
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
