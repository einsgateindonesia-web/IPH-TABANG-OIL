import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react';
import type {
  LogSheet,
  OutputOverrideMap,
  PrimarySpreadsheetConfig,
} from '../types/logSheet';
import {
  appendGoogleSpreadsheet,
  FIREBASE_AUTH_SETTINGS_URL,
  getAccessToken,
  GoogleAuthActionError,
  googleSignIn,
  initAuth,
  SheetsAuthExpiredError,
  updateGoogleSpreadsheet,
} from '../utils/googleAuth';
import {
  buildSpreadsheetWorksheets,
  computeSyncStatusSummary,
  filterUnsentWorksheets,
} from '../utils/spreadsheetBuilder';
import {
  loadSyncedRowKeys,
  savePrimarySpreadsheet,
  saveSyncedRowKeys,
} from '../utils/storage';

interface SpreadsheetConnectionBarProps {
  sheetsToSync: LogSheet[];
  overrides: OutputOverrideMap;
  fallbackStorageCode: string;
  splitGreaseAndCoolant?: boolean;
  primaryConfig: PrimarySpreadsheetConfig | null;
  onPrimaryConfigChange: (config: PrimarySpreadsheetConfig | null) => void;
  onOpenSetupModal: () => void;
  syncTick: number;
  onSyncCompleted: () => void;
}

function formatSyncTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SpreadsheetConnectionBar({
  sheetsToSync,
  overrides,
  fallbackStorageCode,
  splitGreaseAndCoolant = true,
  primaryConfig,
  onPrimaryConfigChange,
  onOpenSetupModal,
  syncTick,
  onSyncCompleted,
}: SpreadsheetConnectionBarProps) {
  const [hasToken, setHasToken] = useState<boolean>(() =>
    Boolean(getAccessToken())
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showConfirmSync, setShowConfirmSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    isUnauthorizedDomain?: boolean;
  } | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (_u, token) => setHasToken(Boolean(token)),
      () => setHasToken(false)
    );
    return () => unsub();
  }, [syncTick]);

  const worksheetsForPrimary = useMemo(() => {
    if (!primaryConfig) return [];
    return buildSpreadsheetWorksheets({
      sheets: sheetsToSync,
      overrides,
      fallbackStorageCode,
      options: {
        includeOutput: primaryConfig.includeOutput,
        includeLogSheet: primaryConfig.includeLogSheet,
        includeStockIn: primaryConfig.includeStockIn,
        includeMasterTabs: primaryConfig.includeMasterTabs,
        splitGreaseAndCoolant,
      },
    });
  }, [
    sheetsToSync,
    overrides,
    fallbackStorageCode,
    splitGreaseAndCoolant,
    primaryConfig,
  ]);

  const syncedKeys = useMemo(() => {
    if (!primaryConfig) return new Set<string>();
    return loadSyncedRowKeys(primaryConfig.spreadsheetId);
  }, [primaryConfig, syncTick]);

  const unsentDiff = useMemo(
    () => filterUnsentWorksheets(worksheetsForPrimary, syncedKeys),
    [worksheetsForPrimary, syncedKeys]
  );

  const syncSummary = useMemo(
    () =>
      computeSyncStatusSummary(
        worksheetsForPrimary,
        syncedKeys,
        Boolean(primaryConfig)
      ),
    [worksheetsForPrimary, syncedKeys, primaryConfig]
  );

  const handleQuickSignIn = async () => {
    setIsSigningIn(true);
    setFeedback(null);
    try {
      const res = await googleSignIn();
      setHasToken(Boolean(res.accessToken));
      return Boolean(res.accessToken);
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Login Google dibatalkan atau gagal.',
        isUnauthorizedDomain:
          err instanceof GoogleAuthActionError &&
          err.code === 'auth/unauthorized-domain',
      });
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSyncButtonClick = async () => {
    setFeedback(null);
    if (!primaryConfig) {
      onOpenSetupModal();
      return;
    }
    if (!getAccessToken()) {
      const ok = await handleQuickSignIn();
      if (!ok) return;
    }
    setShowConfirmSync(true);
  };

  const worksheetsToPush = useMemo(() => {
    if (!primaryConfig) return [];
    if (primaryConfig.defaultMode === 'overwrite') {
      return worksheetsForPrimary;
    }
    return unsentDiff.unsentWorksheets.length > 0
      ? unsentDiff.unsentWorksheets
      : worksheetsForPrimary;
  }, [primaryConfig, worksheetsForPrimary, unsentDiff]);

  const handleConfirmSync = async () => {
    if (!primaryConfig) return;
    const token = getAccessToken();
    if (!token) {
      setHasToken(false);
      setShowConfirmSync(false);
      setFeedback({
        type: 'error',
        text: 'Sesi Google berakhir. Silakan klik Sinkron kembali untuk masuk Google.',
      });
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const result =
        primaryConfig.defaultMode === 'append'
          ? await appendGoogleSpreadsheet(
              primaryConfig.spreadsheetId,
              worksheetsToPush,
              token
            )
          : await updateGoogleSpreadsheet(
              primaryConfig.spreadsheetId,
              worksheetsForPrimary,
              token
            );

      const nextSet =
        primaryConfig.defaultMode === 'overwrite'
          ? new Set(unsentDiff.allCurrentRowKeys)
          : new Set([...syncedKeys, ...unsentDiff.allCurrentRowKeys]);
      saveSyncedRowKeys(result.spreadsheetId, nextSet);

      const nextConfig: PrimarySpreadsheetConfig = {
        ...primaryConfig,
        title: result.title,
        spreadsheetUrl: result.spreadsheetUrl,
        lastSyncedAt: new Date().toISOString(),
      };
      savePrimarySpreadsheet(nextConfig);
      onPrimaryConfigChange(nextConfig);
      onSyncCompleted();
      setShowConfirmSync(false);
      setFeedback({
        type: 'success',
        text:
          primaryConfig.defaultMode === 'append'
            ? `Berhasil sinkron ${worksheetsToPush.reduce((s, w) => s + w.rows.length, 0)} baris ke "${result.title}".`
            : `Spreadsheet "${result.title}" berhasil disinkronkan.`,
      });
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        setHasToken(false);
      }
      setShowConfirmSync(false);
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menyinkronkan data ke Google Sheets.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const lastSyncClock = formatSyncTime(primaryConfig?.lastSyncedAt);

  return (
    <>
      <div
        data-testid="spreadsheet-connection-bar"
        className="no-print bg-white border border-slate-200 rounded-lg px-3.5 py-2 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
      >
        {!primaryConfig ? (
          <>
            <div className="flex items-center gap-2 text-slate-600">
              <Link2
                className="w-3.5 h-3.5 text-slate-400 shrink-0"
                aria-hidden="true"
              />
              <span>
                <strong className="text-slate-800">Google Sheets:</strong>{' '}
                Belum terhubung ke Master Spreadsheet tujuan.
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenSetupModal}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sinkron ke Sheets</span>
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  hasToken ? 'bg-emerald-600' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              <span className="text-slate-600 truncate">
                Terhubung:{' '}
                <strong className="text-slate-900">{primaryConfig.title}</strong>
              </span>

              {syncSummary.state === 'empty' ? (
                <span className="text-slate-500 inline-flex items-center gap-1">
                  <span className="hidden sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span>Belum ada data baris</span>
                </span>
              ) : syncSummary.state === 'pending' ? (
                <span className="font-semibold text-amber-800 tabular-nums inline-flex items-center gap-1">
                  <span className="hidden sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {syncSummary.unsentOperationalRows} baris baru siap
                    disinkron
                  </span>
                </span>
              ) : (
                <span className="font-medium text-emerald-700 inline-flex items-center gap-1">
                  <span className="hidden sm:inline" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    Tersinkron{lastSyncClock ? ` (${lastSyncClock})` : ''}
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {!hasToken && (
                <button
                  type="button"
                  onClick={handleQuickSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer disabled:opacity-60"
                >
                  <span className="w-3.5 h-3.5 shrink-0 inline-block">
                    <svg viewBox="0 0 48 48" className="w-full h-full">
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
                    {isSigningIn ? 'Menghubungkan...' : 'Sign in with Google'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSyncButtonClick}
                disabled={
                  syncSummary.state === 'empty' || isSyncing || isSigningIn
                }
                title={
                  syncSummary.state === 'empty'
                    ? 'Isi minimal 1 baris data sebelum sinkron'
                    : 'Sinkronkan data ke Master Google Spreadsheet'
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                  syncSummary.state === 'pending'
                    ? 'text-white bg-emerald-700 hover:bg-emerald-800'
                    : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isSyncing || isSigningIn ? 'animate-spin' : ''
                  }`}
                  aria-hidden="true"
                />
                <span>{syncSummary.buttonLabel}</span>
              </button>

              <a
                href={primaryConfig.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                <span>Buka Sheets</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>

              <button
                type="button"
                onClick={onOpenSetupModal}
                title="Ubah Master Google Spreadsheet atau pengaturan sync"
                className="inline-flex items-center gap-1 px-2 py-1.5 font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ganti</span>
              </button>
            </div>
          </>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`no-print mb-3 rounded-md border px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <div className="flex items-center gap-2">
            {feedback.isUnauthorizedDomain && (
              <a
                href={FIREBASE_AUTH_SETTINGS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-red-300 hover:bg-red-100 text-red-900 font-semibold rounded"
              >
                <span>Buka Authorized Domains</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              aria-label="Tutup pemberitahuan"
              onClick={() => setFeedback(null)}
              className="text-current opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal for Sinkron */}
      {showConfirmSync && primaryConfig && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-sync-confirm-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="quick-sync-confirm-title"
                  className="text-base font-bold text-slate-900"
                >
                  Konfirmasi Sinkronisasi ke Google Sheets
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {primaryConfig.defaultMode === 'append'
                    ? unsentDiff.totalUnsentRows > 0
                      ? 'Baris baru berikut akan disinkronkan ke spreadsheet terhubung tanpa menghapus data lama:'
                      : 'Semua baris ini sudah pernah disinkronkan. Sinkron ulang baris berikut?'
                    : 'Tab target di spreadsheet terhubung akan disinkronkan ulang dengan data ini:'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup konfirmasi sinkron"
                onClick={() => !isSyncing && setShowConfirmSync(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5">
              <div>
                <span className="text-slate-500">Spreadsheet Target: </span>
                <strong className="text-slate-900">{primaryConfig.title}</strong>
              </div>
              <div>
                <span className="text-slate-500">Mode: </span>
                <strong className="text-slate-900">
                  {primaryConfig.defaultMode === 'append'
                    ? 'Tambah Baris Baru (Append)'
                    : 'Timpa Isi Tab (Overwrite)'}
                </strong>
              </div>
              <ul className="list-disc pl-5 pt-1 text-slate-800 space-y-0.5">
                {worksheetsToPush.map((ws) => (
                  <li key={ws.title}>
                    <strong>{ws.title}</strong> — {ws.rows.length} baris
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => setShowConfirmSync(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleConfirmSync}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md cursor-pointer"
              >
                {isSyncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Sinkronkan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
