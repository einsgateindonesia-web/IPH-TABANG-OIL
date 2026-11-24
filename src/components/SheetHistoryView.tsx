import { useMemo, useState } from 'react';
import {
  CopyPlus,
  Download,
  FilePlus2,
  FolderOpen,
  Search,
  Trash2,
} from 'lucide-react';
import type { LogSheet } from '../types/logSheet';
import {
  COMMON_SHIFTS,
  computeSheetTotals,
  filterSheets,
  formatDisplayDate,
  sheetToCsv,
} from '../utils/logSheet';

interface SheetHistoryViewProps {
  sheets: LogSheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onCreateBlank: () => void;
  onCreateNextShift: (fromSheet: LogSheet) => void;
  onDeleteSheet: (sheetId: string) => void;
}

export function SheetHistoryView({
  sheets,
  activeSheetId,
  onSelectSheet,
  onCreateBlank,
  onCreateNextShift,
  onDeleteSheet,
}: SheetHistoryViewProps) {
  const [query, setQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterSheets(sheets, query, shiftFilter),
    [sheets, query, shiftFilter]
  );

  const handleDownloadCsv = (sheet: LogSheet) => {
    const csv = sheetToCsv(sheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeDate = (sheet.date || 'log').replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeShift = (sheet.workingShift || 'shift').replace(/\s+/g, '_');
    a.download = `Oil_Log_${safeDate}_${safeShift}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Riwayat Lembar Pencatatan Oli
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Semua lembar tersimpan otomatis di browser. Pilih lembar untuk
            membuka atau melanjutkan pencatatan.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateBlank}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FilePlus2 className="w-4 h-4" aria-hidden="true" />
          <span>Lembar Kosong Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Cari berdasarkan tanggal, lokasi, unit, atau jenis oli"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari tanggal, lokasi storage, no. unit, atau jenis oli..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          <button
            type="button"
            onClick={() => setShiftFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              shiftFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Shift
          </button>
          {COMMON_SHIFTS.map((shift) => (
            <button
              key={shift}
              type="button"
              onClick={() => setShiftFilter(shift)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                shiftFilter === shift
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {shift}
            </button>
          ))}
        </div>
      </div>

      {/* Sheet Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            Tidak ada lembar log yang cocok dengan filter pencarian.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Ubah kata kunci pencarian atau buat lembar baru.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Tanggal &amp; Shift</th>
                  <th className="py-3 px-4">Storage Location</th>
                  <th className="py-3 px-4 text-right">Baris Terisi</th>
                  <th className="py-3 px-4 text-right">Flowmeter (L)</th>
                  <th className="py-3 px-4 text-right">Greasing (Kg)</th>
                  <th className="py-3 px-4 text-right">Collant (L)</th>
                  <th className="py-3 px-4">Created By</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((sheet) => {
                  const totals = computeSheetTotals(sheet);
                  const isActive = sheet.id === activeSheetId;

                  return (
                    <tr
                      key={sheet.id}
                      className={`transition-colors ${
                        isActive ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 tabular-nums">
                          {formatDisplayDate(sheet.date) || 'Tanpa Tanggal'}
                          {isActive && (
                            <span className="ml-2 text-xs font-medium text-emerald-700">
                              · Aktif
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sheet.workingShift || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {sheet.storageLocation || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-data-mono text-slate-800">
                        {totals.filledConsumptionRows}/20
                      </td>
                      <td className="py-3 px-4 text-right font-data-mono font-semibold text-slate-900">
                        {totals.totalFlowmeterLiters}
                      </td>
                      <td className="py-3 px-4 text-right font-data-mono text-slate-800">
                        {totals.totalGreasingKg}
                      </td>
                      <td className="py-3 px-4 text-right font-data-mono text-slate-800">
                        {totals.totalCollantLiters}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {sheet.signatures.driverMechanic || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectSheet(sheet.id)}
                            aria-label={`Buka lembar ${formatDisplayDate(sheet.date)} ${sheet.workingShift}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Buka</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onCreateNextShift(sheet)}
                            title="Buat lembar shift berikutnya (bawa Flowmeter Akhir)"
                            aria-label={`Lanjut shift dari ${formatDisplayDate(sheet.date)} ${sheet.workingShift}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                            <span>Lanjut Shift</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadCsv(sheet)}
                            title="Unduh CSV"
                            aria-label={`Unduh CSV lembar ${formatDisplayDate(sheet.date)}`}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {sheets.length > 1 &&
                            (confirmDeleteId === sheet.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteSheet(sheet.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                              >
                                Hapus?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(sheet.id)}
                                title="Hapus lembar"
                                aria-label={`Hapus lembar ${formatDisplayDate(sheet.date)} ${sheet.workingShift}`}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
