import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FilePlus2,
  RotateCcw,
} from 'lucide-react';
import type { LogSheet } from '../types/logSheet';
import {
  computeDashboardMetrics,
  type DashboardFilter,
} from '../utils/dashboardMetrics';

interface DashboardViewProps {
  sheets: LogSheet[];
  onOpenSheet: (sheetId: string) => void;
  onOpenOutputForSheet: (sheetId: string) => void;
  onCreateBlankSheet: () => void;
}

const STATUS_COLORS: Record<'PM' | 'ADD' | 'BD' | 'OTHER', string> = {
  PM: '#047857', // emerald-700
  ADD: '#0284c7', // sky-600
  BD: '#dc2626', // red-600
  OTHER: '#94a3b8', // slate-400
};

export function DashboardView({
  sheets,
  onOpenSheet,
  onOpenOutputForSheet,
  onCreateBlankSheet,
}: DashboardViewProps) {
  const [filter, setFilter] = useState<DashboardFilter>({
    shift: 'ALL',
    location: 'ALL',
  });
  const [chartMode, setChartMode] = useState<'timeline' | 'hourly'>('timeline');
  const [selectedTimelineIdx, setSelectedTimelineIdx] = useState<number | null>(
    null
  );
  const [selectedHourIdx, setSelectedHourIdx] = useState<number | null>(null);

  const metrics = useMemo(
    () => computeDashboardMetrics(sheets, filter),
    [sheets, filter]
  );

  const hasActiveFilter = filter.shift !== 'ALL' || filter.location !== 'ALL';

  const activeTimelinePoint =
    selectedTimelineIdx !== null && metrics.timeline[selectedTimelineIdx]
      ? metrics.timeline[selectedTimelineIdx]
      : metrics.timeline[metrics.timeline.length - 1] ?? null;

  const activeHourPoint =
    selectedHourIdx !== null && metrics.hourlyBuckets[selectedHourIdx]
      ? metrics.hourlyBuckets[selectedHourIdx]
      : metrics.hourlyBuckets[0] ?? null;

  // Timeline SVG geometry
  const timelineChartWidth = 720;
  const timelineChartHeight = 230;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 38;
  const plotW = timelineChartWidth - padLeft - padRight;
  const plotH = timelineChartHeight - padTop - padBottom;

  const maxTimelineVal = useMemo(() => {
    let maxV = 10;
    for (const pt of metrics.timeline) {
      maxV = Math.max(maxV, pt.stockInQty, pt.flowmeterLiters, pt.collantLiters);
    }
    return Math.ceil(maxV * 1.15);
  }, [metrics.timeline]);

  const maxHourlyVal = useMemo(() => {
    let maxV = 10;
    for (const h of metrics.hourlyBuckets) {
      maxV = Math.max(maxV, h.flowmeterLiters);
    }
    return Math.ceil(maxV * 1.15);
  }, [metrics.hourlyBuckets]);

  // Donut SVG geometry
  const totalStatusEntries = metrics.statusBreakdown.reduce(
    (sum, s) => sum + s.count,
    0
  );
  const donutRadius = 54;
  const donutCircumference = 2 * Math.PI * donutRadius;

  const donutSegments = useMemo(() => {
    if (totalStatusEntries === 0) return [];
    let accumulated = 0;
    return metrics.statusBreakdown
      .filter((item) => item.count > 0)
      .map((item) => {
        const fraction = item.count / totalStatusEntries;
        const dashLength = fraction * donutCircumference;
        const offset = -accumulated * donutCircumference;
        accumulated += fraction;
        return {
          ...item,
          dashArray: `${dashLength} ${donutCircumference - dashLength}`,
          dashOffset: offset,
        };
      });
  }, [metrics.statusBreakdown, totalStatusEntries, donutCircumference]);

  const fluidOutTotal =
    Math.round(
      (metrics.totalFlowmeterLiters + metrics.totalCollantLiters) * 100
    ) / 100;

  return (
    <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Dashboard Operasional Oli &amp; Pelumas
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Pantau tren pemakaian oli, neraca stok masuk-keluar, status
            perawatan unit, dan pemeriksaan anomali flowmeter.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => setFilter({ shift: 'ALL', location: 'ALL' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Filter</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCreateBlankSheet}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" aria-hidden="true" />
            <span>Buat Lembar Baru</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 mb-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 mr-1">
            Shift:
          </span>
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => {
                setFilter((prev) => ({ ...prev, shift: 'ALL' }));
                setSelectedTimelineIdx(null);
              }}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                filter.shift === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Shift
            </button>
            {metrics.availableShifts.map((shift) => (
              <button
                key={shift}
                type="button"
                onClick={() => {
                  setFilter((prev) => ({ ...prev, shift }));
                  setSelectedTimelineIdx(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  filter.shift === shift
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {shift}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="dashboard-location-filter"
            className="text-xs font-semibold text-slate-600"
          >
            Lokasi:
          </label>
          <select
            id="dashboard-location-filter"
            aria-label="Filter lokasi penyimpanan"
            value={filter.location}
            onChange={(e) => {
              setFilter((prev) => ({ ...prev, location: e.target.value }));
              setSelectedTimelineIdx(null);
            }}
            className="text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="ALL">Semua Lokasi ({metrics.availableLocations.length})</option>
            {metrics.availableLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty State when filter matches no sheets */}
      {metrics.sheetCount === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            Tidak ada lembar log yang cocok dengan filter aktif.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Ubah pilihan shift atau lokasi untuk menampilkan ringkasan analitik.
          </p>
          <button
            type="button"
            onClick={() => setFilter({ shift: 'ALL', location: 'ALL' })}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tampilkan Semua Data</span>
          </button>
        </div>
      ) : (
        <>
          {/* 4-Column KPI Strip */}
          <div
            data-testid="dashboard-kpi-grid"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
          >
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500">
                Pemakaian Oli Flowmeter
              </div>
              <div className="mt-1.5 text-2xl font-bold font-data-mono tabular-nums text-slate-900">
                {metrics.totalFlowmeterLiters}{' '}
                <span className="font-sans text-sm font-medium text-slate-500">
                  Liter
                </span>
              </div>
              <div className="mt-1.5 text-xs text-slate-600 tabular-nums">
                Rata-rata {metrics.avgLitersPerEntry} L / isi ·{' '}
                {metrics.totalEntries} baris
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500">
                Neraca Stok (In − Out)
              </div>
              <div
                className={`mt-1.5 text-2xl font-bold font-data-mono tabular-nums ${
                  metrics.netStockBalance < 0
                    ? 'text-amber-700'
                    : 'text-slate-900'
                }`}
              >
                {metrics.netStockBalance > 0 ? '+' : ''}
                {metrics.netStockBalance}{' '}
                <span className="font-sans text-sm font-medium text-slate-500">
                  L
                </span>
              </div>
              <div className="mt-1.5 text-xs text-slate-600 tabular-nums">
                Masuk: {metrics.totalStockInQty} · Keluar: {fluidOutTotal} L
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500">
                Greasing &amp; Collant
              </div>
              <div className="mt-1.5 text-2xl font-bold font-data-mono tabular-nums text-slate-900">
                {metrics.totalGreasingKg}{' '}
                <span className="font-sans text-sm font-medium text-slate-500">
                  Kg
                </span>{' '}
                <span className="font-sans text-sm font-normal text-slate-400">
                  /
                </span>{' '}
                {metrics.totalCollantLiters}{' '}
                <span className="font-sans text-sm font-medium text-slate-500">
                  L
                </span>
              </div>
              <div className="mt-1.5 text-xs text-slate-600 tabular-nums">
                {metrics.totalGreasingMinutes} mnt grease ·{' '}
                {metrics.totalCollantMinutes} mnt collant
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500">
                Unit Dilayani &amp; Kepatuhan PM
              </div>
              <div className="mt-1.5 text-2xl font-bold font-data-mono tabular-nums text-slate-900">
                {metrics.uniqueUnitsCount}{' '}
                <span className="font-sans text-sm font-medium text-slate-500">
                  Unit
                </span>
              </div>
              <div className="mt-1.5 text-xs tabular-nums flex items-center gap-1.5">
                <span className="text-slate-600">
                  PM: {metrics.pmSharePercent}%
                </span>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                {metrics.anomalies.length > 0 ? (
                  <span className="font-semibold text-red-700">
                    {metrics.anomalies.length} Anomali Flowmeter
                  </span>
                ) : (
                  <span className="font-medium text-emerald-700">
                    Flowmeter Nominal
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Primary Charts Row: Timeline / Hourly (8 cols) + Status Breakdown (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            {/* Main Activity Chart */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {chartMode === 'timeline'
                      ? 'Perbandingan Stok Masuk & Pemakaian per Lembar'
                      : 'Distribusi Pemakaian Oli per Jam Kerja'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {chartMode === 'timeline'
                      ? 'Klik batang grafik untuk melihat rincian lembar log terkait.'
                      : 'Akumulasi volume oli flowmeter berdasarkan kolom Waktu pengisian.'}
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
                  <button
                    type="button"
                    onClick={() => setChartMode('timeline')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      chartMode === 'timeline'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per Lembar ({metrics.timeline.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('hourly')}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      chartMode === 'hourly'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per Jam ({metrics.hourlyBuckets.length})
                  </button>
                </div>
              </div>

              {chartMode === 'timeline' ? (
                <>
                  <div className="w-full overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${timelineChartWidth} ${timelineChartHeight}`}
                      className="w-full h-auto min-w-[460px]"
                      role="img"
                      aria-label="Grafik perbandingan Stock In, Flowmeter Oli, dan Collant per lembar"
                    >
                      {/* Horizontal gridlines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                        const y = padTop + plotH * (1 - step);
                        const tickVal = Math.round(maxTimelineVal * step);
                        return (
                          <g key={step}>
                            <line
                              x1={padLeft}
                              y1={y}
                              x2={timelineChartWidth - padRight}
                              y2={y}
                              stroke="#e2e8f0"
                              strokeDasharray={step === 0 ? undefined : '3 3'}
                            />
                            <text
                              x={padLeft - 6}
                              y={y + 3}
                              textAnchor="end"
                              fontSize="10"
                              fill="#64748b"
                              className="font-data-mono"
                            >
                              {tickVal}
                            </text>
                          </g>
                        );
                      })}

                      {metrics.timeline.map((pt, idx) => {
                        const count = metrics.timeline.length;
                        const groupW = plotW / Math.max(count, 1);
                        const barW = Math.min(26, Math.max(10, groupW * 0.18));
                        const centerX = padLeft + idx * groupW + groupW / 2;

                        const hIn = (pt.stockInQty / maxTimelineVal) * plotH;
                        const hFm =
                          (pt.flowmeterLiters / maxTimelineVal) * plotH;
                        const hCl = (pt.collantLiters / maxTimelineVal) * plotH;

                        const isSelected =
                          activeTimelinePoint?.sheetId === pt.sheetId;

                        return (
                          <g
                            key={pt.sheetId}
                            className="cursor-pointer"
                            onClick={() => setSelectedTimelineIdx(idx)}
                          >
                            {isSelected && (
                              <rect
                                x={centerX - barW * 1.9}
                                y={padTop}
                                width={barW * 3.8}
                                height={plotH}
                                rx={4}
                                fill="#f1f5f9"
                              />
                            )}
                            {/* Bar 1: Stock In */}
                            <rect
                              x={centerX - barW * 1.6}
                              y={padTop + plotH - hIn}
                              width={barW}
                              height={Math.max(hIn, pt.stockInQty > 0 ? 2 : 0)}
                              rx={2}
                              fill="#000080"
                            />
                            {/* Bar 2: Flowmeter Oli */}
                            <rect
                              x={centerX - barW * 0.45}
                              y={padTop + plotH - hFm}
                              width={barW}
                              height={Math.max(
                                hFm,
                                pt.flowmeterLiters > 0 ? 2 : 0
                              )}
                              rx={2}
                              fill="#047857"
                            />
                            {/* Bar 3: Collant */}
                            <rect
                              x={centerX + barW * 0.7}
                              y={padTop + plotH - hCl}
                              width={barW}
                              height={Math.max(
                                hCl,
                                pt.collantLiters > 0 ? 2 : 0
                              )}
                              rx={2}
                              fill="#0284c7"
                            />
                            <text
                              x={centerX}
                              y={padTop + plotH + 14}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight={isSelected ? '700' : '500'}
                              fill={isSelected ? '#0f172a' : '#475569'}
                            >
                              {pt.label}
                            </text>
                            <text
                              x={centerX}
                              y={padTop + plotH + 26}
                              textAnchor="middle"
                              fontSize="9"
                              fill="#64748b"
                            >
                              {pt.subLabel}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Chart Legend & Active Selection Bar */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-4 text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#000080]" />
                        Stock In (Qty)
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-emerald-700" />
                        Flowmeter Oli (L)
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-sky-600" />
                        Collant (L)
                      </span>
                    </div>

                    {activeTimelinePoint && (
                      <div className="flex flex-wrap items-center gap-2 text-slate-700 tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {activeTimelinePoint.label} ·{' '}
                          {activeTimelinePoint.subLabel}:
                        </span>
                        <span>
                          In {activeTimelinePoint.stockInQty} / Oli{' '}
                          {activeTimelinePoint.flowmeterLiters} L
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSheet(activeTimelinePoint.sheetId)
                          }
                          className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 hover:underline cursor-pointer"
                        >
                          <span>Buka Form</span>
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : metrics.hourlyBuckets.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">
                  Belum ada data kolom Waktu (HH:MM) yang valid pada lembar
                  terfilter.
                </div>
              ) : (
                <>
                  <div className="w-full overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${timelineChartWidth} ${timelineChartHeight}`}
                      className="w-full h-auto min-w-[460px]"
                      role="img"
                      aria-label="Grafik distribusi pemakaian oli per jam kerja"
                    >
                      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                        const y = padTop + plotH * (1 - step);
                        const tickVal = Math.round(maxHourlyVal * step);
                        return (
                          <g key={step}>
                            <line
                              x1={padLeft}
                              y1={y}
                              x2={timelineChartWidth - padRight}
                              y2={y}
                              stroke="#e2e8f0"
                              strokeDasharray={step === 0 ? undefined : '3 3'}
                            />
                            <text
                              x={padLeft - 6}
                              y={y + 3}
                              textAnchor="end"
                              fontSize="10"
                              fill="#64748b"
                              className="font-data-mono"
                            >
                              {tickVal}
                            </text>
                          </g>
                        );
                      })}

                      {metrics.hourlyBuckets.map((hb, idx) => {
                        const count = metrics.hourlyBuckets.length;
                        const groupW = plotW / Math.max(count, 1);
                        const barW = Math.min(34, Math.max(14, groupW * 0.48));
                        const centerX = padLeft + idx * groupW + groupW / 2;
                        const hVal =
                          (hb.flowmeterLiters / maxHourlyVal) * plotH;
                        const isSelected =
                          activeHourPoint?.hourNum === hb.hourNum;

                        return (
                          <g
                            key={hb.hourNum}
                            className="cursor-pointer"
                            onClick={() => setSelectedHourIdx(idx)}
                          >
                            <rect
                              x={centerX - barW / 2}
                              y={padTop + plotH - hVal}
                              width={barW}
                              height={Math.max(
                                hVal,
                                hb.flowmeterLiters > 0 ? 3 : 0
                              )}
                              rx={3}
                              fill={isSelected ? '#000080' : '#047857'}
                            />
                            <text
                              x={centerX}
                              y={Math.max(
                                padTop + 10,
                                padTop + plotH - hVal - 5
                              )}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="600"
                              fill="#0f172a"
                              className="font-data-mono"
                            >
                              {hb.flowmeterLiters}L
                            </text>
                            <text
                              x={centerX}
                              y={padTop + plotH + 15}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#475569"
                              className="font-data-mono"
                            >
                              {hb.hourLabel}
                            </text>
                            <text
                              x={centerX}
                              y={padTop + plotH + 27}
                              textAnchor="middle"
                              fontSize="9"
                              fill="#64748b"
                            >
                              {hb.entries}x isi
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {activeHourPoint && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 tabular-nums">
                      <span>
                        Jam{' '}
                        <strong className="text-slate-900 font-data-mono">
                          {activeHourPoint.hourLabel}
                        </strong>
                        : {activeHourPoint.entries} pengisian ·{' '}
                        {activeHourPoint.flowmeterLiters} L oli ·{' '}
                        {activeHourPoint.greasingKg} Kg grease
                      </span>
                      <span className="text-slate-500">
                        Klik batang jam untuk melihat detail
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right: Status Breakdown Donut & Table */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Komposisi Status Unit
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribusi pengisian berdasarkan status PM, ADD, dan BD.
                </p>

                <div className="my-4 flex items-center justify-center">
                  <div className="relative w-[140px] h-[140px]">
                    <svg
                      viewBox="0 0 140 140"
                      className="w-full h-full -rotate-90"
                      role="img"
                      aria-label="Diagram donat komposisi status unit"
                    >
                      <circle
                        cx="70"
                        cy="70"
                        r={donutRadius}
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="16"
                      />
                      {donutSegments.map((seg) => (
                        <circle
                          key={seg.code}
                          cx="70"
                          cy="70"
                          r={donutRadius}
                          fill="none"
                          stroke={STATUS_COLORS[seg.code]}
                          strokeWidth="16"
                          strokeDasharray={seg.dashArray}
                          strokeDashoffset={seg.dashOffset}
                        />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-xl font-bold font-data-mono tabular-nums text-slate-900">
                        {totalStatusEntries}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Pengisian
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {metrics.statusBreakdown.map((item) => (
                  <div
                    key={item.code}
                    className="py-2 flex items-center justify-between gap-2 tabular-nums"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[item.code] }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-800 truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="shrink-0 font-data-mono text-slate-700">
                      <strong className="text-slate-900">{item.count}x</strong>{' '}
                      <span className="text-slate-400">·</span> {item.liters} L{' '}
                      <span className="text-slate-400">
                        ({item.sharePercent}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Insights Row: Top Oils + Top Units */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Oil Types with Proportion Bars */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Konsumsi Teratas per Jenis Oli
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {metrics.topOils.length} jenis
                </span>
              </div>

              {metrics.topOils.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">
                  Belum ada catatan konsumsi oli pada lembar terfilter.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {metrics.topOils.slice(0, 8).map((oil) => (
                    <div key={oil.oilName} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 block truncate">
                            {oil.oilName}
                          </span>
                          <span className="text-slate-500 font-data-mono">
                            {oil.materialCode || 'Belum terpetakan ke Material Code'}{' '}
                            · {oil.entries}x isi
                          </span>
                        </div>
                        <div className="shrink-0 text-right font-data-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            {oil.liters} L
                          </span>{' '}
                          <span className="text-slate-500">
                            ({oil.sharePercent}%)
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 rounded-full"
                          style={{
                            width: `${Math.max(4, Math.min(100, oil.sharePercent))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Consuming Units with Resolved Unit Code & Code Alias */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Unit dengan Pemakaian Tertinggi
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {metrics.topUnits.length} unit
                </span>
              </div>

              {metrics.topUnits.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">
                  Belum ada No. Unit yang tercatat pada lembar terfilter.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3 text-left">Unit Code</th>
                        <th className="py-2.5 px-3 text-left">Alias</th>
                        <th className="py-2.5 px-3 text-right">HM</th>
                        <th className="py-2.5 px-3 text-right">Oli (L)</th>
                        <th className="py-2.5 px-3 text-right">Grease (Kg)</th>
                        <th className="py-2.5 px-3 text-right">Collant (L)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {metrics.topUnits.slice(0, 8).map((u) => (
                        <tr
                          key={`${u.unitCode}-${u.codeAlias}`}
                          className="h-[38px] hover:bg-slate-50"
                        >
                          <td className="px-3 font-data-mono font-semibold text-slate-900">
                            {u.unitCode}
                          </td>
                          <td className="px-3 font-data-mono text-slate-600">
                            {u.codeAlias}
                          </td>
                          <td className="px-3 text-right font-data-mono tabular-nums text-slate-600">
                            {u.lastHm || '-'}
                          </td>
                          <td className="px-3 text-right font-data-mono tabular-nums font-bold text-slate-900">
                            {u.oilLiters}
                          </td>
                          <td className="px-3 text-right font-data-mono tabular-nums text-slate-700">
                            {u.greaseKg}
                          </td>
                          <td className="px-3 text-right font-data-mono tabular-nums text-slate-700">
                            {u.coolantLiters}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Anomaly Verification + Filtered Sheet Table */}
          <div className="space-y-6">
            {/* Anomaly Panel */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Pemeriksaan Validitas Flowmeter
                </h2>
                <span className="text-xs font-medium text-slate-600 tabular-nums">
                  {metrics.anomalies.length} temuan
                </span>
              </div>

              {metrics.anomalies.length === 0 ? (
                <div className="px-4 py-3.5 flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/50">
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-700 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    Seluruh pembacaan Flowmeter Akhir ≥ Flowmeter Awal pada
                    lembar yang dipilih.
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {metrics.anomalies.map((item) => (
                    <div
                      key={`${item.sheetId}-${item.rowNumber}`}
                      className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs bg-red-50/40"
                    >
                      <div className="flex items-start gap-2 text-red-800">
                        <AlertTriangle
                          className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>
                          <strong className="font-semibold">
                            {item.sheetLabel}
                          </strong>{' '}
                          — {item.message}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenSheet(item.sheetId)}
                        className="self-start sm:self-auto text-xs font-semibold text-red-700 hover:underline cursor-pointer shrink-0"
                      >
                        Perbaiki di Form
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filtered Sheet Quick-Access Table */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Ringkasan per Lembar Log
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {metrics.sheetRows.length} lembar
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4 text-left">Tanggal</th>
                      <th className="py-2.5 px-3 text-left">Shift</th>
                      <th className="py-2.5 px-3 text-left">Lokasi</th>
                      <th className="py-2.5 px-3 text-right">Baris Terisi</th>
                      <th className="py-2.5 px-3 text-right">Stock In</th>
                      <th className="py-2.5 px-3 text-right">Flowmeter (L)</th>
                      <th className="py-2.5 px-3 text-right">Grease (Kg)</th>
                      <th className="py-2.5 px-4 text-right">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.sheetRows.map((row) => (
                      <tr key={row.sheetId} className="h-[40px] hover:bg-slate-50">
                        <td className="px-4 font-data-mono font-semibold text-slate-900 whitespace-nowrap">
                          {row.displayDate}
                        </td>
                        <td className="px-3 text-slate-700 whitespace-nowrap">
                          {row.shift}
                        </td>
                        <td className="px-3 text-slate-600 max-w-[240px] truncate">
                          {row.location}
                        </td>
                        <td className="px-3 text-right font-data-mono tabular-nums text-slate-700">
                          {row.filledRows}/20
                        </td>
                        <td className="px-3 text-right font-data-mono tabular-nums text-slate-700">
                          {row.stockInQty}
                        </td>
                        <td className="px-3 text-right font-data-mono tabular-nums font-semibold text-slate-900">
                          {row.flowmeterLiters} L
                        </td>
                        <td className="px-3 text-right font-data-mono tabular-nums text-slate-700">
                          {row.greasingKg} Kg
                        </td>
                        <td className="px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => onOpenSheet(row.sheetId)}
                              className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                            >
                              Buka Form
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenOutputForSheet(row.sheetId)}
                              className="font-semibold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                            >
                              Format Output
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
