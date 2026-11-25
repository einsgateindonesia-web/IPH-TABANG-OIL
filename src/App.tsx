import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CopyPlus,
  Download,
  Eraser,
  FilePlus2,
  FileSpreadsheet,
  Send,
} from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { OutputFormatView } from './components/OutputFormatView';
import { PrintableLogSheet } from './components/PrintableLogSheet';
import { SendToSheetsModal } from './components/SendToSheetsModal';
import { SheetHistoryView } from './components/SheetHistoryView';
import { SpreadsheetConnectionBar } from './components/SpreadsheetConnectionBar';
import { SpreadsheetView } from './components/SpreadsheetView';
import { TopBar } from './components/TopBar';
import { UsageSummaryView } from './components/UsageSummaryView';
import type {
  ActiveTab,
  LogSheet,
  OutputOverrideMap,
  OutputRowOverride,
  PrimarySpreadsheetConfig,
} from './types/logSheet';
import { downloadExcelWorkbook } from './utils/excelExport';
import {
  calculateFlowmeterLiters,
  computeSheetTotals,
  createBlankSheet,
  createNextShiftSheet,
  detectSheetAnomalies,
  formatDisplayDate,
  sheetToCsv,
} from './utils/logSheet';
import { buildSpreadsheetWorksheets } from './utils/spreadsheetBuilder';
import {
  loadPrimarySpreadsheet,
  loadStoredSheets,
  saveStoredSheets,
} from './utils/storage';

export default function App() {
  const initial = useMemo(() => loadStoredSheets(), []);
  const [sheets, setSheets] = useState<LogSheet[]>(initial.sheets);
  const [activeSheetId, setActiveSheetId] = useState<string>(
    initial.activeSheetId
  );
  const [outputOverrides, setOutputOverrides] = useState<OutputOverrideMap>(
    initial.outputOverrides
  );
  const [fallbackStorageCode, setFallbackStorageCode] = useState<string>(
    initial.fallbackStorageCode
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('sheet');
  const [confirmClear, setConfirmClear] = useState(false);
  const [showSendSheets, setShowSendSheets] = useState(false);
  const [primarySpreadsheet, setPrimarySpreadsheet] =
    useState<PrimarySpreadsheetConfig | null>(() => loadPrimarySpreadsheet());
  const [syncTick, setSyncTick] = useState(0);

  const activeSheet = useMemo(
    () => sheets.find((s) => s.id === activeSheetId) ?? sheets[0],
    [sheets, activeSheetId]
  );

  useEffect(() => {
    saveStoredSheets(
      sheets,
      activeSheet.id,
      outputOverrides,
      fallbackStorageCode
    );
  }, [sheets, activeSheet.id, outputOverrides, fallbackStorageCode]);

  const totals = useMemo(() => computeSheetTotals(activeSheet), [activeSheet]);
  const anomalies = useMemo(
    () => detectSheetAnomalies(activeSheet),
    [activeSheet]
  );

  const handleUpdateActiveSheet = (updated: LogSheet) => {
    setSheets((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  const handleUpdateSheetById = (
    sheetId: string,
    updater: (sheet: LogSheet) => LogSheet
  ) => {
    setSheets((prev) =>
      prev.map((item) => (item.id === sheetId ? updater(item) : item))
    );
  };

  const handleToggleAutoCalc = (enabled: boolean) => {
    const nextRows = activeSheet.rows.map((row) => {
      if (!enabled || row.flowmeterManualOverride) return row;
      const calc = calculateFlowmeterLiters(
        row.flowmeterAwal,
        row.flowmeterAkhir
      );
      return {
        ...row,
        flowmeterLiter: calc.liter || row.flowmeterLiter,
      };
    });

    handleUpdateActiveSheet({
      ...activeSheet,
      autoCalcFlowmeter: enabled,
      rows: nextRows,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCreateBlankSheet = () => {
    const blank = createBlankSheet({
      storageLocation: activeSheet.storageLocation,
    });
    setSheets((prev) => [blank, ...prev]);
    setActiveSheetId(blank.id);
    setActiveTab('sheet');
    setConfirmClear(false);
  };

  const handleCreateNextShift = (sourceSheet: LogSheet = activeSheet) => {
    const next = createNextShiftSheet(sourceSheet);
    setSheets((prev) => [next, ...prev]);
    setActiveSheetId(next.id);
    setActiveTab('sheet');
    setConfirmClear(false);
  };

  const handleClearActiveSheet = () => {
    const blankTemplate = createBlankSheet({
      id: activeSheet.id,
      date: activeSheet.date,
      workingShift: activeSheet.workingShift,
      storageLocation: activeSheet.storageLocation,
      autoCalcFlowmeter: activeSheet.autoCalcFlowmeter,
      createdAt: activeSheet.createdAt,
    });
    handleUpdateActiveSheet(blankTemplate);
    setConfirmClear(false);
  };

  const handleDeleteSheet = (sheetId: string) => {
    setSheets((prev) => {
      if (prev.length <= 1) return prev;
      const remaining = prev.filter((s) => s.id !== sheetId);
      if (activeSheetId === sheetId && remaining.length > 0) {
        setActiveSheetId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleSelectSheet = (sheetId: string) => {
    setActiveSheetId(sheetId);
    setActiveTab('sheet');
    setConfirmClear(false);
  };

  const handleOpenOutputForSheet = (sheetId: string) => {
    setActiveSheetId(sheetId);
    setActiveTab('output');
    setConfirmClear(false);
  };

  const handleUpdateOutputOverride = (
    rowKey: string,
    patch: Partial<OutputRowOverride>
  ) => {
    setOutputOverrides((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] ?? {}),
        ...patch,
      },
    }));
  };

  const handleResetOutputOverrides = () => {
    setOutputOverrides({});
  };

  const handleExportActiveCsv = () => {
    const csv = sheetToCsv(activeSheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeDate = (activeSheet.date || 'log').replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeShift = (activeSheet.workingShift || 'shift').replace(
      /\s+/g,
      '_'
    );
    a.download = `Oil_Log_${safeDate}_${safeShift}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportActiveXlsx = () => {
    const worksheets = buildSpreadsheetWorksheets({
      sheets: [activeSheet],
      overrides: outputOverrides,
      fallbackStorageCode,
      options: {
        includeOutput: true,
        includeLogSheet: true,
        includeStockIn: true,
        includeMasterTabs: true,
        splitGreaseAndCoolant: true,
      },
    });
    const safeDate = (activeSheet.date || 'log').replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeShift = (activeSheet.workingShift || 'shift').replace(
      /\s+/g,
      '_'
    );
    downloadExcelWorkbook(worksheets, `Spreadsheet_Oli_${safeDate}_${safeShift}.xlsx`);
  };

  const handlePrint = () => {
    if (activeTab !== 'sheet') {
      setActiveTab('sheet');
      setTimeout(() => {
        window.print();
      }, 120);
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900">
      <TopBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onPrint={handlePrint}
        sheetCount={sheets.length}
      />

      <main>
        {activeTab === 'dashboard' && (
          <DashboardView
            sheets={sheets}
            onOpenSheet={handleSelectSheet}
            onOpenOutputForSheet={handleOpenOutputForSheet}
            onCreateBlankSheet={handleCreateBlankSheet}
          />
        )}

        {activeTab === 'sheet' && (
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-4 print:p-0 print:max-w-none">
            {/* Workspace Control Strip (Hidden on Print) */}
            <div className="no-print bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 mb-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <label
                  htmlFor="active-sheet-select"
                  className="text-xs font-semibold text-slate-600 whitespace-nowrap"
                >
                  Lembar:
                </label>
                <select
                  id="active-sheet-select"
                  aria-label="Pilih lembar log aktif"
                  value={activeSheet.id}
                  onChange={(e) => handleSelectSheet(e.target.value)}
                  className="max-w-[235px] sm:max-w-[260px] truncate text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDisplayDate(s.date) || 'Tanpa Tgl'} —{' '}
                      {s.workingShift || 'Tanpa Shift'} (
                      {s.storageLocation || 'Lokasi'})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleCreateBlankSheet}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Lembar Baru</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateNextShift(activeSheet)}
                  title="Buat lembar shift berikutnya dan bawa pembacaan Flowmeter Akhir terakhir"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  <CopyPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Lanjut Shift</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <label
                  title="Otomatis hitung Liter dari Flowmeter Akhir − Awal"
                  className="inline-flex items-center gap-1.5 mr-1 text-xs font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap"
                >
                  <input
                    type="checkbox"
                    checked={activeSheet.autoCalcFlowmeter}
                    onChange={(e) => handleToggleAutoCalc(e.target.checked)}
                    className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
                  />
                  <span>Auto Liter</span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowSendSheets(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Send
                    className="w-3.5 h-3.5 text-emerald-700"
                    aria-hidden="true"
                  />
                  <span>Kirim ke Sheets</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportActiveXlsx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  <FileSpreadsheet
                    className="w-3.5 h-3.5 text-emerald-700"
                    aria-hidden="true"
                  />
                  <span>Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportActiveCsv}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>CSV</span>
                </button>

                {confirmClear ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleClearActiveSheet}
                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                    >
                      Ya, Kosongkan
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kosongkan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Unboxed Totals & Validation Metadata Strip (Hidden on Print) */}
            <div className="no-print flex flex-wrap items-center justify-between gap-2 px-1 mb-3 text-xs text-slate-600">
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums"
                data-testid="sheet-live-totals"
              >
                <span>
                  Terisi:{' '}
                  <strong className="text-slate-900 font-data-mono">
                    {totals.filledConsumptionRows}/20
                  </strong>{' '}
                  baris
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Flowmeter:{' '}
                  <strong className="text-slate-900 font-data-mono">
                    {totals.totalFlowmeterLiters} L
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Greasing:{' '}
                  <strong className="text-slate-900 font-data-mono">
                    {totals.totalGreasingKg} Kg
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Collant:{' '}
                  <strong className="text-slate-900 font-data-mono">
                    {totals.totalCollantLiters} L
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Stock In:{' '}
                  <strong className="text-slate-900 font-data-mono">
                    {totals.totalStockInQty} Qty
                  </strong>
                </span>
              </div>

              <div className="text-slate-500">
                Ketik langsung di kolom · Gunakan Panah (↑↓←→) atau Enter untuk
                pindah sel · F2 edit teks
              </div>
            </div>

            {anomalies.length > 0 && (
              <div
                role="alert"
                className="no-print mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                <AlertTriangle
                  className="w-4 h-4 shrink-0 mt-0.5 text-red-600"
                  aria-hidden="true"
                />
                <div>
                  <span className="font-semibold">
                    Periksa angka Flowmeter:
                  </span>{' '}
                  {anomalies.map((a) => a.message).join(' · ')}
                </div>
              </div>
            )}

            {/* Direct Google Sheets Live Connection Bar (Hidden on Print) */}
            <SpreadsheetConnectionBar
              sheetsToSync={[activeSheet]}
              overrides={outputOverrides}
              fallbackStorageCode={fallbackStorageCode}
              primaryConfig={primarySpreadsheet}
              onPrimaryConfigChange={setPrimarySpreadsheet}
              onOpenSetupModal={() => setShowSendSheets(true)}
              syncTick={syncTick}
              onSyncCompleted={() => setSyncTick((t) => t + 1)}
            />

            {/* Exact Reference Printable Form */}
            <PrintableLogSheet
              sheet={activeSheet}
              onChange={handleUpdateActiveSheet}
            />
          </div>
        )}

        {activeTab === 'output' && (
          <OutputFormatView
            sheets={sheets}
            activeSheet={activeSheet}
            overrides={outputOverrides}
            fallbackStorageCode={fallbackStorageCode}
            onChangeFallbackStorageCode={setFallbackStorageCode}
            onUpdateOverride={handleUpdateOutputOverride}
            onResetOverrides={handleResetOutputOverrides}
            primaryConfig={primarySpreadsheet}
            onPrimaryConfigChange={setPrimarySpreadsheet}
            onOpenSendSheets={() => setShowSendSheets(true)}
            syncTick={syncTick}
            onSyncCompleted={() => setSyncTick((t) => t + 1)}
          />
        )}

        {activeTab === 'spreadsheet' && (
          <SpreadsheetView
            sheets={sheets}
            activeSheet={activeSheet}
            overrides={outputOverrides}
            fallbackStorageCode={fallbackStorageCode}
            primaryConfig={primarySpreadsheet}
            onSetPrimaryConfig={setPrimarySpreadsheet}
            onOpenSetupModal={() => setShowSendSheets(true)}
            onUpdateSheet={handleUpdateSheetById}
            onUpdateOverride={handleUpdateOutputOverride}
            onOpenOutputTab={() => setActiveTab('output')}
            syncTick={syncTick}
            onSynced={() => setSyncTick((t) => t + 1)}
          />
        )}

        {activeTab === 'history' && (
          <SheetHistoryView
            sheets={sheets}
            activeSheetId={activeSheet.id}
            onSelectSheet={handleSelectSheet}
            onCreateBlank={handleCreateBlankSheet}
            onCreateNextShift={handleCreateNextShift}
            onDeleteSheet={handleDeleteSheet}
          />
        )}

        {activeTab === 'summary' && (
          <UsageSummaryView
            sheets={sheets}
            onOpenSheet={handleSelectSheet}
          />
        )}
      </main>

      <SendToSheetsModal
        open={showSendSheets}
        onClose={() => setShowSendSheets(false)}
        activeSheet={activeSheet}
        overrides={outputOverrides}
        fallbackStorageCode={fallbackStorageCode}
        primaryConfig={primarySpreadsheet}
        onSetPrimaryConfig={setPrimarySpreadsheet}
        onSynced={() => setSyncTick((t) => t + 1)}
      />
    </div>
  );
}
