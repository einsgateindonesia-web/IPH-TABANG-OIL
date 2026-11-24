import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  Table2,
  X,
} from 'lucide-react';
import type {
  LinkedGoogleSpreadsheet,
  LogSheet,
  OutputOverrideMap,
  PrimarySpreadsheetConfig,
} from '../types/logSheet';
import {
  appendGoogleSpreadsheet,
  createGoogleSpreadsheet,
  fetchSpreadsheetMetadata,
  getAccessToken,
  googleSignIn,
  initAuth,
  SheetsAuthExpiredError,
  updateGoogleSpreadsheet,
  type SpreadsheetMetadata,
} from '../utils/googleAuth';
import { formatDisplayDate } from '../utils/logSheet';
import {
  buildSpreadsheetWorksheets,
  computeRowSyncKey,
  extractSpreadsheetId,
  filterUnsentWorksheets,
  type WorksheetSpec,
} from '../utils/spreadsheetBuilder';
import {
  loadLinkedSpreadsheets,
  loadSyncedRowKeys,
  saveLinkedSpreadsheets,
  savePrimarySpreadsheet,
  saveSyncedRowKeys,
} from '../utils/storage';

interface SendToSheetsModalProps {
  open: boolean;
  onClose: () => void;
  activeSheet: LogSheet;
  overrides: OutputOverrideMap;
  fallbackStorageCode: string;
  primaryConfig: PrimarySpreadsheetConfig | null;
  onSetPrimaryConfig: (config: PrimarySpreadsheetConfig | null) => void;
  onSynced: () => void;
}

type DestinationMode = 'append' | 'overwrite' | 'create';

export function SendToSheetsModal({
  open,
  onClose,
  activeSheet,
  overrides,
  fallbackStorageCode,
  primaryConfig,
  onSetPrimaryConfig,
  onSynced,
}: SendToSheetsModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() =>
    Boolean(getAccessToken())
  );
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [linkedList, setLinkedList] = useState<LinkedGoogleSpreadsheet[]>(() =>
    loadLinkedSpreadsheets()
  );
  const [mode, setMode] = useState<DestinationMode>(() =>
    primaryConfig
      ? primaryConfig.defaultMode
      : loadLinkedSpreadsheets().length > 0
        ? 'append'
        : 'create'
  );
  const [targetUrlOrId, setTargetUrlOrId] = useState<string>(
    () =>
      primaryConfig?.spreadsheetUrl ??
      loadLinkedSpreadsheets()[0]?.spreadsheetUrl ??
      ''
  );
  const [pinAsPrimary, setPinAsPrimary] = useState(true);
  const [onlyUnsentRows, setOnlyUnsentRows] = useState(true);
  const [newTitle, setNewTitle] = useState<string>(() => {
    const d = formatDisplayDate(activeSheet.date) || 'Log';
    return `IP PLANT HAULING — Oil & Lube Log (${d} ${activeSheet.workingShift || ''})`.trim();
  });

  const [includeOutput, setIncludeOutput] = useState(true);
  const [includeLogSheet, setIncludeLogSheet] = useState(true);
  const [includeStockIn, setIncludeStockIn] = useState(true);
  const [includeMasterTabs, setIncludeMasterTabs] = useState(false);

  const [confirmMeta, setConfirmMeta] = useState<SpreadsheetMetadata | null>(
    null
  );
  const [isInspecting, setIsInspecting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    title: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const saved = loadLinkedSpreadsheets();
    setLinkedList(saved);
    if (primaryConfig) {
      setTargetUrlOrId(primaryConfig.spreadsheetUrl);
      setMode(primaryConfig.defaultMode);
      setIncludeOutput(primaryConfig.includeOutput);
      setIncludeLogSheet(primaryConfig.includeLogSheet);
      setIncludeStockIn(primaryConfig.includeStockIn);
      setIncludeMasterTabs(primaryConfig.includeMasterTabs);
    } else if (saved.length > 0 && !targetUrlOrId) {
      setTargetUrlOrId(saved[0].spreadsheetUrl);
    }
    const d = formatDisplayDate(activeSheet.date) || 'Log';
    setNewTitle(
      `IP PLANT HAULING — Oil & Lube Log (${d} ${activeSheet.workingShift || ''})`.trim()
    );
    setConfirmMeta(null);
    setErrorText(null);
    setSuccessInfo(null);
  }, [open, activeSheet.date, activeSheet.workingShift, primaryConfig]);

  useEffect(() => {
    const unsub = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setHasToken(Boolean(token));
      },
      (firebaseUser) => {
        setUser(firebaseUser);
        setHasToken(false);
      }
    );
    return () => unsub();
  }, []);

  const worksheets = useMemo<WorksheetSpec[]>(
    () =>
      buildSpreadsheetWorksheets({
        sheets: [activeSheet],
        overrides,
        fallbackStorageCode,
        options: {
          includeOutput,
          includeLogSheet,
          includeStockIn,
          includeMasterTabs,
          splitGreaseAndCoolant: true,
        },
      }),
    [
      activeSheet,
      overrides,
      fallbackStorageCode,
      includeOutput,
      includeLogSheet,
      includeStockIn,
      includeMasterTabs,
    ]
  );

  if (!open) return null;

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorText(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setHasToken(Boolean(res.accessToken));
    } catch (err) {
      setErrorText(
        err instanceof Error
          ? err.message
          : 'Login Google dibatalkan atau gagal.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePrepareConfirm = async () => {
    setErrorText(null);
    setSuccessInfo(null);

    const token = getAccessToken();
    if (!token) {
      setHasToken(false);
      setErrorText('Silakan Sign in with Google terlebih dahulu.');
      return;
    }
    if (worksheets.length === 0) {
      setErrorText('Pilih minimal satu sheet yang akan dikirim.');
      return;
    }

    if (mode === 'create') {
      setConfirmMeta({
        spreadsheetId: 'NEW',
        spreadsheetUrl: '',
        title: newTitle.trim() || 'IP PLANT HAULING — Oil & Lube Log',
        sheets: [],
      });
      return;
    }

    const id = extractSpreadsheetId(targetUrlOrId);
    if (!id) {
      setErrorText('Masukkan URL atau ID Google Spreadsheet tujuan yang valid.');
      return;
    }

    setIsInspecting(true);
    try {
      const meta = await fetchSpreadsheetMetadata(id, token);
      setConfirmMeta(meta);
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        setHasToken(false);
      }
      setErrorText(
        err instanceof Error
          ? err.message
          : 'Gagal membaca Google Spreadsheet tujuan.'
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleConfirmSend = async () => {
    if (!confirmMeta) return;
    const token = getAccessToken();
    if (!token) {
      setHasToken(false);
      setConfirmMeta(null);
      setErrorText('Sesi Google berakhir. Silakan Sign in ulang.');
      return;
    }

    setIsExecuting(true);
    setErrorText(null);
    try {
      let targetSheetsToWrite = worksheets;
      if (mode === 'append' && onlyUnsentRows) {
        const existingSynced = loadSyncedRowKeys(confirmMeta.spreadsheetId);
        const diff = filterUnsentWorksheets(worksheets, existingSynced);
        if (diff.unsentWorksheets.length > 0) {
          targetSheetsToWrite = diff.unsentWorksheets;
        }
      }

      const result =
        mode === 'create'
          ? await createGoogleSpreadsheet(confirmMeta.title, worksheets, token)
          : mode === 'append'
            ? await appendGoogleSpreadsheet(
                confirmMeta.spreadsheetId,
                targetSheetsToWrite,
                token
              )
            : await updateGoogleSpreadsheet(
                confirmMeta.spreadsheetId,
                worksheets,
                token
              );

      const allRowKeys: string[] = [];
      for (const ws of worksheets) {
        for (const r of ws.rows) {
          allRowKeys.push(computeRowSyncKey(ws.title, r));
        }
      }
      const prevSynced =
        mode === 'overwrite' || mode === 'create'
          ? new Set<string>()
          : loadSyncedRowKeys(result.spreadsheetId);
      for (const k of allRowKeys) prevSynced.add(k);
      saveSyncedRowKeys(result.spreadsheetId, prevSynced);

      const updatedList: LinkedGoogleSpreadsheet[] = [
        {
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          title: result.title,
          updatedAt: new Date().toISOString(),
        },
        ...linkedList.filter((x) => x.spreadsheetId !== result.spreadsheetId),
      ].slice(0, 12);
      setLinkedList(updatedList);
      saveLinkedSpreadsheets(updatedList);

      if (pinAsPrimary) {
        const nextPrimary: PrimarySpreadsheetConfig = {
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          title: result.title,
          defaultMode: mode === 'overwrite' ? 'overwrite' : 'append',
          includeOutput,
          includeLogSheet,
          includeStockIn,
          includeMasterTabs,
          lastSyncedAt: new Date().toISOString(),
        };
        savePrimarySpreadsheet(nextPrimary);
        onSetPrimaryConfig(nextPrimary);
      }

      onSynced();
      setTargetUrlOrId(result.spreadsheetUrl);
      setConfirmMeta(null);
      setSuccessInfo({ title: result.title, url: result.spreadsheetUrl });
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        setHasToken(false);
      }
      setConfirmMeta(null);
      setErrorText(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim data ke Google Spreadsheet.'
      );
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-sheets-modal-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full p-5 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <Table2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="send-sheets-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Kirim Inputan Lembar Log ke Google Sheets
              </h2>
              <p className="text-xs text-slate-600">
                {formatDisplayDate(activeSheet.date) || 'Tanpa Tanggal'} ·{' '}
                {activeSheet.workingShift || 'Tanpa Shift'} ·{' '}
                {activeSheet.storageLocation || 'Tanpa Lokasi'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup dialog"
            onClick={() => !isExecuting && onClose()}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Auth Check */}
        {!hasToken ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs text-slate-700">
              Hubungkan akun Google Anda agar aplikasi dapat menulis atau
              menambahkan baris inputan dari Lembar Log ini langsung ke Google
              Spreadsheet.
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isLoggingIn}
              className="inline-flex items-center gap-2.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md shadow-xs text-sm font-medium text-slate-800 cursor-pointer disabled:opacity-60"
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
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs bg-emerald-50/70 border border-emerald-200 rounded-md px-3 py-2 text-emerald-900">
              <span>
                Terhubung sebagai <strong>{user?.email || 'Akun Google'}</strong>
              </span>
            </div>

            {/* Destination Mode */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Tujuan Pengiriman Data:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('append');
                    setConfirmMeta(null);
                  }}
                  className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                    mode === 'append'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">Tambah Baris</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Tambahkan ke baris bawah sheet yang ada
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('overwrite');
                    setConfirmMeta(null);
                  }}
                  className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                    mode === 'overwrite'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">Timpa Isi Sheet</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Ganti isi tab target dengan lembar ini
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('create');
                    setConfirmMeta(null);
                  }}
                  className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                    mode === 'create'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">Spreadsheet Baru</div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Buat file Google Sheets baru
                  </div>
                </button>
              </div>
            </div>

            {mode === 'create' ? (
              <div>
                <label
                  htmlFor="modal-new-sheet-title"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Judul Google Spreadsheet Baru
                </label>
                <input
                  id="modal-new-sheet-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setConfirmMeta(null);
                  }}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            ) : (
              <div className="space-y-2">
                {linkedList.length > 0 && (
                  <div>
                    <label
                      htmlFor="modal-recent-gsheet"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Pilih Spreadsheet Terhubung
                    </label>
                    <select
                      id="modal-recent-gsheet"
                      value={
                        linkedList.some(
                          (x) => x.spreadsheetUrl === targetUrlOrId
                        )
                          ? targetUrlOrId
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) {
                          setTargetUrlOrId(e.target.value);
                          setConfirmMeta(null);
                        }
                      }}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="">-- Pilih dari riwayat --</option>
                      {linkedList.map((item) => (
                        <option
                          key={item.spreadsheetId}
                          value={item.spreadsheetUrl}
                        >
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="modal-target-gsheet-url"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    URL atau ID Google Spreadsheet Tujuan
                  </label>
                  <input
                    id="modal-target-gsheet-url"
                    type="text"
                    value={targetUrlOrId}
                    onChange={(e) => {
                      setTargetUrlOrId(e.target.value);
                      setConfirmMeta(null);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs font-data-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
            )}

            {/* Tabs to Include */}
            <div className="rounded-md border border-slate-200 p-3 space-y-2 bg-slate-50/50 text-xs">
              <div className="font-semibold text-slate-700">
                Data Lembar Ini yang Akan Dikirim:
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeOutput}
                    onChange={(e) => {
                      setIncludeOutput(e.target.checked);
                      setConfirmMeta(null);
                    }}
                    className="w-3.5 h-3.5 accent-emerald-700"
                  />
                  <span>Format Output</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLogSheet}
                    onChange={(e) => {
                      setIncludeLogSheet(e.target.checked);
                      setConfirmMeta(null);
                    }}
                    className="w-3.5 h-3.5 accent-emerald-700"
                  />
                  <span>Log Sheet</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStockIn}
                    onChange={(e) => {
                      setIncludeStockIn(e.target.checked);
                      setConfirmMeta(null);
                    }}
                    className="w-3.5 h-3.5 accent-emerald-700"
                  />
                  <span>Stock In</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMasterTabs}
                    onChange={(e) => {
                      setIncludeMasterTabs(e.target.checked);
                      setConfirmMeta(null);
                    }}
                    className="w-3.5 h-3.5 accent-emerald-700"
                  />
                  <span>Master Kode</span>
                </label>
              </div>
              <ul className="text-[11px] text-slate-600 list-disc pl-5">
                {worksheets.map((ws) => (
                  <li key={ws.title}>
                    <strong>{ws.title}</strong>: {ws.rows.length} baris
                  </li>
                ))}
              </ul>
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                {mode === 'append' && (
                  <label className="inline-flex items-center gap-1.5 text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyUnsentRows}
                      onChange={(e) => {
                        setOnlyUnsentRows(e.target.checked);
                        setConfirmMeta(null);
                      }}
                      className="w-3.5 h-3.5 accent-emerald-700"
                    />
                    <span>
                      Hanya kirim baris baru yang belum masuk spreadsheet ini
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-slate-800 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={pinAsPrimary}
                    onChange={(e) => setPinAsPrimary(e.target.checked)}
                    className="w-3.5 h-3.5 accent-emerald-700"
                  />
                  <span>
                    Jadikan Master Spreadsheet Terhubung (tampil langsung di
                    atas Lembar Log)
                  </span>
                </label>
              </div>
            </div>

            {/* Confirmation Step Box */}
            {confirmMeta && (() => {
              let previewSheets = worksheets;
              if (
                mode === 'append' &&
                onlyUnsentRows &&
                confirmMeta.spreadsheetId !== 'NEW'
              ) {
                const existingSynced = loadSyncedRowKeys(
                  confirmMeta.spreadsheetId
                );
                const diff = filterUnsentWorksheets(worksheets, existingSynced);
                if (diff.unsentWorksheets.length > 0) {
                  previewSheets = diff.unsentWorksheets;
                }
              }
              return (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-1.5">
                  <p className="font-bold">
                    Konfirmasi Pengiriman ke "{confirmMeta.title}"
                  </p>
                  <p>
                    {mode === 'create'
                      ? `Akan membuat spreadsheet baru berisi ${worksheets.length} tab.`
                      : mode === 'append'
                        ? `Akan menambahkan baris ke bagian bawah tab (${previewSheets
                            .map((w) => `${w.title}: +${w.rows.length}`)
                            .join(', ')}) tanpa menghapus data lama.`
                        : `PERHATIAN: Tab target (${worksheets
                            .map((w) => w.title)
                            .join(', ')}) pada spreadsheet ini akan dibersihkan dan ditimpa ulang.`}
                  </p>
                </div>
              );
            })()}
          </>
        )}

        {errorText && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorText}</span>
          </div>
        )}

        {successInfo && (
          <div
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-2"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              <span>
                Data berhasil dikirim ke <strong>{successInfo.title}</strong>.
              </span>
            </div>
            <a
              href={successInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded shrink-0"
            >
              <span>Buka</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isExecuting}
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
          >
            Tutup
          </button>

          {hasToken &&
            (!confirmMeta ? (
              <button
                type="button"
                disabled={isInspecting || worksheets.length === 0}
                onClick={handlePrepareConfirm}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md cursor-pointer"
              >
                {isInspecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Tinjau &amp; Kirim</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isExecuting}
                onClick={handleConfirmSend}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md cursor-pointer"
              >
                {isExecuting && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>
                  {mode === 'create'
                    ? 'Ya, Buat Spreadsheet'
                    : mode === 'append'
                      ? 'Ya, Tambahkan Baris'
                      : 'Ya, Timpa & Perbarui'}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
