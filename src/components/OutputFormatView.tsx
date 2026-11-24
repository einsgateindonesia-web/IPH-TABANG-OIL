import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Search,
} from 'lucide-react';
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
  OutputRowOverride,
  PrimarySpreadsheetConfig,
} from '../types/logSheet';
import { downloadExcelWorkbook } from '../utils/excelExport';
import { formatDisplayDate } from '../utils/logSheet';
import {
  OUTPUT_HEADERS,
  mapSheetsToOutputRows,
  outputRowsToCsv,
  outputRowsToTsv,
} from '../utils/outputMapper';
import { buildSpreadsheetWorksheets } from '../utils/spreadsheetBuilder';
import { SpreadsheetConnectionBar } from './SpreadsheetConnectionBar';

interface OutputFormatViewProps {
  sheets: LogSheet[];
  activeSheet: LogSheet;
  overrides: OutputOverrideMap;
  fallbackStorageCode: string;
  onChangeFallbackStorageCode: (code: string) => void;
  onUpdateOverride: (
    rowKey: string,
    patch: Partial<OutputRowOverride>
  ) => void;
  onResetOverrides: () => void;
  primaryConfig: PrimarySpreadsheetConfig | null;
  onPrimaryConfigChange: (config: PrimarySpreadsheetConfig | null) => void;
  onOpenSendSheets: () => void;
  syncTick: number;
  onSyncCompleted: () => void;
}

type MasterSubTab =
  | 'output'
  | 'unit'
  | 'storage'
  | 'component'
  | 'typeOfOut'
  | 'material';

export function OutputFormatView({
  sheets,
  activeSheet,
  overrides,
  fallbackStorageCode,
  onChangeFallbackStorageCode,
  onUpdateOverride,
  onResetOverrides,
  primaryConfig,
  onPrimaryConfigChange,
  onOpenSendSheets,
  syncTick,
  onSyncCompleted,
}: OutputFormatViewProps) {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [splitGreaseAndCoolant, setSplitGreaseAndCoolant] = useState(true);
  const [subTab, setSubTab] = useState<MasterSubTab>('output');
  const [unitQuery, setUnitQuery] = useState('');
  const [masterQuery, setMasterQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const targetSheets = useMemo(
    () => (scope === 'active' ? [activeSheet] : sheets),
    [scope, activeSheet, sheets]
  );

  const outputRows = useMemo(
    () =>
      mapSheetsToOutputRows(targetSheets, {
        overrides,
        fallbackStorageCode,
        splitGreaseAndCoolant,
      }),
    [targetSheets, overrides, fallbackStorageCode, splitGreaseAndCoolant]
  );

  const materialNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of MATERIAL_CODES) {
      map.set(m.materialCode.toUpperCase(), m.oilName);
    }
    return map;
  }, []);

  const filteredUnits = useMemo(() => {
    const q = unitQuery.trim().toLowerCase();
    if (!q) return UNIT_CODES;
    return UNIT_CODES.filter(
      (u) =>
        u.unitCode.toLowerCase().includes(q) ||
        u.codeAlias.toLowerCase().includes(q)
    );
  }, [unitQuery]);

  const uniqueCodeAliases = useMemo(() => {
    const seen = new Set<string>();
    const list: { codeAlias: string; unitCode: string }[] = [];
    for (const u of UNIT_CODES) {
      if (!seen.has(u.codeAlias)) {
        seen.add(u.codeAlias);
        list.push({ codeAlias: u.codeAlias, unitCode: u.unitCode });
      }
    }
    return list;
  }, []);

  const filteredMaterials = useMemo(() => {
    const q = masterQuery.trim().toLowerCase();
    if (!q) return MATERIAL_CODES;
    return MATERIAL_CODES.filter(
      (m) =>
        m.materialCode.toLowerCase().includes(q) ||
        m.oilName.toLowerCase().includes(q)
    );
  }, [masterQuery]);

  const handleCopyTsv = async () => {
    const tsv = outputRowsToTsv(outputRows, true);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback textarea copy if clipboard API is restricted
      const ta = document.createElement('textarea');
      ta.value = tsv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCsv = () => {
    const csv = outputRowsToCsv(outputRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix =
      scope === 'active'
        ? (activeSheet.date || 'log').replace(/[^a-zA-Z0-9_-]/g, '-')
        : 'semua_lembar';
    a.download = `Format_Output_Oli_${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadXlsx = () => {
    const worksheets = buildSpreadsheetWorksheets({
      sheets: targetSheets,
      overrides,
      fallbackStorageCode,
      options: {
        includeOutput: true,
        includeLogSheet: false,
        includeStockIn: false,
        includeMasterTabs: true,
        splitGreaseAndCoolant,
      },
    });
    const suffix =
      scope === 'active'
        ? (activeSheet.date || 'log').replace(/[^a-zA-Z0-9_-]/g, '-')
        : 'semua_lembar';
    downloadExcelWorkbook(worksheets, `Format_Output_Oli_${suffix}.xlsx`);
  };

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6">
      <datalist id="master-material-code-options">
        {MATERIAL_CODES.map((m) => (
          <option key={m.materialCode} value={m.materialCode}>
            {m.oilName}
          </option>
        ))}
      </datalist>
      <datalist id="master-unit-code-options">
        {UNIT_CODES.map((u) => (
          <option key={u.unitCode} value={u.unitCode}>
            {u.codeAlias}
          </option>
        ))}
      </datalist>
      <datalist id="master-code-alias-options">
        {uniqueCodeAliases.map((u) => (
          <option key={u.codeAlias} value={u.codeAlias}>
            {u.unitCode}
          </option>
        ))}
      </datalist>

      {/* Page Heading & Primary Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Format Output Inputan Oli
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Konversi otomatis dari data Lembar Log ke format 10 kolom standar
            upload beserta referensi Master Kode.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyTsv}
            disabled={outputRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Tersalin ke Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span>Salin Tabel (Excel)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadXlsx}
            disabled={outputRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>Unduh Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={outputRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Unduh CSV</span>
          </button>
        </div>
      </div>

      <SpreadsheetConnectionBar
        sheetsToSync={targetSheets}
        overrides={overrides}
        fallbackStorageCode={fallbackStorageCode}
        splitGreaseAndCoolant={splitGreaseAndCoolant}
        primaryConfig={primaryConfig}
        onPrimaryConfigChange={onPrimaryConfigChange}
        onOpenSetupModal={onOpenSendSheets}
        syncTick={syncTick}
        onSyncCompleted={onSyncCompleted}
      />

      {/* Sub-navigation between Output Table and 4 Master Code Reference Tables */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div
          role="tablist"
          aria-label="Pilihan tampilan format output dan master kode"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'output'}
            onClick={() => setSubTab('output')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'output'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tabel Hasil ({outputRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'unit'}
            onClick={() => setSubTab('unit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'unit'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Unit Code ({UNIT_CODES.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'storage'}
            onClick={() => setSubTab('storage')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'storage'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Storage Loc. ({WAREHOUSE_LOCATIONS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'component'}
            onClick={() => setSubTab('component')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'component'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Compnent ({COMPARTEMENTS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'typeOfOut'}
            onClick={() => setSubTab('typeOfOut')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'typeOfOut'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Type Of Out ({TYPE_OF_OUT_OPTIONS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'material'}
            onClick={() => setSubTab('material')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'material'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Material Code ({MATERIAL_CODES.length})
          </button>
        </div>

        {subTab === 'output' && hasOverrides && (
          <button
            type="button"
            onClick={onResetOverrides}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Penyesuaian Manual</span>
          </button>
        )}
      </div>

      {subTab === 'output' && (
        <>
          {/* Filter & Mapping Toolbar */}
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setScope('active')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    scope === 'active'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lembar Aktif ({formatDisplayDate(activeSheet.date)} ·{' '}
                  {activeSheet.workingShift})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    scope === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Lembar ({sheets.length})
                </button>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={splitGreaseAndCoolant}
                  onChange={(e) => setSplitGreaseAndCoolant(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
                />
                <span>Pecah Greasing &amp; Collant jadi baris terpisah</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="default-storage-code-select"
                className="text-xs font-semibold text-slate-600"
              >
                Default Storage Loc.:
              </label>
              <select
                id="default-storage-code-select"
                value={fallbackStorageCode}
                onChange={(e) => onChangeFallbackStorageCode(e.target.value)}
                className="text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {WAREHOUSE_LOCATIONS.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.code} — {loc.warehouseName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 10-Column Output Table matching user's exact format template */}
          {outputRows.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
              <p className="text-sm font-medium text-slate-800">
                Belum ada baris pemakaian oli yang terisi pada lembar ini.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Isi data pada tab Lembar Log terlebih dahulu, maka tabel hasil
                akan otomatis terbentuk di sini.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  data-testid="output-format-table"
                  className="w-full border-collapse text-xs"
                >
                  <thead>
                    <tr className="bg-[#000080] text-white text-center font-semibold">
                      {OUTPUT_HEADERS.map((header) => (
                        <th
                          key={header}
                          className="border border-slate-400/50 px-2.5 py-2 whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outputRows.map((row, idx) => {
                      const matchedOilName = materialNameByCode.get(
                        row.materialCode.trim().toUpperCase()
                      );
                      const rowBg =
                        idx % 2 === 0 ? 'bg-[#D9E2F3]/55' : 'bg-white';

                      return (
                        <tr
                          key={row.rowKey}
                          className={`${rowBg} hover:bg-amber-50/60 transition-colors`}
                        >
                          {/* 1. Unit Code* */}
                          <td className="border border-slate-300 p-0 min-w-[95px]">
                            <input
                              type="text"
                              list="master-unit-code-options"
                              aria-label={`Baris ${idx + 1} Unit Code`}
                              value={row.unitCode}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  unitCode: e.target.value,
                                })
                              }
                              className="w-full bg-transparent px-2 py-1.5 font-semibold text-slate-900 focus:outline-none focus:bg-white"
                            />
                          </td>

                          {/* 2. Code Alias */}
                          <td className="border border-slate-300 p-0 min-w-[105px]">
                            <input
                              type="text"
                              list="master-code-alias-options"
                              aria-label={`Baris ${idx + 1} Code Alias`}
                              value={row.codeAlias}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  codeAlias: e.target.value,
                                })
                              }
                              className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white"
                            />
                          </td>

                          {/* 3. Date YYYYMMDD* */}
                          <td className="border border-slate-300 px-2 py-1.5 text-center font-data-mono text-slate-900 whitespace-nowrap">
                            {row.dateYYYYMMDD || '-'}
                          </td>

                          {/* 4. Time HH:MM* */}
                          <td className="border border-slate-300 px-2 py-1.5 text-center font-data-mono text-slate-900 whitespace-nowrap">
                            {row.timeHHMM || '-'}
                          </td>

                          {/* 5. Compnent* */}
                          <td className="border border-slate-300 p-0 min-w-[125px]">
                            <select
                              aria-label={`Baris ${idx + 1} Compnent`}
                              value={row.componentCode}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  componentCode: e.target.value,
                                })
                              }
                              className={`w-full bg-transparent px-1.5 py-1.5 font-data-mono focus:outline-none focus:bg-white cursor-pointer ${
                                !row.componentCode
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-slate-900'
                              }`}
                            >
                              <option value="">-- Pilih --</option>
                              {COMPARTEMENTS.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.code} ({c.compartement})
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 6. Type Of Out */}
                          <td className="border border-slate-300 p-0 min-w-[130px]">
                            <select
                              aria-label={`Baris ${idx + 1} Type Of Out`}
                              value={row.typeOfOutCode}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  typeOfOutCode: e.target.value,
                                })
                              }
                              className={`w-full bg-transparent px-1.5 py-1.5 font-data-mono focus:outline-none focus:bg-white cursor-pointer ${
                                !row.typeOfOutCode
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-slate-900'
                              }`}
                            >
                              <option value="">-- Pilih --</option>
                              {TYPE_OF_OUT_OPTIONS.map((t) => (
                                <option key={t.code} value={t.code}>
                                  {t.code} — {t.typeOfOut}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 7. Code Storage Loc. */}
                          <td className="border border-slate-300 p-0 min-w-[100px]">
                            <select
                              aria-label={`Baris ${idx + 1} Code Storage Loc`}
                              value={row.storageLocCode}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  storageLocCode: e.target.value,
                                })
                              }
                              className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white cursor-pointer"
                            >
                              <option value="">-- Pilih --</option>
                              {WAREHOUSE_LOCATIONS.map((loc) => (
                                <option key={loc.code} value={loc.code}>
                                  {loc.code}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 8. Hm/Km* */}
                          <td className="border border-slate-300 px-2 py-1.5 text-right font-data-mono text-slate-900 whitespace-nowrap">
                            {row.hmKm || '-'}
                          </td>

                          {/* 9. Material Code* */}
                          <td className="border border-slate-300 p-0 min-w-[190px]">
                            <input
                              type="text"
                              list="master-material-code-options"
                              aria-label={`Baris ${idx + 1} Material Code`}
                              title={
                                matchedOilName
                                  ? `${row.materialCode} — ${matchedOilName}`
                                  : `Input asli: ${row.rawOilDescription || row.mediumKind}`
                              }
                              value={row.materialCode}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  materialCode: e.target.value,
                                })
                              }
                              placeholder="Cari kode..."
                              className="w-full bg-transparent px-2 py-1.5 font-data-mono font-medium text-slate-900 focus:outline-none focus:bg-white"
                            />
                          </td>

                          {/* 10. Qty* (Liter) */}
                          <td className="border border-slate-300 p-0 min-w-[78px]">
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Baris ${idx + 1} Qty Liter`}
                              value={row.qtyLiter}
                              onChange={(e) =>
                                onUpdateOverride(row.rowKey, {
                                  qtyLiter: e.target.value,
                                })
                              }
                              className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono font-semibold text-slate-900 focus:outline-none focus:bg-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-2.5 text-xs text-slate-500">
            Catatan pemetaan otomatis: Status <strong className="text-slate-700">PM</strong> → Type{' '}
            <strong className="text-slate-700">1</strong>,{' '}
            <strong className="text-slate-700">BD</strong> →{' '}
            <strong className="text-slate-700">2</strong>,{' '}
            <strong className="text-slate-700">ADD</strong> →{' '}
            <strong className="text-slate-700">3</strong>. Kolom{' '}
            <strong className="text-slate-700">Compnent*</strong> &amp;{' '}
            <strong className="text-slate-700">Material Code*</strong> dapat
            langsung diubah di tabel jika perlu penyesuaian.
          </p>
        </>
      )}

      {/* Master Code Reference Views */}
      {subTab === 'unit' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-3xl">
          <div className="p-3 border-b border-slate-200 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Cari Unit Code atau Code Alias"
                value={unitQuery}
                onChange={(e) => setUnitQuery(e.target.value)}
                placeholder="Cari Unit Code atau Code Alias..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredUnits.length} dari {UNIT_CODES.length} unit
            </span>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-[#000080] text-white text-left">
                  <th className="py-2.5 px-4 w-[180px]">Unit Code</th>
                  <th className="py-2.5 px-4">Code Alias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUnits.map((u) => (
                  <tr key={u.unitCode} className="hover:bg-slate-50">
                    <td className="py-2 px-4 font-data-mono font-semibold text-slate-900">
                      {u.unitCode}
                    </td>
                    <td className="py-2 px-4 font-data-mono text-slate-800">
                      {u.codeAlias}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'storage' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-3xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#000080] text-white text-left">
                <th className="py-2.5 px-4 w-[120px]">Code</th>
                <th className="py-2.5 px-4">Warehouse Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {WAREHOUSE_LOCATIONS.map((loc) => (
                <tr key={loc.code} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-data-mono font-semibold text-slate-900">
                    {loc.code}
                  </td>
                  <td className="py-2 px-4 text-slate-800">
                    {loc.warehouseName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'component' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-3xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#000080] text-white text-left">
                <th className="py-2.5 px-4 w-[120px]">Code</th>
                <th className="py-2.5 px-4">Compartement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {COMPARTEMENTS.map((c) => (
                <tr key={c.code} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-data-mono font-semibold text-slate-900">
                    {c.code}
                  </td>
                  <td className="py-2 px-4 text-slate-800">{c.compartement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'typeOfOut' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-2xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#000080] text-white text-left">
                <th className="py-2.5 px-4 w-[100px]">Code</th>
                <th className="py-2.5 px-4">Type of Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {TYPE_OF_OUT_OPTIONS.map((t) => (
                <tr key={t.code} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-data-mono font-semibold text-slate-900">
                    {t.code}
                  </td>
                  <td className="py-2 px-4 text-slate-800">{t.typeOfOut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'material' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Cari Material Code atau Oil Name"
                value={masterQuery}
                onChange={(e) => setMasterQuery(e.target.value)}
                placeholder="Cari Material Code atau nama oli..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredMaterials.length} dari {MATERIAL_CODES.length}{' '}
              item
            </span>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-[#000080] text-white text-left">
                  <th className="py-2.5 px-4 w-[240px]">Material Code</th>
                  <th className="py-2.5 px-4">Oil Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredMaterials.map((m) => (
                  <tr key={m.materialCode} className="hover:bg-slate-50">
                    <td className="py-2 px-4 font-data-mono font-semibold text-slate-900">
                      {m.materialCode}
                    </td>
                    <td className="py-2 px-4 text-slate-800">{m.oilName}</td>
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
