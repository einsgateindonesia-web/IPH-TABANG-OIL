import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Plus } from 'lucide-react';
import {
  COMPARTEMENTS,
  MATERIAL_CODES,
  TYPE_OF_OUT_OPTIONS,
  UNIT_CODES,
  WAREHOUSE_LOCATIONS,
} from '../data/masterData';
import type {
  ConsumptionRow,
  LogSheet,
  OutputOverrideMap,
  OutputRowOverride,
  StockInRow,
} from '../types/logSheet';
import {
  COMMON_LOCATIONS,
  COMMON_SHIFTS,
  formatDisplayDate,
  isConsumptionRowFilled,
  isStockInRowFilled,
} from '../utils/logSheet';
import {
  formatDateYYYYMMDD,
  inferComponentCode,
  inferStorageLocCode,
  mapSheetsToOutputRows,
  resolveUnitIdentity,
} from '../utils/outputMapper';
import {
  type QuickOutputDraft,
  commitOutputDraftToSheet,
  createEmptyConsumptionRow,
  findFirstEmptyConsumptionRowIndex,
  findFirstEmptyStockInRowIndex,
  isQuickOutputDraftReady,
  updateSheetConsumptionCell,
  updateSheetStockInCell,
} from '../utils/spreadsheetEditor';
import {
  columnIndexToLetter,
  type WorksheetSpec,
} from '../utils/spreadsheetBuilder';
import {
  resolveGridNavigationTarget,
  SPREADSHEET_LOG_COLUMNS,
  SPREADSHEET_OUTPUT_COLUMNS,
  SPREADSHEET_STOCK_IN_COLUMNS,
} from '../utils/tableNavigation';

interface EditableSpreadsheetGridProps {
  activePreviewSheet: WorksheetSpec;
  targetSheets: LogSheet[];
  activeSheet: LogSheet;
  overrides: OutputOverrideMap;
  fallbackStorageCode: string;
  splitGreaseAndCoolant: boolean;
  onUpdateSheet: (sheetId: string, updater: (sheet: LogSheet) => LogSheet) => void;
  onUpdateOverride: (rowKey: string, patch: Partial<OutputRowOverride>) => void;
  onOpenOutputTab: () => void;
}

const EMPTY_DRAFT: QuickOutputDraft = {
  unitCode: '',
  codeAlias: '',
  timeHHMM: '',
  componentCode: '',
  typeOfOutCode: '',
  storageLocCode: '',
  hmKm: '',
  materialCode: '',
  qtyLiter: '',
};

export function EditableSpreadsheetGrid({
  activePreviewSheet,
  targetSheets,
  activeSheet,
  overrides,
  fallbackStorageCode,
  splitGreaseAndCoolant,
  onUpdateSheet,
  onUpdateOverride,
  onOpenOutputTab,
}: EditableSpreadsheetGridProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [draft, setDraft] = useState<QuickOutputDraft>(EMPTY_DRAFT);
  const [justSavedBadge, setJustSavedBadge] = useState(false);

  const isOutputTab = activePreviewSheet.title === 'Format Output';
  const isLogTab = activePreviewSheet.title === 'Log Sheet';
  const isStockInTab = activePreviewSheet.title === 'Stock In';
  const isEditableTab = isOutputTab || isLogTab || isStockInTab;

  const outputRows = useMemo(
    () =>
      isOutputTab
        ? mapSheetsToOutputRows(targetSheets, {
            overrides,
            fallbackStorageCode,
            splitGreaseAndCoolant,
          })
        : [],
    [
      isOutputTab,
      targetSheets,
      overrides,
      fallbackStorageCode,
      splitGreaseAndCoolant,
    ]
  );

  const editableLogEntries = useMemo(() => {
    if (!isLogTab) return [];
    const entries: {
      sheet: LogSheet;
      rowIndex: number;
      row: ConsumptionRow;
      isBlankEntry: boolean;
    }[] = [];

    for (const sheet of targetSheets) {
      sheet.rows.forEach((row, idx) => {
        if (isConsumptionRowFilled(row)) {
          entries.push({ sheet, rowIndex: idx, row, isBlankEntry: false });
        }
      });
    }

    const blankIdx = findFirstEmptyConsumptionRowIndex(activeSheet);
    const blankRow =
      activeSheet.rows[blankIdx] ?? createEmptyConsumptionRow(blankIdx + 1);
    entries.push({
      sheet: activeSheet,
      rowIndex: blankIdx,
      row: blankRow,
      isBlankEntry: true,
    });

    return entries;
  }, [isLogTab, targetSheets, activeSheet]);

  const editableStockInEntries = useMemo(() => {
    if (!isStockInTab) return [];
    const entries: {
      sheet: LogSheet;
      rowIndex: number;
      row: StockInRow;
      isBlankEntry: boolean;
    }[] = [];

    for (const sheet of targetSheets) {
      sheet.stockIn.forEach((row, idx) => {
        if (isStockInRowFilled(row)) {
          entries.push({ sheet, rowIndex: idx, row, isBlankEntry: false });
        }
      });
    }

    const blankIdx = findFirstEmptyStockInRowIndex(activeSheet);
    const blankRow = activeSheet.stockIn[blankIdx] ?? {
      rowNumber: blankIdx + 1,
      waktu: '',
      description: '',
      quantity: '',
    };
    entries.push({
      sheet: activeSheet,
      rowIndex: blankIdx,
      row: blankRow,
      isBlankEntry: true,
    });

    return entries;
  }, [isStockInTab, targetSheets, activeSheet]);

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

  const selectableMaterials = useMemo(
    () =>
      MATERIAL_CODES.filter(
        (m) =>
          !m.oilName.includes('SEAL') &&
          !m.oilName.includes('GASKET') &&
          !m.oilName.includes('NIPPLE') &&
          !m.oilName.includes('DIPSTICK') &&
          !m.oilName.includes('GROMMET') &&
          !m.oilName.includes('WASHER') &&
          !m.oilName.includes('PLUG') &&
          !m.oilName.includes('COLLECT')
      ),
    []
  );

  const defaultDraftLoc = useMemo(
    () => inferStorageLocCode(activeSheet.storageLocation, fallbackStorageCode),
    [activeSheet.storageLocation, fallbackStorageCode]
  );

  const effectiveDraftUnit = resolveUnitIdentity(draft.unitCode);
  const effectiveDraftAlias = draft.codeAlias || effectiveDraftUnit.codeAlias;
  const effectiveDraftComponent =
    draft.componentCode || inferComponentCode(draft.materialCode, 'oil');
  const effectiveDraftLoc = draft.storageLocCode || defaultDraftLoc;

  const triggerSavedIndicator = () => {
    setJustSavedBadge(true);
    setTimeout(() => setJustSavedBadge(false), 1800);
  };

  const handleCommitDraft = () => {
    if (!isQuickOutputDraftReady(draft)) return;

    const committed = commitOutputDraftToSheet(
      activeSheet,
      {
        ...draft,
        codeAlias: effectiveDraftAlias,
        componentCode: effectiveDraftComponent,
        storageLocCode: effectiveDraftLoc,
      },
      fallbackStorageCode
    );

    onUpdateSheet(activeSheet.id, () => committed.updatedSheet);
    if (committed.overridePatch) {
      onUpdateOverride(committed.rowKey, committed.overridePatch);
    }
    setDraft(EMPTY_DRAFT);
    triggerSavedIndicator();
  };

  const handleDraftRowBlur = (e: React.FocusEvent<HTMLTableRowElement>) => {
    const nextFocused = e.relatedTarget as Node | null;
    if (nextFocused && e.currentTarget.contains(nextFocused)) {
      return;
    }
    if (
      draft.unitCode.trim() &&
      (draft.materialCode.trim() || draft.qtyLiter.trim())
    ) {
      handleCommitDraft();
    }
  };

  const handleGridKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    colKey: string,
    columns: readonly string[],
    rowCount: number,
    onEnterDraft?: () => void
  ) => {
    const isSelect = e.currentTarget.tagName === 'SELECT';
    if (!isSelect && e.key === 'F2') {
      e.preventDefault();
      const inputEl = e.currentTarget as HTMLInputElement;
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
      return;
    }

    if (onEnterDraft && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnterDraft();
      return;
    }

    const targetCoord = resolveGridNavigationTarget({
      key: e.key,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      rowIndex,
      colKey,
      rowCount,
      columns,
      isSelectElement: isSelect,
      selection: isSelect
        ? undefined
        : {
            valueLength: (e.currentTarget as HTMLInputElement).value.length,
            selectionStart: (e.currentTarget as HTMLInputElement)
              .selectionStart,
            selectionEnd: (e.currentTarget as HTMLInputElement).selectionEnd,
          },
    });

    if (targetCoord && tableRef.current) {
      e.preventDefault();
      const nextEl = tableRef.current.querySelector<
        HTMLInputElement | HTMLSelectElement
      >(`[data-sp-cell="${targetCoord.rowIndex}-${targetCoord.colKey}"]`);
      if (nextEl) {
        nextEl.focus();
        if (nextEl instanceof HTMLInputElement) {
          nextEl.select();
        }
      }
    }
  };

  const masterPreviewRows = !isEditableTab
    ? activePreviewSheet.rows.slice(0, 120)
    : [];

  return (
    <>
      {/* Shared datalists for Spreadsheet editing */}
      <datalist id="sp-unit-options">
        {UNIT_CODES.map((u) => (
          <option key={u.unitCode} value={u.unitCode}>
            {u.codeAlias !== u.unitCode ? `Alias: ${u.codeAlias}` : u.unitCode}
          </option>
        ))}
        {uniqueCodeAliases
          .filter((u) => u.codeAlias !== u.unitCode)
          .map((u) => (
            <option key={`sp-alias-${u.codeAlias}`} value={u.codeAlias}>
              {`Unit: ${u.unitCode}`}
            </option>
          ))}
      </datalist>
      <datalist id="sp-alias-options">
        {uniqueCodeAliases.map((u) => (
          <option key={u.codeAlias} value={u.codeAlias}>
            {u.unitCode}
          </option>
        ))}
      </datalist>
      <datalist id="sp-material-options">
        {selectableMaterials.map((m) => (
          <option key={m.materialCode} value={m.materialCode}>
            {m.oilName}
          </option>
        ))}
      </datalist>
      <datalist id="sp-status-options">
        <option value="PM">PM : PREVENTIVE MAINTENANCE</option>
        <option value="ADD">ADD : ADDITIONAL</option>
        <option value="BD">BD : BREAKDOWN</option>
      </datalist>
      <datalist id="sp-shift-options">
        {COMMON_SHIFTS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="sp-location-options">
        {COMMON_LOCATIONS.map((loc) => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      {/* Live Persistence Strip */}
      {isEditableTab && (
        <div className="px-4 py-2 bg-emerald-50/60 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-emerald-950">
            <span className="font-semibold">
              Mode Input Spreadsheet Langsung:
            </span>
            <span className="text-emerald-800">
              {isOutputTab
                ? 'Edit sel atau isi baris baru (+) di bawah — otomatis tersimpan ke Lembar Log & Format Output.'
                : isLogTab
                  ? 'Ketik di baris manapun atau baris kosong paling bawah — otomatis masuk ke Format Output.'
                  : 'Input atau edit Stock In langsung di tabel.'}
            </span>
            {justSavedBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-700 text-white font-semibold">
                <Check className="w-3 h-3" aria-hidden="true" />
                Tersimpan ke Format Output
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenOutputTab}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer"
          >
            <span>Lihat Format Output</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table
          ref={tableRef}
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
              {isOutputTab && (
                <th className="border border-slate-300 py-1 px-2 text-center font-medium">
                  K
                </th>
              )}
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
              {isOutputTab && (
                <th className="border border-slate-400/50 px-2.5 py-2 whitespace-nowrap text-center">
                  Aksi
                </th>
              )}
            </tr>
          </thead>

          {/* Editable Tab 1: Format Output */}
          {isOutputTab && (
            <tbody>
              {outputRows.map((row, rowIdx) => {
                const rowBg =
                  rowIdx % 2 === 0 ? 'bg-[#D9E2F3]/55' : 'bg-white';
                const totalRows = outputRows.length + 1;
                return (
                  <tr
                    key={row.rowKey}
                    className={`${rowBg} hover:bg-amber-50/50`}
                  >
                    <td className="border border-slate-300 bg-slate-100 text-slate-500 text-center font-data-mono text-[11px] py-1 px-1.5">
                      {rowIdx + 2}
                    </td>
                    {/* Unit Code* */}
                    <td className="border border-slate-300 p-0 min-w-[96px]">
                      <input
                        type="text"
                        list="sp-unit-options"
                        data-sp-cell={`${rowIdx}-unitCode`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Unit Code`}
                        value={row.unitCode}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'unitCode',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            unitCode: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-2 py-1.5 font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Code Alias */}
                    <td className="border border-slate-300 p-0 min-w-[100px]">
                      <input
                        type="text"
                        list="sp-alias-options"
                        data-sp-cell={`${rowIdx}-codeAlias`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Code Alias`}
                        value={row.codeAlias}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'codeAlias',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            codeAlias: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Date YYYYMMDD* */}
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-data-mono text-slate-900 whitespace-nowrap">
                      {row.dateYYYYMMDD || '-'}
                    </td>
                    {/* Time HH:MM* */}
                    <td className="border border-slate-300 p-0 min-w-[74px]">
                      <input
                        type="text"
                        data-sp-cell={`${rowIdx}-timeHHMM`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Time`}
                        value={row.timeHHMM}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'timeHHMM',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(row.sourceSheetId, (s) =>
                            updateSheetConsumptionCell(
                              s,
                              row.sourceRowNumber - 1,
                              'waktu',
                              e.target.value
                            )
                          )
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-center font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Compnent* */}
                    <td className="border border-slate-300 p-0 min-w-[120px]">
                      <select
                        data-sp-cell={`${rowIdx}-componentCode`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Compnent`}
                        value={row.componentCode}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'componentCode',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            componentCode: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600 cursor-pointer"
                      >
                        <option value="">-- Pilih --</option>
                        {COMPARTEMENTS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} ({c.compartement})
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Type Of Out */}
                    <td className="border border-slate-300 p-0 min-w-[125px]">
                      <select
                        data-sp-cell={`${rowIdx}-typeOfOutCode`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Type Of Out`}
                        value={row.typeOfOutCode}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'typeOfOutCode',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            typeOfOutCode: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600 cursor-pointer"
                      >
                        <option value="">-- Pilih --</option>
                        {TYPE_OF_OUT_OPTIONS.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.code} — {t.typeOfOut}
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Code Storage Loc. */}
                    <td className="border border-slate-300 p-0 min-w-[92px]">
                      <select
                        data-sp-cell={`${rowIdx}-storageLocCode`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Storage Loc`}
                        value={row.storageLocCode}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'storageLocCode',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            storageLocCode: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600 cursor-pointer"
                      >
                        <option value="">-- Pilih --</option>
                        {WAREHOUSE_LOCATIONS.map((loc) => (
                          <option key={loc.code} value={loc.code}>
                            {loc.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Hm/Km* */}
                    <td className="border border-slate-300 p-0 min-w-[76px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-hmKm`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Hm/Km`}
                        value={row.hmKm}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'hmKm',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(row.sourceSheetId, (s) =>
                            updateSheetConsumptionCell(
                              s,
                              row.sourceRowNumber - 1,
                              'hm',
                              e.target.value
                            )
                          )
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Material Code* */}
                    <td className="border border-slate-300 p-0 min-w-[180px]">
                      <input
                        type="text"
                        list="sp-material-options"
                        data-sp-cell={`${rowIdx}-materialCode`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Material Code`}
                        value={row.materialCode}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'materialCode',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            materialCode: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-2 py-1.5 font-data-mono font-medium text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Qty* (Liter) */}
                    <td className="border border-slate-300 p-0 min-w-[78px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-qtyLiter`}
                        aria-label={`Spreadsheet Output Baris ${rowIdx + 1} Qty`}
                        value={row.qtyLiter}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'qtyLiter',
                            SPREADSHEET_OUTPUT_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateOverride(row.rowKey, {
                            qtyLiter: e.target.value,
                          })
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center text-[11px] text-slate-400">
                      Tersimpan
                    </td>
                  </tr>
                );
              })}

              {/* Quick Add Row directly in Spreadsheet -> Format Output */}
              <tr
                data-testid="spreadsheet-output-draft-row"
                onBlur={handleDraftRowBlur}
                className="bg-emerald-50/45 hover:bg-emerald-50/75"
              >
                <td
                  title="Baris input baru"
                  className="border border-slate-300 bg-emerald-100/80 text-emerald-800 text-center font-bold py-1 px-1.5"
                >
                  <Plus className="w-3.5 h-3.5 mx-auto" aria-hidden="true" />
                </td>
                <td className="border border-slate-300 p-0 min-w-[96px]">
                  <input
                    type="text"
                    list="sp-unit-options"
                    data-sp-cell={`${outputRows.length}-unitCode`}
                    aria-label="Input Spreadsheet baru Unit Code"
                    placeholder="Isi Unit..."
                    value={draft.unitCode}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'unitCode',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        unitCode: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-2 py-1.5 font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                  />
                </td>
                <td className="border border-slate-300 p-0 min-w-[100px]">
                  <input
                    type="text"
                    list="sp-alias-options"
                    data-sp-cell={`${outputRows.length}-codeAlias`}
                    aria-label="Input Spreadsheet baru Code Alias"
                    placeholder="Auto..."
                    value={effectiveDraftAlias}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'codeAlias',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        codeAlias: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-2 py-1.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-data-mono text-slate-600 whitespace-nowrap">
                  {formatDateYYYYMMDD(activeSheet.date) || '-'}
                </td>
                <td className="border border-slate-300 p-0 min-w-[74px]">
                  <input
                    type="text"
                    data-sp-cell={`${outputRows.length}-timeHHMM`}
                    aria-label="Input Spreadsheet baru Time"
                    placeholder="HH:MM"
                    value={draft.timeHHMM}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'timeHHMM',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        timeHHMM: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-2 py-1.5 text-center font-data-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                  />
                </td>
                <td className="border border-slate-300 p-0 min-w-[120px]">
                  <select
                    data-sp-cell={`${outputRows.length}-componentCode`}
                    aria-label="Input Spreadsheet baru Compnent"
                    value={effectiveDraftComponent}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'componentCode',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        componentCode: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600 cursor-pointer"
                  >
                    <option value="">-- Auto --</option>
                    {COMPARTEMENTS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.compartement})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-slate-300 p-0 min-w-[125px]">
                  <select
                    data-sp-cell={`${outputRows.length}-typeOfOutCode`}
                    aria-label="Input Spreadsheet baru Type Of Out"
                    value={draft.typeOfOutCode}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'typeOfOutCode',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        typeOfOutCode: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600 cursor-pointer"
                  >
                    <option value="">-- Pilih --</option>
                    {TYPE_OF_OUT_OPTIONS.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code} — {t.typeOfOut}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-slate-300 p-0 min-w-[92px]">
                  <select
                    data-sp-cell={`${outputRows.length}-storageLocCode`}
                    aria-label="Input Spreadsheet baru Storage Loc"
                    value={effectiveDraftLoc}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'storageLocCode',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        storageLocCode: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-1.5 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600 cursor-pointer"
                  >
                    <option value="">-- Pilih --</option>
                    {WAREHOUSE_LOCATIONS.map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {loc.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-slate-300 p-0 min-w-[76px]">
                  <input
                    type="text"
                    inputMode="decimal"
                    data-sp-cell={`${outputRows.length}-hmKm`}
                    aria-label="Input Spreadsheet baru Hm/Km"
                    placeholder="HM..."
                    value={draft.hmKm}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'hmKm',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, hmKm: e.target.value }))
                    }
                    className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                  />
                </td>
                <td className="border border-slate-300 p-0 min-w-[180px]">
                  <input
                    type="text"
                    list="sp-material-options"
                    data-sp-cell={`${outputRows.length}-materialCode`}
                    aria-label="Input Spreadsheet baru Material Code"
                    placeholder="Kode Oli / Material..."
                    value={draft.materialCode}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'materialCode',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        materialCode: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-2 py-1.5 font-data-mono font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                  />
                </td>
                <td className="border border-slate-300 p-0 min-w-[78px]">
                  <input
                    type="text"
                    inputMode="decimal"
                    data-sp-cell={`${outputRows.length}-qtyLiter`}
                    aria-label="Input Spreadsheet baru Qty"
                    placeholder="Qty..."
                    value={draft.qtyLiter}
                    onKeyDown={(e) =>
                      handleGridKeyDown(
                        e,
                        outputRows.length,
                        'qtyLiter',
                        SPREADSHEET_OUTPUT_COLUMNS,
                        outputRows.length + 1,
                        handleCommitDraft
                      )
                    }
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        qtyLiter: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                  />
                </td>
                <td className="border border-slate-300 px-1.5 py-1 text-center whitespace-nowrap">
                  <button
                    type="button"
                    disabled={!isQuickOutputDraftReady(draft)}
                    onClick={handleCommitDraft}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 rounded cursor-pointer"
                  >
                    <span>Simpan Baris</span>
                  </button>
                </td>
              </tr>
            </tbody>
          )}

          {/* Editable Tab 2: Log Sheet */}
          {isLogTab && (
            <tbody>
              {editableLogEntries.map((entry, rowIdx) => {
                const { sheet, rowIndex, row, isBlankEntry } = entry;
                const rowBg = isBlankEntry
                  ? 'bg-emerald-50/45 hover:bg-emerald-50/75'
                  : rowIdx % 2 === 0
                    ? 'bg-[#D9E2F3]/55 hover:bg-amber-50/50'
                    : 'bg-white hover:bg-amber-50/50';
                const resolvedAlias = resolveUnitIdentity(row.noUnit).codeAlias;
                const totalRows = editableLogEntries.length;

                const updateCell = (
                  field: keyof Omit<ConsumptionRow, 'rowNumber'>,
                  val: string
                ) => {
                  onUpdateSheet(sheet.id, (s) =>
                    updateSheetConsumptionCell(s, rowIndex, field, val)
                  );
                };

                return (
                  <tr
                    key={`${sheet.id}-${row.rowNumber}`}
                    data-testid={
                      isBlankEntry ? 'spreadsheet-log-draft-row' : undefined
                    }
                    className={rowBg}
                  >
                    <td className="border border-slate-300 bg-slate-100 text-slate-500 text-center font-data-mono text-[11px] py-1 px-1.5">
                      {isBlankEntry ? '+' : rowIdx + 2}
                    </td>
                    {/* Tanggal */}
                    <td className="border border-slate-300 p-0 min-w-[96px]">
                      <input
                        type="text"
                        data-sp-cell={`${rowIdx}-date`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Tanggal`}
                        value={formatDisplayDate(sheet.date) || sheet.date}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'date',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) => ({
                            ...s,
                            date: e.target.value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="w-full bg-transparent px-2 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Shift */}
                    <td className="border border-slate-300 p-0 min-w-[78px]">
                      <input
                        type="text"
                        list="sp-shift-options"
                        data-sp-cell={`${rowIdx}-workingShift`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Shift`}
                        value={sheet.workingShift}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'workingShift',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) => ({
                            ...s,
                            workingShift: e.target.value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Lokasi Penyimpanan */}
                    <td className="border border-slate-300 p-0 min-w-[175px]">
                      <input
                        type="text"
                        list="sp-location-options"
                        data-sp-cell={`${rowIdx}-storageLocation`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Lokasi`}
                        value={sheet.storageLocation}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'storageLocation',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) => ({
                            ...s,
                            storageLocation: e.target.value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* No. */}
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-data-mono text-slate-600">
                      {row.rowNumber}
                    </td>
                    {/* Waktu */}
                    <td className="border border-slate-300 p-0 min-w-[68px]">
                      <input
                        type="text"
                        data-sp-cell={`${rowIdx}-waktu`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Waktu`}
                        placeholder={isBlankEntry ? 'HH:MM' : undefined}
                        value={row.waktu}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'waktu',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) => updateCell('waktu', e.target.value)}
                        className="w-full bg-transparent px-2 py-1.5 text-center font-data-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* No. Unit */}
                    <td className="border border-slate-300 p-0 min-w-[96px]">
                      <input
                        type="text"
                        list="sp-unit-options"
                        data-sp-cell={`${rowIdx}-noUnit`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} No Unit`}
                        placeholder={isBlankEntry ? 'Isi Unit...' : undefined}
                        value={row.noUnit}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'noUnit',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) => updateCell('noUnit', e.target.value)}
                        className="w-full bg-transparent px-2 py-1.5 font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Code Alias (Auto) */}
                    <td className="border border-slate-300 px-2 py-1.5 font-data-mono text-slate-600 whitespace-nowrap">
                      {resolvedAlias}
                    </td>
                    {/* Model Unit */}
                    <td className="border border-slate-300 p-0 min-w-[125px]">
                      <input
                        type="text"
                        data-sp-cell={`${rowIdx}-modelUnit`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Model Unit`}
                        value={row.modelUnit}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'modelUnit',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('modelUnit', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* HM */}
                    <td className="border border-slate-300 p-0 min-w-[74px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-hm`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} HM`}
                        value={row.hm}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'hm',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) => updateCell('hm', e.target.value)}
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Oil & Lube Description */}
                    <td className="border border-slate-300 p-0 min-w-[185px]">
                      <input
                        type="text"
                        list="sp-material-options"
                        data-sp-cell={`${rowIdx}-oil`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Oil & Lube Description`}
                        placeholder={isBlankEntry ? 'Kode Oli...' : undefined}
                        value={row.oilLubeDescription}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'oil',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('oilLubeDescription', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 font-data-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Flowmeter Awal */}
                    <td className="border border-slate-300 p-0 min-w-[82px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-fmAwal`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Flowmeter Awal`}
                        value={row.flowmeterAwal}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'fmAwal',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('flowmeterAwal', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Flowmeter Akhir */}
                    <td className="border border-slate-300 p-0 min-w-[82px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-fmAkhir`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Flowmeter Akhir`}
                        value={row.flowmeterAkhir}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'fmAkhir',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('flowmeterAkhir', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Flowmeter Liter */}
                    <td className="border border-slate-300 p-0 min-w-[82px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-fmLiter`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Flowmeter Liter`}
                        value={row.flowmeterLiter}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'fmLiter',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('flowmeterLiter', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Greasing Menit */}
                    <td className="border border-slate-300 p-0 min-w-[76px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-gMenit`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Greasing Menit`}
                        value={row.greasingMenit}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'gMenit',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('greasingMenit', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Greasing Kg */}
                    <td className="border border-slate-300 p-0 min-w-[74px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-gKg`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Greasing Kg`}
                        value={row.greasingKg}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'gKg',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('greasingKg', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Collant Menit */}
                    <td className="border border-slate-300 p-0 min-w-[76px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-cMenit`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Collant Menit`}
                        value={row.collantMenit}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'cMenit',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('collantMenit', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Collant Liter */}
                    <td className="border border-slate-300 p-0 min-w-[76px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-cLiter`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Collant Liter`}
                        value={row.collantLiter}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'cLiter',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell('collantLiter', e.target.value)
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Keterangan Status */}
                    <td className="border border-slate-300 p-0 min-w-[92px]">
                      <input
                        type="text"
                        list="sp-status-options"
                        data-sp-cell={`${rowIdx}-status`}
                        aria-label={`Log Spreadsheet Baris ${rowIdx + 1} Status`}
                        placeholder={isBlankEntry ? 'PM/ADD/BD' : undefined}
                        value={row.keteranganStatus}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'status',
                            SPREADSHEET_LOG_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          updateCell(
                            'keteranganStatus',
                            e.target.value.toUpperCase()
                          )
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-center font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    {/* Signatures */}
                    {(
                      [
                        'driverMechanic',
                        'glSpvPlant',
                        'glSpvScm',
                        'deptHeadPlant',
                      ] as const
                    ).map((sigField) => (
                      <td
                        key={sigField}
                        className="border border-slate-300 p-0 min-w-[120px]"
                      >
                        <input
                          type="text"
                          data-sp-cell={`${rowIdx}-${sigField}`}
                          aria-label={`Log Spreadsheet Baris ${rowIdx + 1} ${sigField}`}
                          value={sheet.signatures[sigField]}
                          onKeyDown={(e) =>
                            handleGridKeyDown(
                              e,
                              rowIdx,
                              sigField,
                              SPREADSHEET_LOG_COLUMNS,
                              totalRows
                            )
                          }
                          onChange={(e) =>
                            onUpdateSheet(sheet.id, (s) => ({
                              ...s,
                              signatures: {
                                ...s.signatures,
                                [sigField]: e.target.value,
                              },
                              updatedAt: new Date().toISOString(),
                            }))
                          }
                          className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}

          {/* Editable Tab 3: Stock In */}
          {isStockInTab && (
            <tbody>
              {editableStockInEntries.map((entry, rowIdx) => {
                const { sheet, rowIndex, row, isBlankEntry } = entry;
                const rowBg = isBlankEntry
                  ? 'bg-emerald-50/45 hover:bg-emerald-50/75'
                  : rowIdx % 2 === 0
                    ? 'bg-[#D9E2F3]/55 hover:bg-amber-50/50'
                    : 'bg-white hover:bg-amber-50/50';
                const totalRows = editableStockInEntries.length;

                return (
                  <tr
                    key={`${sheet.id}-stock-${row.rowNumber}`}
                    className={rowBg}
                  >
                    <td className="border border-slate-300 bg-slate-100 text-slate-500 text-center font-data-mono text-[11px] py-1 px-1.5">
                      {isBlankEntry ? '+' : rowIdx + 2}
                    </td>
                    <td className="border border-slate-300 p-0 min-w-[96px]">
                      <input
                        type="text"
                        data-sp-cell={`${rowIdx}-date`}
                        aria-label={`Stock In Baris ${rowIdx + 1} Tanggal`}
                        value={formatDisplayDate(sheet.date) || sheet.date}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'date',
                            SPREADSHEET_STOCK_IN_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) => ({
                            ...s,
                            date: e.target.value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="w-full bg-transparent px-2 py-1.5 font-data-mono text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    <td className="border border-slate-300 p-0 min-w-[78px]">
                      <input
                        type="text"
                        list="sp-shift-options"
                        data-sp-cell={`${rowIdx}-workingShift`}
                        aria-label={`Stock In Baris ${rowIdx + 1} Shift`}
                        value={sheet.workingShift}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'workingShift',
                            SPREADSHEET_STOCK_IN_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) => ({
                            ...s,
                            workingShift: e.target.value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    <td className="border border-slate-300 p-0 min-w-[175px]">
                      <input
                        type="text"
                        list="sp-location-options"
                        data-sp-cell={`${rowIdx}-storageLocation`}
                        aria-label={`Stock In Baris ${rowIdx + 1} Lokasi`}
                        value={sheet.storageLocation}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'storageLocation',
                            SPREADSHEET_STOCK_IN_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) => ({
                            ...s,
                            storageLocation: e.target.value,
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-data-mono text-slate-600">
                      {row.rowNumber}
                    </td>
                    <td className="border border-slate-300 p-0 min-w-[72px]">
                      <input
                        type="text"
                        data-sp-cell={`${rowIdx}-waktu`}
                        aria-label={`Stock In Baris ${rowIdx + 1} Waktu`}
                        placeholder={isBlankEntry ? 'HH:MM' : undefined}
                        value={row.waktu}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'waktu',
                            SPREADSHEET_STOCK_IN_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) =>
                            updateSheetStockInCell(
                              s,
                              rowIndex,
                              'waktu',
                              e.target.value
                            )
                          )
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-center font-data-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    <td className="border border-slate-300 p-0 min-w-[200px]">
                      <input
                        type="text"
                        list="sp-material-options"
                        data-sp-cell={`${rowIdx}-description`}
                        aria-label={`Stock In Baris ${rowIdx + 1} Oil & Lube Description`}
                        placeholder={
                          isBlankEntry ? 'Kode Material / Oli...' : undefined
                        }
                        value={row.description}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'description',
                            SPREADSHEET_STOCK_IN_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) =>
                            updateSheetStockInCell(
                              s,
                              rowIndex,
                              'description',
                              e.target.value
                            )
                          )
                        }
                        className="w-full bg-transparent px-2 py-1.5 font-data-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                    <td className="border border-slate-300 p-0 min-w-[90px]">
                      <input
                        type="text"
                        inputMode="decimal"
                        data-sp-cell={`${rowIdx}-quantity`}
                        aria-label={`Stock In Baris ${rowIdx + 1} Quantity`}
                        placeholder={isBlankEntry ? 'Qty...' : undefined}
                        value={row.quantity}
                        onKeyDown={(e) =>
                          handleGridKeyDown(
                            e,
                            rowIdx,
                            'quantity',
                            SPREADSHEET_STOCK_IN_COLUMNS,
                            totalRows
                          )
                        }
                        onChange={(e) =>
                          onUpdateSheet(sheet.id, (s) =>
                            updateSheetStockInCell(
                              s,
                              rowIndex,
                              'quantity',
                              e.target.value
                            )
                          )
                        }
                        className="w-full bg-transparent px-2 py-1.5 text-right font-data-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-emerald-600"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}

          {/* Read-only Master Data Tabs */}
          {!isEditableTab && (
            <tbody>
              {masterPreviewRows.length === 0 ? (
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
                masterPreviewRows.map((row, rowIdx) => {
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
                    <tr key={rowIdx} className={`${rowBg} hover:bg-amber-50/50`}>
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
          )}
        </table>
      </div>
    </>
  );
}
