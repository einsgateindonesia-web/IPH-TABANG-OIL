import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSUMPTION_TABLE_COLUMNS,
  OUTPUT_TABLE_COLUMNS,
  resolveGridNavigationTarget,
} from './tableNavigation';

test('ArrowUp, ArrowDown, Enter, and Shift+Enter navigate vertically within table bounds', () => {
  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowDown',
      rowIndex: 0,
      colKey: 'noUnit',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
    }),
    { rowIndex: 1, colKey: 'noUnit' }
  );

  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowUp',
      rowIndex: 5,
      colKey: 'fmAwal',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
    }),
    { rowIndex: 4, colKey: 'fmAwal' }
  );

  assert.equal(
    resolveGridNavigationTarget({
      key: 'ArrowUp',
      rowIndex: 0,
      colKey: 'waktu',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
    }),
    null
  );

  assert.equal(
    resolveGridNavigationTarget({
      key: 'ArrowDown',
      rowIndex: 19,
      colKey: 'status',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
    }),
    null
  );

  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'Enter',
      shiftKey: true,
      rowIndex: 3,
      colKey: 'hm',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
    }),
    { rowIndex: 2, colKey: 'hm' }
  );
});

test('ArrowLeft and ArrowRight move across cells when empty, fully selected, at text boundaries, or with Ctrl', () => {
  // Empty cell -> immediate move
  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowRight',
      rowIndex: 0,
      colKey: 'waktu',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
      selection: { valueLength: 0, selectionStart: 0, selectionEnd: 0 },
    }),
    { rowIndex: 0, colKey: 'noUnit' }
  );

  // Full text selected (e.g. just navigated in) -> immediate move
  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowRight',
      rowIndex: 0,
      colKey: 'noUnit',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
      selection: { valueLength: 6, selectionStart: 0, selectionEnd: 6 },
    }),
    { rowIndex: 0, colKey: 'modelUnit' }
  );

  // Caret in middle of text -> stay inside input to move character cursor
  assert.equal(
    resolveGridNavigationTarget({
      key: 'ArrowRight',
      rowIndex: 0,
      colKey: 'noUnit',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
      selection: { valueLength: 6, selectionStart: 2, selectionEnd: 2 },
    }),
    null
  );

  // Ctrl+ArrowRight in middle of text -> force cell jump
  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowRight',
      ctrlKey: true,
      rowIndex: 0,
      colKey: 'noUnit',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
      selection: { valueLength: 6, selectionStart: 2, selectionEnd: 2 },
    }),
    { rowIndex: 0, colKey: 'modelUnit' }
  );

  // Caret at start -> ArrowLeft moves left
  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowLeft',
      rowIndex: 0,
      colKey: 'noUnit',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
      selection: { valueLength: 6, selectionStart: 0, selectionEnd: 0 },
    }),
    { rowIndex: 0, colKey: 'waktu' }
  );

  // Caret at end -> ArrowRight moves right
  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowRight',
      rowIndex: 0,
      colKey: 'noUnit',
      rowCount: 20,
      columns: CONSUMPTION_TABLE_COLUMNS,
      selection: { valueLength: 6, selectionStart: 6, selectionEnd: 6 },
    }),
    { rowIndex: 0, colKey: 'modelUnit' }
  );
});

test('Select elements keep native ArrowUp/ArrowDown while allowing ArrowLeft/ArrowRight and Ctrl+Arrow', () => {
  assert.equal(
    resolveGridNavigationTarget({
      key: 'ArrowDown',
      rowIndex: 0,
      colKey: 'componentCode',
      rowCount: 5,
      columns: OUTPUT_TABLE_COLUMNS,
      isSelectElement: true,
    }),
    null
  );

  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowDown',
      ctrlKey: true,
      rowIndex: 0,
      colKey: 'componentCode',
      rowCount: 5,
      columns: OUTPUT_TABLE_COLUMNS,
      isSelectElement: true,
    }),
    { rowIndex: 1, colKey: 'componentCode' }
  );

  assert.deepEqual(
    resolveGridNavigationTarget({
      key: 'ArrowRight',
      rowIndex: 0,
      colKey: 'componentCode',
      rowCount: 5,
      columns: OUTPUT_TABLE_COLUMNS,
      isSelectElement: true,
    }),
    { rowIndex: 0, colKey: 'typeOfOutCode' }
  );
});
