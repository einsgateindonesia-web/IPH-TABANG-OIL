import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  LogOut,
  RefreshCw,
  Table2,
  X,
} from 'lucide-react';
import type {
  LinkedGoogleSpreadsheet,
  LogSheet,
  OutputOverrideMap,
  PrimarySpreadsheetConfig,
  SpreadsheetIncludeOptions,
} from '../types/logSheet';
import { downloadExcelWorkbook } from '../utils/excelExport';
import {
  appendGoogleSpreadsheet,
  createGoogleSpreadsheet,
  fetchSpreadsheetMetadata,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
  SheetsAuthExpiredError,
  updateGoogleSpreadsheet,
  type SpreadsheetMetadata,
} from '../utils/googleAuth';
import { formatDisplayDate } from '../utils/logSheet';
import {
  buildSpreadsheetWorksheets,
  columnIndexToLetter,
  computeRowSyncKey,
  extractSpreadsheetId,
  type WorksheetSpec,
} from '../utils/spreadsheetBuilder';
import {
  loadLinkedSpreadsheets,
  loadSyncedRowKeys,
  saveLinkedSpreadsheets,
  savePrimarySpreadsheet,
  saveSyncedRowKeys,
} from '../utils/storage';
import { SpreadsheetConnectionBar } from './SpreadsheetConnectionBar';

interface SpreadsheetViewProps {
  sheets: LogSheet[];
  activeSheet: LogSheet;
  overrides: OutputOverrideMap;
  fallbackStorageCode: string;
  primaryConfig: PrimarySpreadsheetConfig | null;
  onSetPrimaryConfig: (config: PrimarySpreadsheetConfig | null) => void;
  onOpenSetupModal: () => void;
  syncTick: number;
  onSynced: () => void;
}

type ConfirmActionState =
  | {
      mode: 'create';
      title: string;
      worksheets: WorksheetSpec[];
    }
  | {
      mode: 'update';
      updateStrategy: 'append' | 'overwrite';
      meta: SpreadsheetMetadata;
      worksheets: WorksheetSpec[];
    };

export function SpreadsheetView({
  sheets,
  activeSheet,
  overrides,
  fallbackStorageCode,
  primaryConfig,
  onSetPrimaryConfig,
  onOpenSetupModal,
  syncTick,
  onSynced,
}: SpreadsheetViewProps) {
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [options, setOptions] = useState<SpreadsheetIncludeOptions>({
    includeOutput: true,
    includeLogSheet: true,
    includeStockIn: true,
    includeMasterTabs: true,
    splitGreaseAndCoolant: true,
  });

  const [spreadsheetTitle, setSpreadsheetTitle] = useState(() => {
    const d = formatDisplayDate(activeSheet.date) || 'Log';
    return `IP PLANT HAULING — Oil & Lube Log (${d} ${activeSheet.workingShift || ''})`.trim();
  });

  useEffect(() => {
    const d = formatDisplayDate(activeSheet.date) || 'Log';
    const nextDefault =
      scope === 'active'
        ? `IP PLANT HAULING — Oil & Lube Log (${d} ${activeSheet.workingShift || ''})`.trim()
        : `IP PLANT HAULING — Rekap Oil & Lube Log (${sheets.length} Lembar)`;
    setSpreadsheetTitle(nextDefault);
  }, [scope, activeSheet.date, activeSheet.workingShift, sheets.length]);

  const targetSheets = useMemo(
    () => (scope === 'active' ? [activeSheet] : sheets),
    [scope, activeSheet, sheets]
  );

  const worksheets = useMemo(
    () =>
      buildSpreadsheetWorksheets({
        sheets: targetSheets,
        overrides,
        fallbackStorageCode,
        options,
      }),
    [targetSheets, overrides, fallbackStorageCode, options]
  );

  const [previewTabTitle, setPreviewTabTitle] = useState<string>('Format Output');

  const activePreviewSheet = useMemo(() => {
    if (worksheets.length === 0) return null;
    return (
      worksheets.find((w) => w.title === previewTabTitle) ?? worksheets[0]
    );
  }, [worksheets, previewTabTitle]);

  // Google Auth state (access token cached in-memory only via googleAuth module)
  const [user, setUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(getAccessToken()));
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sync / existing spreadsheet state
  const [existingInput, setExistingInput] = useState('');
  const [updateStrategy, setUpdateStrategy] = useState<'append' | 'overwrite'>(
    'append'
  );
  const [linkedSpreadsheets, setLinkedSpreadsheets] = useState<
    LinkedGoogleSpreadsheet[]
  >(() => loadLinkedSpreadsheets());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInspectingMeta, setIsInspectingMeta] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setHasToken(Boolean(token));
      },
      (firebaseUser) => {
        setUser(firebaseUser);
        setHasToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const persistLinkedSpreadsheet = (item: LinkedGoogleSpreadsheet) => {
    setLinkedSpreadsheets((prev) => {
      const filtered = prev.filter(
        (x) => x.spreadsheetId !== item.spreadsheetId
      );
      const next = [item, ...filtered].slice(0, 12);
      saveLinkedSpreadsheets(next);
      return next;
    });
  };

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setHasToken(Boolean(res.accessToken));
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Login Google dibatalkan atau gagal.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setUser(null);
    setHasToken(false);
    setStatusMessage(null);
  };

  const handleDownloadXlsx = () => {
    if (worksheets.length === 0) return;
    const suffix =
      scope === 'active'
        ? `${(activeSheet.date || 'log').replace(/[^a-zA-Z0-9_-]/g, '-')}_${(
            activeSheet.workingShift || 'shift'
          ).replace(/\s+/g, '_')}`
        : `Semua_${sheets.length}_Lembar`;
    downloadExcelWorkbook(worksheets, `Spreadsheet_Oli_${suffix}.xlsx`);
  };

  const handleRequestCreateGoogleSheet = () => {
    if (worksheets.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Pilih minimal satu sheet yang akan dibuat.',
      });
      return;
    }
    setStatusMessage(null);
    setConfirmAction({
      mode: 'create',
      title: spreadsheetTitle.trim() || 'IP PLANT HAULING — Oil & Lube Log',
      worksheets,
    });
  };

  const handleRequestUpdateGoogleSheet = async (targetRaw: string) => {
    const targetId = extractSpreadsheetId(targetRaw);
    if (!targetId) {
      setStatusMessage({
        type: 'error',
        text: 'Masukkan URL atau ID Google Spreadsheet yang valid.',
      });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setHasToken(false);
      setStatusMessage({
        type: 'error',
        text: 'Silakan Sign in dengan Google terlebih dahulu.',
      });
      return;
    }
    if (worksheets.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Pilih minimal satu sheet untuk diperbarui.',
      });
      return;
    }

    setStatusMessage(null);
    setIsInspectingMeta(true);
    try {
      const meta = await fetchSpreadsheetMetadata(targetId, token);
      setConfirmAction({
        mode: 'update',
        updateStrategy,
        meta,
        worksheets,
      });
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        setHasToken(false);
      }
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal membaca metadata Google Spreadsheet target.',
      });
    } finally {
      setIsInspectingMeta(false);
    }
  };

  const handleConfirmExecution = async () => {
    if (!confirmAction) return;
    const token = getAccessToken();
    if (!token) {
      setHasToken(false);
      setConfirmAction(null);
      setStatusMessage({
        type: 'error',
        text: 'Sesi Google berakhir. Silakan Sign in with Google kembali.',
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const result =
        confirmAction.mode === 'create'
          ? await createGoogleSpreadsheet(
              confirmAction.title,
              confirmAction.worksheets,
              token
            )
          : confirmAction.updateStrategy === 'append'
            ? await appendGoogleSpreadsheet(
                confirmAction.meta.spreadsheetId,
                confirmAction.worksheets,
                token
              )
            : await updateGoogleSpreadsheet(
                confirmAction.meta.spreadsheetId,
                confirmAction.worksheets,
                token
              );

      persistLinkedSpreadsheet({
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        title: result.title,
        updatedAt: new Date().toISOString(),
      });

      const syncKeys =
        confirmAction.mode === 'create' ||
        (confirmAction.mode === 'update' &&
          confirmAction.updateStrategy === 'overwrite')
          ? new Set<string>()
          : loadSyncedRowKeys(result.spreadsheetId);
      for (const ws of confirmAction.worksheets) {
        for (const row of ws.rows) {
          syncKeys.add(computeRowSyncKey(ws.title, row));
        }
      }
      saveSyncedRowKeys(result.spreadsheetId, syncKeys);

      const nextPrimary: PrimarySpreadsheetConfig = {
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        title: result.title,
        defaultMode:
          confirmAction.mode === 'update' &&
          confirmAction.updateStrategy === 'overwrite'
            ? 'overwrite'
            : 'append',
        includeOutput: options.includeOutput,
        includeLogSheet: options.includeLogSheet,
        includeStockIn: options.includeStockIn,
        includeMasterTabs: options.includeMasterTabs,
        lastSyncedAt: new Date().toISOString(),
      };
      savePrimarySpreadsheet(nextPrimary);
      onSetPrimaryConfig(nextPrimary);
      onSynced();

      setExistingInput(result.spreadsheetUrl);
      setConfirmAction(null);
      setStatusMessage({
        type: 'success',
        text:
          confirmAction.mode === 'create'
            ? `Google Spreadsheet "${result.title}" berhasil dibuat (${confirmAction.worksheets.length} sheet) & terhubung sebagai Master.`
            : confirmAction.updateStrategy === 'append'
              ? `Baris baru berhasil ditambahkan ke Google Spreadsheet "${result.title}".`
              : `Google Spreadsheet "${result.title}" berhasil diperbarui (ditimpa).`,
        url: result.spreadsheetUrl,
      });
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        setHasToken(false);
      }
      setConfirmAction(null);
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan saat memproses Google Spreadsheet.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleOption = (key: keyof SpreadsheetIncludeOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const previewRows = activePreviewSheet
    ? activePreviewSheet.rows.slice(0, 120)
    : [];

  return (
    <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Page Title & Quick Offline Excel Action */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Spreadsheet Oli &amp; Lubricant
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Buat Google Spreadsheet langsung ke akun Google Anda atau unduh
            workbook Excel (.xlsx) multi-sheet lengkap.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadXlsx}
          disabled={worksheets.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
          <span>Unduh Excel (.xlsx)</span>
        </button>
      </div>

      <SpreadsheetConnectionBar
        sheetsToSync={targetSheets}
        overrides={overrides}
        fallbackStorageCode={fallbackStorageCode}
        splitGreaseAndCoolant={options.splitGreaseAndCoolant}
        primaryConfig={primaryConfig}
        onPrimaryConfigChange={onSetPrimaryConfig}
        onOpenSetupModal={onOpenSetupModal}
        syncTick={syncTick}
        onSyncCompleted={onSynced}
      />

      {/* Workbook Scope & Tab Selection Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">
              Sumber Data:
            </span>
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
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.splitGreaseAndCoolant}
              onChange={() => toggleOption('splitGreaseAndCoolant')}
              className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
            />
            <span>Pecah Greasing &amp; Collant di Format Output</span>
          </label>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="font-semibold text-slate-600">
            Sheet yang Disertakan:
          </span>
          <label className="inline-flex items-center gap-1.5 text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.includeOutput}
              onChange={() => toggleOption('includeOutput')}
              className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
            />
            <span>Format Output (10 Kolom)</span>
          </label>
          <label className="inline-flex items-center gap-1.5 text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.includeLogSheet}
              onChange={() => toggleOption('includeLogSheet')}
              className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
            />
            <span>Log Sheet (Konsumsi)</span>
          </label>
          <label className="inline-flex items-center gap-1.5 text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.includeStockIn}
              onChange={() => toggleOption('includeStockIn')}
              className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
            />
            <span>Stock In</span>
          </label>
          <label className="inline-flex items-center gap-1.5 text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.includeMasterTabs}
              onChange={() => toggleOption('includeMasterTabs')}
              className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
            />
            <span>
              Master Kode (Storage Loc, Compnent, Type Of Out, Material, Unit
              Code)
            </span>
          </label>
        </div>
      </div>

      {/* Google Sheets Integration Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <Table2 className="w-5 h-5 text-emerald-700" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Google Sheets (Online)
              </h2>
              <p className="text-xs text-slate-600">
                Buat atau perbarui Google Spreadsheet langsung dengan header
                navy (#000080) &amp; tabel terformat rapi.
              </p>
            </div>
          </div>

          {hasToken && user ? (
            <div className="flex items-center gap-3 self-start sm:self-center">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-900">
                  {user.displayName || 'Akun Google'}
                </p>
                <p className="text-[11px] text-slate-500">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoggingIn}
              className="gsi-material-button inline-flex items-center gap-2.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-md shadow-xs text-sm font-medium text-slate-800 transition-colors cursor-pointer disabled:opacity-60 self-start sm:self-center"
            >
              <span className="w-4 h-4 shrink-0 inline-block">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="block w-full h-full"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              </span>
              <span>
                {isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}
              </span>
            </button>
          )}
        </div>

        {statusMessage && (
          <div
            role="status"
            className={`rounded-md border px-3.5 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-start gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2
                  className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <span>{statusMessage.text}</span>
            </div>
            {statusMessage.url && (
              <a
                href={statusMessage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded text-xs shrink-0 self-start sm:self-center"
              >
                <span>Buka Google Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        {hasToken ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Create New Google Spreadsheet */}
            <div className="border border-slate-200 rounded-md p-3.5 space-y-2.5 bg-slate-50/50">
              <label
                htmlFor="new-gsheet-title"
                className="block text-xs font-semibold text-slate-800"
              >
                Buat Google Spreadsheet Baru
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="new-gsheet-title"
                  type="text"
                  value={spreadsheetTitle}
                  onChange={(e) => setSpreadsheetTitle(e.target.value)}
                  placeholder="Nama Google Spreadsheet..."
                  className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={handleRequestCreateGoogleSheet}
                  disabled={worksheets.length === 0 || isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md whitespace-nowrap cursor-pointer"
                >
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Buat Spreadsheet</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Membuat {worksheets.length} tab di Google Sheets (
                {worksheets.map((w) => w.title).join(', ')}).
              </p>
            </div>

            {/* Update Existing Google Spreadsheet */}
            <div className="border border-slate-200 rounded-md p-3.5 space-y-2.5 bg-slate-50/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="existing-gsheet-url"
                  className="block text-xs font-semibold text-slate-800"
                >
                  Kirim ke Google Spreadsheet yang Sudah Ada
                </label>
                <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 rounded text-[11px]">
                  <button
                    type="button"
                    onClick={() => setUpdateStrategy('append')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      updateStrategy === 'append'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Tambah Baris
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateStrategy('overwrite')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      updateStrategy === 'overwrite'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Timpa Isi
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="existing-gsheet-url"
                  type="text"
                  value={existingInput}
                  onChange={(e) => setExistingInput(e.target.value)}
                  placeholder="Tempel URL atau Spreadsheet ID..."
                  className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs sm:text-sm text-slate-900 font-data-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => handleRequestUpdateGoogleSheet(existingInput)}
                  disabled={
                    !existingInput.trim() ||
                    worksheets.length === 0 ||
                    isInspectingMeta ||
                    isSubmitting
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded-md whitespace-nowrap cursor-pointer"
                >
                  {isInspectingMeta ? (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {updateStrategy === 'append'
                      ? 'Tambah Baris'
                      : 'Perbarui Isi'}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {updateStrategy === 'append'
                  ? 'Menambahkan baris baru di bawah data lama pada Spreadsheet tujuan.'
                  : 'Membersihkan tab target yang cocok dan menulis ulang seluruh baris.'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600">
            Klik <strong>Sign in with Google</strong> di atas untuk membuat
            atau memperbarui Google Spreadsheet langsung di Google Drive Anda,
            atau gunakan tombol <strong>Unduh Excel (.xlsx)</strong> untuk file
            spreadsheet offline.
          </p>
        )}

        {/* Linked Google Spreadsheets Quick Access */}
        {linkedSpreadsheets.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Riwayat Google Spreadsheet Terakhir:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {linkedSpreadsheets.slice(0, 4).map((item) => {
                const isPrimary =
                  primaryConfig?.spreadsheetId === item.spreadsheetId;
                return (
                  <div
                    key={item.spreadsheetId}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-xs ${
                      isPrimary
                        ? 'border-emerald-300 bg-emerald-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900 truncate">
                          {item.title}
                        </p>
                        {isPrimary && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                            Master
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-data-mono truncate">
                        {item.spreadsheetId}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => {
                            const pinned: PrimarySpreadsheetConfig = {
                              spreadsheetId: item.spreadsheetId,
                              spreadsheetUrl: item.spreadsheetUrl,
                              title: item.title,
                              defaultMode:
                                updateStrategy === 'overwrite'
                                  ? 'overwrite'
                                  : 'append',
                              includeOutput: options.includeOutput,
                              includeLogSheet: options.includeLogSheet,
                              includeStockIn: options.includeStockIn,
                              includeMasterTabs: options.includeMasterTabs,
                              lastSyncedAt: item.updatedAt,
                            };
                            savePrimarySpreadsheet(pinned);
                            onSetPrimaryConfig(pinned);
                            onSynced();
                          }}
                          className="px-2 py-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded cursor-pointer"
                        >
                          Jadikan Master
                        </button>
                      )}
                      {hasToken && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRequestUpdateGoogleSheet(item.spreadsheetId)
                          }
                          className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                        >
                          Sinkron
                        </button>
                      )}
                      <a
                        href={item.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded"
                      >
                        <span>Buka</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Live Excel-Style Workbook Preview */}
      <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              Pratinjau Workbook Spreadsheet
            </span>
            {activePreviewSheet && (
              <span className="text-xs text-slate-500 tabular-nums">
                · {activePreviewSheet.rows.length} baris ×{' '}
                {activePreviewSheet.headers.length} kolom
              </span>
            )}
          </div>
          {activePreviewSheet &&
            activePreviewSheet.rows.length > previewRows.length && (
              <span className="text-[11px] text-slate-500">
                Menampilkan {previewRows.length} baris pertama dari{' '}
                {activePreviewSheet.rows.length} baris (semua baris ikut
                diekspor)
              </span>
            )}
        </div>

        {!activePreviewSheet ? (
          <div className="p-8 text-center text-sm text-slate-600">
            Centang minimal satu sheet di atas untuk melihat pratinjau
            spreadsheet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table
                data-testid="spreadsheet-preview-table"
                className="w-full border-collapse text-xs"
              >
                <thead className="sticky top-0 z-10">
                  {/* Excel Column Letters Row */}
                  <tr className="bg-slate-100 text-slate-500 text-[11px] font-data-mono">
                    <th className="w-10 border border-slate-300 bg-slate-200/70 py-1 px-1.5 text-center" />
                    {activePreviewSheet.headers.map((_, colIdx) => (
                      <th
                        key={colIdx}
                        className="border border-slate-300 py-1 px-2 text-center font-medium"
                      >
                        {columnIndexToLetter(colIdx)}
                      </th>
                    ))}
                  </tr>
                  {/* Sheet Column Header Row (#000080 Navy) */}
                  <tr className="bg-[#000080] text-white font-semibold">
                    <th className="w-10 border border-slate-400/60 bg-slate-200 text-slate-600 py-1.5 px-1.5 text-center font-data-mono text-[11px]">
                      1
                    </th>
                    {activePreviewSheet.headers.map((header, colIdx) => (
                      <th
                        key={colIdx}
                        className="border border-slate-400/50 px-2.5 py-2 whitespace-nowrap text-center"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td className="border border-slate-300 bg-slate-100 text-slate-500 text-center font-data-mono py-2">
                        2
                      </td>
                      <td
                        colSpan={activePreviewSheet.headers.length}
                        className="border border-slate-300 px-4 py-6 text-center text-slate-500"
                      >
                        Belum ada data pada sheet {activePreviewSheet.title}.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row, rowIdx) => {
                      const zebra = rowIdx % 2 === 0;
                      const rowBg = zebra
                        ? activePreviewSheet.zebraBgHex === '#D9E2F3'
                          ? 'bg-[#D9E2F3]/55'
                          : 'bg-slate-50'
                        : 'bg-white';
                      const numericCols = new Set(
                        activePreviewSheet.numericColumns ?? []
                      );

                      return (
                        <tr
                          key={rowIdx}
                          className={`${rowBg} hover:bg-amber-50/50`}
                        >
                          <td className="border border-slate-300 bg-slate-100 text-slate-500 text-center font-data-mono text-[11px] py-1 px-1.5">
                            {rowIdx + 2}
                          </td>
                          {row.map((cell, colIdx) => (
                            <td
                              key={colIdx}
                              className={`border border-slate-300 px-2.5 py-1.5 whitespace-nowrap text-slate-900 ${
                                numericCols.has(colIdx)
                                  ? 'text-right font-data-mono'
                                  : 'text-left'
                              }`}
                            >
                              {cell === '' ? '' : String(cell)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Excel-style Worksheet Tabs */}
            <div
              role="tablist"
              aria-label="Tab worksheet spreadsheet"
              className="flex items-center gap-1 px-3 py-2 bg-slate-100 border-t border-slate-300 overflow-x-auto"
            >
              {worksheets.map((ws) => {
                const isActive = ws.title === activePreviewSheet.title;
                return (
                  <button
                    key={ws.title}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setPreviewTabTitle(ws.title)}
                    className={`px-3 py-1 text-xs rounded-t border transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-white text-emerald-800 font-bold border-slate-300 border-b-2 border-b-emerald-700'
                        : 'bg-slate-200/70 text-slate-600 border-transparent hover:bg-white/70 hover:text-slate-900'
                    }`}
                  >
                    {ws.title} ({ws.rows.length})
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Explicit Confirmation Modal Before Creating/Updating Google Sheets */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-gsheet-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="confirm-gsheet-title"
                  className="text-base font-bold text-slate-900"
                >
                  {confirmAction.mode === 'create'
                    ? 'Konfirmasi Buat Google Spreadsheet'
                    : confirmAction.updateStrategy === 'append'
                      ? 'Konfirmasi Tambah Baris ke Spreadsheet'
                      : 'Konfirmasi Timpa & Perbarui Spreadsheet'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {confirmAction.mode === 'create'
                    ? 'Aplikasi akan membuat Google Spreadsheet baru di akun Google Anda dengan judul:'
                    : confirmAction.updateStrategy === 'append'
                      ? 'Baris data berikut akan ditambahkan ke bagian bawah tab yang cocok tanpa menghapus data lama:'
                      : 'Data pada tab yang cocok di Google Spreadsheet berikut akan dibersihkan dan ditulis ulang:'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup dialog"
                onClick={() => !isSubmitting && setConfirmAction(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs space-y-2">
              <div>
                <span className="text-slate-500">Judul Spreadsheet: </span>
                <strong className="text-slate-900">
                  {confirmAction.mode === 'create'
                    ? confirmAction.title
                    : confirmAction.meta.title}
                </strong>
              </div>
              {confirmAction.mode === 'update' && (
                <div>
                  <span className="text-slate-500">ID Target: </span>
                  <span className="font-data-mono text-slate-800">
                    {confirmAction.meta.spreadsheetId}
                  </span>
                </div>
              )}
              <div>
                <p className="text-slate-500 mb-1">
                  Tab yang akan ditulis ({confirmAction.worksheets.length} tab):
                </p>
                <ul className="list-disc pl-5 space-y-0.5 text-slate-800">
                  {confirmAction.worksheets.map((ws) => (
                    <li key={ws.title}>
                      <strong>{ws.title}</strong> — {ws.rows.length} baris
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmAction(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmExecution}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md cursor-pointer"
              >
                {isSubmitting && (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                    aria-hidden="true"
                  />
                )}
                <span>
                  {confirmAction.mode === 'create'
                    ? 'Ya, Buat Spreadsheet'
                    : confirmAction.updateStrategy === 'append'
                      ? 'Ya, Tambahkan Baris'
                      : 'Ya, Perbarui & Timpa'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
