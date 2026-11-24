import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Clock, RotateCcw } from 'lucide-react';
import {
  MATERIAL_CODES,
  UNIT_CODES,
  WAREHOUSE_LOCATIONS,
} from '../data/masterData';
import type { ConsumptionRow, LogSheet } from '../types/logSheet';
import {
  COMMON_OIL_DESCRIPTIONS,
  COMMON_SHIFTS,
  DEFAULT_STORAGE_LOCATION,
  calculateFlowmeterLiters,
  formatDisplayDate,
  getCurrentTimeHHmm,
  parseLocaleNumber,
} from '../utils/logSheet';
import { KaruniaLogo } from './KaruniaLogo';

interface PrintableLogSheetProps {
  sheet: LogSheet;
  onChange: (updated: LogSheet) => void;
}

export function PrintableLogSheet({ sheet, onChange }: PrintableLogSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const locationWrapperRef = useRef<HTMLDivElement>(null);
  const [focusedWaktuRow, setFocusedWaktuRow] = useState<number | null>(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);

  useEffect(() => {
    if (!showLocationMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        locationWrapperRef.current &&
        !locationWrapperRef.current.contains(e.target as Node)
      ) {
        setShowLocationMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showLocationMenu]);

  const updateMeta = (
    field: 'date' | 'workingShift' | 'storageLocation',
    value: string
  ) => {
    onChange({
      ...sheet,
      [field]: value,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateConsumptionRow = (
    rowIndex: number,
    field: keyof Omit<ConsumptionRow, 'rowNumber'>,
    value: string
  ) => {
    const nextRows = sheet.rows.map((row, idx) => {
      if (idx !== rowIndex) return row;

      const updated: ConsumptionRow = {
        ...row,
        [field]: value,
      };

      if (field === 'flowmeterLiter') {
        updated.flowmeterManualOverride = value.trim() !== '';
        if (value.trim() === '' && sheet.autoCalcFlowmeter) {
          const calc = calculateFlowmeterLiters(
            updated.flowmeterAwal,
            updated.flowmeterAkhir
          );
          updated.flowmeterLiter = calc.liter;
          updated.flowmeterManualOverride = false;
        }
      } else if (
        (field === 'flowmeterAwal' || field === 'flowmeterAkhir') &&
        sheet.autoCalcFlowmeter &&
        !row.flowmeterManualOverride
      ) {
        const calc = calculateFlowmeterLiters(
          updated.flowmeterAwal,
          updated.flowmeterAkhir
        );
        updated.flowmeterLiter = calc.liter;
      }

      return updated;
    });

    onChange({
      ...sheet,
      rows: nextRows,
      updatedAt: new Date().toISOString(),
    });
  };

  const resetFlowmeterOverride = (rowIndex: number) => {
    const nextRows = sheet.rows.map((row, idx) => {
      if (idx !== rowIndex) return row;
      const calc = calculateFlowmeterLiters(row.flowmeterAwal, row.flowmeterAkhir);
      return {
        ...row,
        flowmeterManualOverride: false,
        flowmeterLiter: calc.liter,
      };
    });
    onChange({
      ...sheet,
      rows: nextRows,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateSignature = (
    field: keyof LogSheet['signatures'],
    value: string
  ) => {
    onChange({
      ...sheet,
      signatures: {
        ...sheet.signatures,
        [field]: value,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  // Spreadsheet-like vertical Enter navigation inside the 20-row table
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colKey: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < sheet.rows.length && sheetRef.current) {
        const nextInput = sheetRef.current.querySelector<HTMLInputElement>(
          `input[data-cell="${nextRow}-${colKey}"]`
        );
        nextInput?.focus();
        nextInput?.select();
      }
    }
  };

  return (
    <div className="print-container w-full overflow-x-auto pb-6 print:pb-0">
      {/* Shared Datalists for fast field data entry */}
      <datalist id="oil-lube-options">
        {COMMON_OIL_DESCRIPTIONS.map((item) => (
          <option key={item} value={item} />
        ))}
        {MATERIAL_CODES.filter(
          (m) =>
            !m.oilName.includes('SEAL') &&
            !m.oilName.includes('GASKET') &&
            !m.oilName.includes('NIPPLE')
        ).map((m) => (
          <option key={m.materialCode} value={m.oilName}>
            {m.materialCode}
          </option>
        ))}
      </datalist>
      <datalist id="shift-options">
        {COMMON_SHIFTS.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="status-options">
        <option value="PM">PM : PREVENTIVE MAINTENANCE</option>
        <option value="ADD">ADD : ADDITIONAL</option>
        <option value="BD">BD : BREAKDOWN</option>
      </datalist>
      <datalist id="unit-code-options">
        {UNIT_CODES.map((u) => (
          <option key={u.unitCode} value={u.unitCode}>
            {u.codeAlias !== u.unitCode ? `Alias: ${u.codeAlias}` : u.unitCode}
          </option>
        ))}
        {UNIT_CODES.filter((u, idx, arr) => {
          return (
            u.codeAlias !== u.unitCode &&
            arr.findIndex((x) => x.codeAlias === u.codeAlias) === idx
          );
        }).map((u) => (
          <option key={`alias-${u.codeAlias}`} value={u.codeAlias}>
            {`Unit: ${u.unitCode}`}
          </option>
        ))}
      </datalist>

      {/* A4 Landscape Paper Sheet */}
      <div
        ref={sheetRef}
        data-testid="printable-log-sheet"
        className="paper-sheet mx-auto w-[1080px] min-w-[1080px] print:w-full print:min-w-0 px-7 py-5 print:px-0 print:py-0 text-black bg-white"
      >
        {/* Sheet Title */}
        <h1 className="font-form-serif italic font-bold text-[21px] print:text-[19px] leading-tight text-center tracking-wide uppercase mb-2 print:mb-1.5">
          OIL &amp; LUBRICANT&apos;S CONSUMPTION LOG SHEET
        </h1>

        {/* Top Left Metadata Block */}
        <div className="mb-2 print:mb-1.5 text-[10.5px] font-bold leading-snug">
          <div className="grid grid-cols-[122px_14px_14px_320px] items-center h-[19px]">
            <label htmlFor="sheet-date-text" className="tracking-tight">
              DATE /TANGGAL
            </label>
            <span className="text-center">:</span>
            <span className="text-center">:</span>
            <div className="relative flex items-center border-b border-black h-[17px]">
              <input
                id="sheet-date-text"
                type="text"
                aria-label="Date atau Tanggal"
                value={formatDisplayDate(sheet.date)}
                onChange={(e) => updateMeta('date', e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full bg-transparent px-1 text-[11px] font-semibold font-data-mono focus:outline-none focus:bg-amber-50/60"
              />
              <button
                type="button"
                title="Pilih dari kalender"
                aria-label="Pilih tanggal dari kalender"
                onClick={() => datePickerRef.current?.showPicker?.()}
                className="no-print p-0.5 text-slate-500 hover:text-emerald-700 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
              <input
                ref={datePickerRef}
                type="date"
                aria-hidden="true"
                tabIndex={-1}
                value={/^\d{4}-\d{2}-\d{2}$/.test(sheet.date) ? sheet.date : ''}
                onChange={(e) => updateMeta('date', e.target.value)}
                className="no-print sr-only"
              />
            </div>
          </div>

          <div className="grid grid-cols-[122px_14px_14px_320px] items-center h-[19px]">
            <label htmlFor="sheet-working-shift" className="tracking-tight">
              WORKING SHIFT
            </label>
            <span className="text-center">:</span>
            <span className="text-center">:</span>
            <div className="border-b border-black h-[17px]">
              <input
                id="sheet-working-shift"
                type="text"
                list="shift-options"
                aria-label="Working Shift"
                value={sheet.workingShift}
                onChange={(e) => updateMeta('workingShift', e.target.value)}
                placeholder="Shift 1 / Shift 2"
                className="w-full h-full bg-transparent px-1 text-[11px] font-semibold focus:outline-none focus:bg-amber-50/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-[122px_14px_14px_320px] items-center h-[19px]">
            <label htmlFor="sheet-storage-location" className="tracking-tight">
              STORAGE LOCATION
            </label>
            <span className="text-center">:</span>
            <span className="text-center">:</span>
            <div
              ref={locationWrapperRef}
              className="relative flex items-center border-b border-black h-[17px]"
            >
              <input
                id="sheet-storage-location"
                type="text"
                aria-label="Storage Location"
                value={sheet.storageLocation}
                onFocus={() => setShowLocationMenu(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' || e.key === 'Tab') {
                    setShowLocationMenu(false);
                  }
                }}
                onChange={(e) => {
                  updateMeta('storageLocation', e.target.value);
                  setShowLocationMenu(true);
                }}
                placeholder={DEFAULT_STORAGE_LOCATION}
                className="w-full h-full bg-transparent px-1 text-[10.5px] font-semibold focus:outline-none focus:bg-amber-50/60"
              />
              <button
                type="button"
                title="Pilih Storage Location (Master Data)"
                aria-label="Pilih Storage Location"
                aria-expanded={showLocationMenu}
                onClick={() => setShowLocationMenu((prev) => !prev)}
                className="no-print p-0.5 text-slate-500 hover:text-emerald-700 cursor-pointer shrink-0"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showLocationMenu && (() => {
                const trimmedUpper = sheet.storageLocation.trim().toUpperCase();
                const isExactMaster = WAREHOUSE_LOCATIONS.some(
                  (loc) =>
                    `${loc.code} - ${loc.warehouseName}`.toUpperCase() ===
                      trimmedUpper || loc.code === trimmedUpper
                );
                const matchedLocations =
                  !trimmedUpper || isExactMaster
                    ? WAREHOUSE_LOCATIONS
                    : WAREHOUSE_LOCATIONS.filter(
                        (loc) =>
                          loc.code.includes(trimmedUpper) ||
                          loc.warehouseName.includes(trimmedUpper)
                      );
                const visibleLocations =
                  matchedLocations.length > 0
                    ? matchedLocations
                    : WAREHOUSE_LOCATIONS;

                return (
                  <div
                    role="listbox"
                    aria-label="Master Storage Location"
                    className="no-print absolute left-0 top-full mt-1 z-30 w-[370px] bg-white border border-slate-200 rounded-md shadow-lg py-1 text-left"
                  >
                    {visibleLocations.map((loc) => {
                      const formatted = `${loc.code} - ${loc.warehouseName}`;
                      const isSelected =
                        formatted.toUpperCase() === trimmedUpper ||
                        loc.code === trimmedUpper;
                      return (
                        <button
                          key={loc.code}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateMeta('storageLocation', formatted);
                            setShowLocationMenu(false);
                          }}
                          className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center gap-2 hover:bg-emerald-50 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-900 font-bold'
                              : 'text-slate-700 font-medium'
                          }`}
                        >
                          <span className="font-data-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 shrink-0">
                            {loc.code}
                          </span>
                          <span className="truncate">{loc.warehouseName}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Middle Section: Spacer (Left, STOCK IN hidden temporarily) + KARUNIA Logo (Center) + KETERANGAN Box (Right) */}
        <div className="grid grid-cols-[37%_36%_27%] items-end gap-3 mb-2 print:mb-1.5">
          {/* Left spacer keeps Logo centered & Keterangan Box right-aligned */}
          <div aria-hidden="true" />

          {/* Center: Karunia Armada Indonesia Logo */}
          <div className="flex items-center justify-center pb-2">
            <KaruniaLogo />
          </div>

          {/* Right: KETERANGAN / STATUS UNIT Legend Box */}
          <div className="flex justify-end pb-1">
            <div className="box-status-legend border-[1.5px] border-black px-2.5 py-1.5 w-full max-w-[258px]">
              <div className="text-[10px] font-bold underline tracking-tight mb-0.5">
                KETERANGAN / STATUS UNIT
              </div>
              <div className="grid grid-cols-[28px_10px_1fr] text-[10px] font-bold leading-[1.38]">
                <span>PM</span>
                <span>:</span>
                <span>PREVENTIVE MAINTENANCE</span>
                <span>ADD</span>
                <span>:</span>
                <span>ADDITIONAL</span>
                <span>BD</span>
                <span>:</span>
                <span>BREAKDOWN</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main 20-Row Consumption Log Table */}
        <table className="w-full border-collapse border-[1.5px] border-black text-[10px] table-fixed">
          <colgroup>
            <col className="w-[26px]" />
            <col className="w-[46px]" />
            <col className="w-[68px]" />
            <col className="w-[106px]" />
            <col className="w-[52px]" />
            <col className="w-[172px]" />
            <col className="w-[58px]" />
            <col className="w-[58px]" />
            <col className="w-[52px]" />
            <col className="w-[50px]" />
            <col className="w-[46px]" />
            <col className="w-[50px]" />
            <col className="w-[50px]" />
            <col className="w-[92px]" />
          </colgroup>
          <thead>
            <tr className="h-[19px] font-bold text-center">
              <th rowSpan={2} className="border border-black px-0.5 align-middle">
                No.
              </th>
              <th rowSpan={2} className="border border-black px-0.5 align-middle">
                Waktu
              </th>
              <th rowSpan={2} className="border border-black px-1 align-middle">
                No. Unit
              </th>
              <th rowSpan={2} className="border border-black px-1 align-middle">
                Model Unit
              </th>
              <th rowSpan={2} className="border border-black px-1 align-middle">
                HM
              </th>
              <th rowSpan={2} className="border border-black px-1 align-middle">
                OIL &amp; LUBE DESCRIPTION
              </th>
              <th
                colSpan={3}
                className="border border-black cell-flowmeter italic font-bold px-1"
              >
                FLOWMETER
              </th>
              <th
                colSpan={2}
                className="border border-black cell-greasing font-bold px-1"
              >
                GREASING
              </th>
              <th colSpan={2} className="border border-black font-bold px-1">
                COLLANT
              </th>
              <th
                rowSpan={2}
                className="border border-black px-1 align-middle leading-tight"
              >
                KETERANGAN
                <br />
                STATUS
              </th>
            </tr>
            <tr className="h-[18px] font-bold text-center text-[9.5px]">
              <th className="border border-black cell-flowmeter px-0.5">AWAL</th>
              <th className="border border-black cell-flowmeter px-0.5">AKHIR</th>
              <th className="border border-black cell-flowmeter px-0.5">LITER</th>
              <th className="border border-black cell-greasing px-0.5">MENIT</th>
              <th className="border border-black cell-greasing px-0.5">KG</th>
              <th className="border border-black px-0.5">MENIT</th>
              <th className="border border-black px-0.5">LITER</th>
            </tr>
          </thead>

          <tbody>
            {sheet.rows.map((row, idx) => {
              const awalNum = parseLocaleNumber(row.flowmeterAwal);
              const akhirNum = parseLocaleNumber(row.flowmeterAkhir);
              const isFlowAnomaly =
                awalNum !== null && akhirNum !== null && akhirNum < awalNum;

              return (
                <tr key={row.rowNumber} className="h-[22px] print:h-[20px]">
                  {/* No. */}
                  <td className="border border-black text-center font-medium tabular-nums">
                    {row.rowNumber}
                  </td>

                  {/* Waktu */}
                  <td className="border border-black relative p-0">
                    <input
                      type="text"
                      data-cell={`${idx}-waktu`}
                      aria-label={`Log baris ${row.rowNumber} Waktu`}
                      value={row.waktu}
                      onFocus={() => setFocusedWaktuRow(idx)}
                      onBlur={() => setTimeout(() => setFocusedWaktuRow(null), 150)}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'waktu')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'waktu', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-amber-50/70"
                    />
                    {focusedWaktuRow === idx && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          updateConsumptionRow(idx, 'waktu', getCurrentTimeHHmm());
                        }}
                        title="Isi jam sekarang"
                        aria-label={`Isi waktu sekarang baris ${row.rowNumber}`}
                        className="no-print absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-emerald-700 text-white rounded p-0.5 shadow cursor-pointer"
                      >
                        <Clock className="w-3 h-3" />
                      </button>
                    )}
                  </td>

                  {/* No. Unit */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      list="unit-code-options"
                      data-cell={`${idx}-noUnit`}
                      aria-label={`Log baris ${row.rowNumber} No. Unit`}
                      value={row.noUnit}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'noUnit')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'noUnit', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-medium text-[10px] px-1 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>

                  {/* Model Unit */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      data-cell={`${idx}-modelUnit`}
                      aria-label={`Log baris ${row.rowNumber} Model Unit`}
                      value={row.modelUnit}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'modelUnit')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'modelUnit', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-left text-[10px] px-1 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>

                  {/* HM */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-hm`}
                      aria-label={`Log baris ${row.rowNumber} HM`}
                      value={row.hm}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'hm')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'hm', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>

                  {/* OIL & LUBE DESCRIPTION */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      list="oil-lube-options"
                      data-cell={`${idx}-oil`}
                      aria-label={`Log baris ${row.rowNumber} Oil & Lube Description`}
                      value={row.oilLubeDescription}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'oil')}
                      onChange={(e) =>
                        updateConsumptionRow(
                          idx,
                          'oilLubeDescription',
                          e.target.value
                        )
                      }
                      className="w-full h-full bg-transparent text-left text-[10px] px-1.5 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>

                  {/* FLOWMETER AWAL */}
                  <td className="border border-black cell-flowmeter p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-fmAwal`}
                      aria-label={`Log baris ${row.rowNumber} Flowmeter Awal`}
                      value={row.flowmeterAwal}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'fmAwal')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'flowmeterAwal', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-amber-200/50"
                    />
                  </td>

                  {/* FLOWMETER AKHIR */}
                  <td className="border border-black cell-flowmeter p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-fmAkhir`}
                      aria-label={`Log baris ${row.rowNumber} Flowmeter Akhir`}
                      value={row.flowmeterAkhir}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'fmAkhir')}
                      onChange={(e) =>
                        updateConsumptionRow(
                          idx,
                          'flowmeterAkhir',
                          e.target.value
                        )
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-amber-200/50"
                    />
                  </td>

                  {/* FLOWMETER LITER */}
                  <td
                    className={`border border-black cell-flowmeter relative p-0 ${
                      isFlowAnomaly
                        ? 'ring-2 ring-inset ring-red-600 print:ring-0'
                        : ''
                    }`}
                    title={
                      isFlowAnomaly
                        ? 'Flowmeter Akhir lebih kecil dari Flowmeter Awal'
                        : row.flowmeterManualOverride
                          ? 'Diisi manual (klik ikon reset untuk hitung otomatis)'
                          : undefined
                    }
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-fmLiter`}
                      aria-label={`Log baris ${row.rowNumber} Flowmeter Liter`}
                      value={row.flowmeterLiter}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'fmLiter')}
                      onChange={(e) =>
                        updateConsumptionRow(
                          idx,
                          'flowmeterLiter',
                          e.target.value
                        )
                      }
                      className={`w-full h-full bg-transparent text-center font-data-mono font-semibold text-[10px] px-0.5 focus:outline-none focus:bg-amber-200/50 ${
                        isFlowAnomaly ? 'text-red-700 print:text-black' : ''
                      }`}
                    />
                    {row.flowmeterManualOverride && sheet.autoCalcFlowmeter && (
                      <button
                        type="button"
                        onClick={() => resetFlowmeterOverride(idx)}
                        title="Hitung ulang otomatis (Akhir - Awal)"
                        aria-label={`Reset hitung otomatis baris ${row.rowNumber}`}
                        className="no-print absolute right-0.5 top-1/2 -translate-y-1/2 text-amber-800 hover:text-black cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </td>

                  {/* GREASING MENIT */}
                  <td className="border border-black cell-greasing p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-gMenit`}
                      aria-label={`Log baris ${row.rowNumber} Greasing Menit`}
                      value={row.greasingMenit}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'gMenit')}
                      onChange={(e) =>
                        updateConsumptionRow(
                          idx,
                          'greasingMenit',
                          e.target.value
                        )
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-sky-200/50"
                    />
                  </td>

                  {/* GREASING KG */}
                  <td className="border border-black cell-greasing p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-gKg`}
                      aria-label={`Log baris ${row.rowNumber} Greasing Kg`}
                      value={row.greasingKg}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'gKg')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'greasingKg', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-sky-200/50"
                    />
                  </td>

                  {/* COLLANT MENIT */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-cMenit`}
                      aria-label={`Log baris ${row.rowNumber} Collant Menit`}
                      value={row.collantMenit}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'cMenit')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'collantMenit', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>

                  {/* COLLANT LITER */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      data-cell={`${idx}-cLiter`}
                      aria-label={`Log baris ${row.rowNumber} Collant Liter`}
                      value={row.collantLiter}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'cLiter')}
                      onChange={(e) =>
                        updateConsumptionRow(idx, 'collantLiter', e.target.value)
                      }
                      className="w-full h-full bg-transparent text-center font-data-mono text-[10px] px-0.5 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>

                  {/* KETERANGAN STATUS */}
                  <td className="border border-black p-0">
                    <input
                      type="text"
                      list="status-options"
                      data-cell={`${idx}-status`}
                      aria-label={`Log baris ${row.rowNumber} Keterangan Status`}
                      value={row.keteranganStatus}
                      onKeyDown={(e) => handleCellKeyDown(e, idx, 'status')}
                      onChange={(e) =>
                        updateConsumptionRow(
                          idx,
                          'keteranganStatus',
                          e.target.value.toUpperCase()
                        )
                      }
                      className="w-full h-full bg-transparent text-center font-semibold text-[10px] px-1 focus:outline-none focus:bg-amber-50/70"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer Signature Section — Exact 4-column layout from PDF */}
        <div className="mt-2.5 print:mt-2 grid grid-cols-4 gap-8 text-[10.5px] font-bold">
          {/* Col 1: Created By -> Driver / Mechanic */}
          <div className="flex flex-col">
            <div className="mb-1">Created By,</div>
            <div className="h-[34px] print:h-[30px] flex items-end">
              <input
                type="text"
                aria-label="Nama Driver atau Mechanic"
                value={sheet.signatures.driverMechanic}
                onChange={(e) =>
                  updateSignature('driverMechanic', e.target.value)
                }
                placeholder="Nama..."
                className="w-full bg-transparent text-center text-[10.5px] font-medium pb-0.5 focus:outline-none focus:bg-amber-50/60"
              />
            </div>
            <div className="border-t border-black pt-0.5 text-center w-[155px] mx-auto">
              Driver / Mechanic
            </div>
          </div>

          {/* Col 2: Reconcile By -> GL / SPV Plant */}
          <div className="flex flex-col">
            <div className="mb-1 text-right pr-2">Reconcile By,</div>
            <div className="h-[34px] print:h-[30px] flex items-end">
              <input
                type="text"
                aria-label="Nama GL atau SPV Plant"
                value={sheet.signatures.glSpvPlant}
                onChange={(e) => updateSignature('glSpvPlant', e.target.value)}
                placeholder="Nama..."
                className="w-full bg-transparent text-center text-[10.5px] font-medium pb-0.5 focus:outline-none focus:bg-amber-50/60"
              />
            </div>
            <div className="border-t border-black pt-0.5 text-center w-[155px] mx-auto">
              GL / SPV Plant
            </div>
          </div>

          {/* Col 3: (Reconcile) -> GL / SPV SCM */}
          <div className="flex flex-col">
            <div className="mb-1 opacity-0 select-none" aria-hidden="true">
              &nbsp;
            </div>
            <div className="h-[34px] print:h-[30px] flex items-end">
              <input
                type="text"
                aria-label="Nama GL atau SPV SCM"
                value={sheet.signatures.glSpvScm}
                onChange={(e) => updateSignature('glSpvScm', e.target.value)}
                placeholder="Nama..."
                className="w-full bg-transparent text-center text-[10.5px] font-medium pb-0.5 focus:outline-none focus:bg-amber-50/60"
              />
            </div>
            <div className="border-t border-black pt-0.5 text-center w-[155px] mx-auto">
              GL / SPV SCM
            </div>
          </div>

          {/* Col 4: Approved By -> DEPARTEMENT HEAD PLANT */}
          <div className="flex flex-col">
            <div className="mb-1 text-right pr-4">Approved By,</div>
            <div className="h-[34px] print:h-[30px] flex items-end">
              <input
                type="text"
                aria-label="Nama Departement Head Plant"
                value={sheet.signatures.deptHeadPlant}
                onChange={(e) =>
                  updateSignature('deptHeadPlant', e.target.value)
                }
                placeholder="Nama..."
                className="w-full bg-transparent text-center text-[10.5px] font-medium pb-0.5 focus:outline-none focus:bg-amber-50/60"
              />
            </div>
            <div className="border-t border-black pt-0.5 text-center w-[175px] mx-auto">
              DEPARTEMENT HEAD PLANT
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
