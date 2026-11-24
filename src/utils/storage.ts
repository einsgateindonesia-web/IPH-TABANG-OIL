import type { LogSheet, OutputOverrideMap } from '../types/logSheet';
import { createSampleSheet, DEFAULT_STORAGE_LOCATION } from './logSheet';

const STORAGE_KEY_SHEETS = 'karunia_oil_log_sheets_v1';
const STORAGE_KEY_ACTIVE = 'karunia_oil_active_sheet_v1';
const STORAGE_KEY_OUTPUT_OVERRIDES = 'karunia_oil_output_overrides_v1';
const STORAGE_KEY_FALLBACK_LOC = 'karunia_oil_fallback_storage_loc_v1';

export interface StoredState {
  sheets: LogSheet[];
  activeSheetId: string;
  outputOverrides: OutputOverrideMap;
  fallbackStorageCode: string;
}

export function loadStoredSheets(): StoredState {
  let sheets: LogSheet[] | null = null;
  let activeSheetId = '';
  let outputOverrides: OutputOverrideMap = {};
  let fallbackStorageCode = 'LST21';

  try {
    const rawSheets = localStorage.getItem(STORAGE_KEY_SHEETS);
    const rawActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
    const rawOverrides = localStorage.getItem(STORAGE_KEY_OUTPUT_OVERRIDES);
    const rawFallbackLoc = localStorage.getItem(STORAGE_KEY_FALLBACK_LOC);

    if (rawOverrides) {
      const parsedOverrides = JSON.parse(rawOverrides) as OutputOverrideMap;
      if (parsedOverrides && typeof parsedOverrides === 'object') {
        outputOverrides = parsedOverrides;
      }
    }

    if (rawFallbackLoc) {
      fallbackStorageCode = rawFallbackLoc;
    }

    if (rawSheets) {
      const parsed = JSON.parse(rawSheets) as LogSheet[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        sheets = parsed.map((sheet) =>
          sheet.storageLocation?.trim() === 'Lube Station Pit A'
            ? { ...sheet, storageLocation: DEFAULT_STORAGE_LOCATION }
            : sheet
        );
        const activeExists = sheets.some((s) => s.id === rawActive);
        activeSheetId = activeExists && rawActive ? rawActive : sheets[0].id;
      }
    }
  } catch {
    // Fallback to initial seed sheet if localStorage is unavailable or corrupt
  }

  if (!sheets) {
    const initial = createSampleSheet();
    sheets = [initial];
    activeSheetId = initial.id;
  }

  return {
    sheets,
    activeSheetId,
    outputOverrides,
    fallbackStorageCode,
  };
}

export function saveStoredSheets(
  sheets: LogSheet[],
  activeSheetId: string,
  outputOverrides: OutputOverrideMap,
  fallbackStorageCode: string
): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHEETS, JSON.stringify(sheets));
    localStorage.setItem(STORAGE_KEY_ACTIVE, activeSheetId);
    localStorage.setItem(
      STORAGE_KEY_OUTPUT_OVERRIDES,
      JSON.stringify(outputOverrides)
    );
    localStorage.setItem(STORAGE_KEY_FALLBACK_LOC, fallbackStorageCode);
  } catch {
    // Ignore storage quota errors cleanly
  }
}

const STORAGE_KEY_LINKED_SPREADSHEETS = 'karunia_linked_google_spreadsheets_v1';

export function loadLinkedSpreadsheets(): import('../types/logSheet').LinkedGoogleSpreadsheet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LINKED_SPREADSHEETS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLinkedSpreadsheets(
  list: import('../types/logSheet').LinkedGoogleSpreadsheet[]
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_LINKED_SPREADSHEETS,
      JSON.stringify(list.slice(0, 12))
    );
  } catch {
    // Ignore storage quota errors cleanly
  }
}

const STORAGE_KEY_PRIMARY_SPREADSHEET = 'karunia_primary_google_sheet_v1';
const STORAGE_KEY_SYNCED_ROWS = 'karunia_synced_google_sheet_rows_v1';

export function loadPrimarySpreadsheet(): import('../types/logSheet').PrimarySpreadsheetConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRIMARY_SPREADSHEET);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.spreadsheetId === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePrimarySpreadsheet(
  config: import('../types/logSheet').PrimarySpreadsheetConfig | null
): void {
  try {
    if (!config) {
      localStorage.removeItem(STORAGE_KEY_PRIMARY_SPREADSHEET);
    } else {
      localStorage.setItem(
        STORAGE_KEY_PRIMARY_SPREADSHEET,
        JSON.stringify(config)
      );
    }
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadSyncedRowKeys(spreadsheetId: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNCED_ROWS);
    if (!raw) return new Set();
    const map = JSON.parse(raw) as Record<string, string[]>;
    const list = map?.[spreadsheetId];
    return Array.isArray(list) ? new Set(list) : new Set();
  } catch {
    return new Set();
  }
}

export function saveSyncedRowKeys(
  spreadsheetId: string,
  keys: Set<string>
): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNCED_ROWS);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    // Keep recent 1500 signatures per spreadsheet to prevent storage bloat
    map[spreadsheetId] = Array.from(keys).slice(-1500);
    localStorage.setItem(STORAGE_KEY_SYNCED_ROWS, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors cleanly
  }
}


