import * as XLSX from 'xlsx';
import type { WorksheetSpec } from './spreadsheetBuilder';

export function downloadExcelWorkbook(
  worksheets: WorksheetSpec[],
  filename: string
): void {
  if (worksheets.length === 0) return;

  const wb = XLSX.utils.book_new();

  for (const wsSpec of worksheets) {
    const aoa = [wsSpec.headers, ...wsSpec.rows];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = wsSpec.columnWidths.map((wch) => ({ wch }));
    // Excel sheet name limit is 31 chars and cannot contain []:*?/\
    const safeName = wsSpec.title
      .replace(/[\[\]:*?\/\\]/g, ' ')
      .trim()
      .slice(0, 31);
    XLSX.utils.book_append_sheet(wb, sheet, safeName || 'Sheet');
  }

  const safeFile = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safeFile);
}
