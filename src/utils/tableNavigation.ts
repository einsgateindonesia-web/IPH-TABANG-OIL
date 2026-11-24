export const CONSUMPTION_TABLE_COLUMNS = [
  'waktu',
  'noUnit',
  'modelUnit',
  'hm',
  'oil',
  'fmAwal',
  'fmAkhir',
  'fmLiter',
  'gMenit',
  'gKg',
  'cMenit',
  'cLiter',
  'status',
] as const;

export const OUTPUT_TABLE_COLUMNS = [
  'unitCode',
  'codeAlias',
  'componentCode',
  'typeOfOutCode',
  'storageLocCode',
  'materialCode',
  'qtyLiter',
] as const;

export interface CellCoord {
  rowIndex: number;
  colKey: string;
}

export interface TextSelectionState {
  valueLength: number;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export interface GridNavInput {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  rowIndex: number;
  colKey: string;
  rowCount: number;
  columns: readonly string[];
  selection?: TextSelectionState;
  isSelectElement?: boolean;
}

export function resolveGridNavigationTarget(
  input: GridNavInput
): CellCoord | null {
  if (input.altKey || input.metaKey) {
    return null;
  }

  const colIndex = input.columns.indexOf(input.colKey);
  if (colIndex === -1 || input.rowCount <= 0) {
    return null;
  }

  if (input.key === 'Enter') {
    const nextRow = input.shiftKey ? input.rowIndex - 1 : input.rowIndex + 1;
    if (nextRow >= 0 && nextRow < input.rowCount) {
      return { rowIndex: nextRow, colKey: input.colKey };
    }
    return null;
  }

  if (input.key === 'ArrowUp' || input.key === 'ArrowDown') {
    if (input.isSelectElement && !input.ctrlKey) {
      return null;
    }
    const nextRow =
      input.key === 'ArrowUp' ? input.rowIndex - 1 : input.rowIndex + 1;
    if (nextRow >= 0 && nextRow < input.rowCount) {
      return { rowIndex: nextRow, colKey: input.colKey };
    }
    return null;
  }

  if (input.key === 'ArrowLeft' || input.key === 'ArrowRight') {
    let canMove = Boolean(
      input.ctrlKey || input.isSelectElement || !input.selection
    );

    if (!canMove && input.selection) {
      const { valueLength, selectionStart, selectionEnd } = input.selection;
      const isEmpty = valueLength === 0;
      const isAllSelected =
        selectionStart === 0 && selectionEnd === valueLength;

      if (
        selectionStart === null ||
        selectionEnd === null ||
        isEmpty ||
        isAllSelected
      ) {
        canMove = true;
      } else if (input.key === 'ArrowLeft') {
        canMove = selectionStart === 0 && selectionEnd === 0;
      } else {
        canMove =
          selectionStart === valueLength && selectionEnd === valueLength;
      }
    }

    if (!canMove) {
      return null;
    }

    const nextColIndex =
      input.key === 'ArrowLeft' ? colIndex - 1 : colIndex + 1;
    if (nextColIndex >= 0 && nextColIndex < input.columns.length) {
      return {
        rowIndex: input.rowIndex,
        colKey: input.columns[nextColIndex],
      };
    }
    return null;
  }

  return null;
}
