import { Printer } from 'lucide-react';
import type { ActiveTab } from '../types/logSheet';

interface TopBarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  onPrint: () => void;
  sheetCount: number;
}

export function TopBar({
  activeTab,
  onChangeTab,
  onPrint,
  sheetCount,
}: TopBarProps) {
  return (
    <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3">
      <div className="max-w-[1380px] mx-auto flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Single-line Brand Title */}
        <button
          type="button"
          onClick={() => onChangeTab('sheet')}
          className="text-left text-sm sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded cursor-pointer"
        >
          <span className="hidden sm:inline">IP PLANT HAULING</span>
          <span className="sm:hidden">Karunia</span>
        </button>

        {/* Zone 2: Concise Navigation Links (6 single-line links) */}
        <nav
          aria-label="Navigasi Utama"
          className="flex items-center gap-1.5 sm:gap-5 text-[11px] sm:text-sm font-medium"
        >
          <button
            type="button"
            onClick={() => onChangeTab('dashboard')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activeTab === 'dashboard'
                ? 'border-emerald-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">Dashboard</span>
            <span className="sm:hidden">Dash</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('sheet')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activeTab === 'sheet'
                ? 'border-emerald-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">Lembar Log</span>
            <span className="sm:hidden">Form</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('output')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activeTab === 'output'
                ? 'border-emerald-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">Format Output</span>
            <span className="sm:hidden">Output</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('spreadsheet')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activeTab === 'spreadsheet'
                ? 'border-emerald-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">Spreadsheet</span>
            <span className="sm:hidden">Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('history')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activeTab === 'history'
                ? 'border-emerald-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">Riwayat ({sheetCount})</span>
            <span className="sm:hidden">Riwayat</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('summary')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activeTab === 'summary'
                ? 'border-emerald-700 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="hidden sm:inline">Ringkasan</span>
            <span className="sm:hidden">Rekap</span>
          </button>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-700"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Cetak / Print A4</span>
            <span className="sm:hidden">Print</span>
          </button>
        </div>
      </div>
    </header>
  );
}
