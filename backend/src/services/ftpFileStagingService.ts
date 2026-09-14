/**
 * Dedicated FTP / SFTP File Parsing & Staging Service
 * Multi-Format Parsing (Excel .xlsx/.xls, CSV, TSV, Pipe, Semicolon, XML, TXT, JSON),
 * Multi-Row & Merged Header extraction, Column Projection Filtering,
 * Recursive Multi-Folder Looping Traversal, and Prepared Table Provisioning for Lookup Workflows.
 */

import * as ftp from 'basic-ftp';
import { Writable } from 'stream';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import { DatabaseConnection, FtpFileStagingConfig, FtpFieldMapping } from '../types.js';
import { resolveFtpConfig, discoverFtpFilesRecursive, fetchRemoteFileBuffer, FtpFileEntry } from './ftpConnectionService.js';
import { mirrorTableManager } from './mirrorTableManager.js';
import { queryPg } from '../config/postgres.js';
import { repo } from '../store/repository.js';

export interface FileStructureInspectionResult {
  fileName: string;
  fileType: 'EXCEL' | 'CSV' | 'XML' | 'TXT' | 'JSON' | 'OTHER';
  fileSizeBytes: number;
  excelSheets?: { name: string; rowCount: number; colCount: number; hasMergedCells: boolean }[];
  xmlRootElement?: string;
  xmlCandidateElements?: string[];
  detectedDelimiter?: string;
  sampleLines?: string[];
  suggestedHeaderRow?: number;
  suggestedDataStartRow?: number;
  totalLinesSampled?: number;
}

export interface PreviewParseResult {
  success: boolean;
  fileName: string;
  fileType: 'EXCEL' | 'CSV' | 'XML' | 'TXT' | 'JSON' | 'OTHER';
  totalLinesRead: number;
  headerRowIndex: number;
  headerRowCount: number;
  dataStartRow: number;
  headersDetected: string[];
  selectedImportantColumns: string[];
  delimiterUsed?: string;
  excelSheetSelected?: string;
  excelAvailableSheets?: string[];
  parsedRowsCount: number;
  rawLinesSample: string[];
  parsedRowsSample: Record<string, any>[];
  mappedRowsSample: Record<string, any>[];
  footerSkippedLines: string[];
  structureSummary?: {
    totalColumnsDetected: number;
    totalRowsEstimated: number;
    hasMergedCells?: boolean;
    details?: string;
  };
}

/**
 * Splits delimited line considering quote encapsulation and escape characters.
 */
export function parseDelimitedLine(line: string, delimiter: string, quoteChar = '"'): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === quoteChar) {
      if (insideQuote && i + 1 < line.length && line[i + 1] === quoteChar) {
        currentValue += quoteChar;
        i++; // skip next quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());
  return values;
}

/**
 * Resolves standard delimiter character from config format.
 */
export function resolveDelimiter(format: string, custom?: string): string {
  if (format === 'TSV') return '\t';
  if (format === 'PIPE') return '|';
  if (format === 'SEMICOLON') return ';';
  if (format === 'CUSTOM_DELIMITED' && custom) return custom;
  return ','; // default CSV
}

/**
 * Applies transformations (TRIM, UPPERCASE, NUMERIC_CLEAN, etc.)
 */
function applyFieldTransform(value: any, transform?: string): any {
  if (value === null || value === undefined) return value;
  let str = String(value);

  if (transform === 'TRIM') return str.trim();
  if (transform === 'UPPERCASE') return str.toUpperCase().trim();
  if (transform === 'LOWERCASE') return str.toLowerCase().trim();
  if (transform === 'NUMERIC_CLEAN') {
    const cleaned = str.replace(/[^0-9.-]/g, '');
    return cleaned || '0';
  }
  return str.trim();
}

/**
 * Normalizes SQL identifier for mirror table columns
 */
function sanitizeColumnName(name: string, fallbackIdx: number): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return clean || `col_${fallbackIdx}`;
}

/**
 * Downloads initial string content from remote FTP/SFTP file (UTF-8).
 */
async function fetchRemoteFileContent(db: DatabaseConnection, filename: string, maxBytes = 2097152): Promise<string> {
  const buf = await fetchRemoteFileBuffer(db, filename, maxBytes);
  if (!buf || buf.length === 0) {
    throw new Error(`File '${filename}' is empty or could not be read from remote server.`);
  }
  return buf.toString('utf-8');
}

export const ftpFileStagingService = {
  /**
   * Inspects the physical structure of a file on the FTP server:
   * File type, sheet list, dimensions, XML nodes, or candidate delimiters.
   */
  async inspectFtpFileStructure(
    db: DatabaseConnection,
    filePath: string
  ): Promise<FileStructureInspectionResult> {
    let targetPath = filePath.trim();
    if (!targetPath) {
      throw new Error('No file path provided for structure inspection.');
    }

    // If wildcard or bare name, resolve via recursive file discovery
    if (targetPath.includes('*') || targetPath.includes('?') || !targetPath.startsWith('/')) {
      try {
        const discovered = await discoverFtpFilesRecursive(db, undefined, 8);
        if (targetPath.includes('*') || targetPath.includes('?')) {
          const regex = new RegExp('^' + targetPath.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
          const match = discovered.find(f => regex.test(f.name) || regex.test(f.fullPath));
          if (match) targetPath = match.fullPath;
          else throw new Error(`No remote files match pattern '${targetPath}'. Verify the pattern or check server files.`);
        } else if (!targetPath.startsWith('/')) {
          const match = discovered.find(f => f.name === targetPath || f.fullPath.endsWith(`/${targetPath}`));
          if (match) targetPath = match.fullPath;
        }
      } catch (err: any) {
        if (err.message.includes('No remote files match pattern')) throw err;
        // Continue with original path if discovery fails
      }
    }

    const ext = targetPath.toLowerCase().slice(targetPath.lastIndexOf('.'));
    const isExcel = ext === '.xlsx' || ext === '.xls';
    const isXml = ext === '.xml';

    if (isExcel) {
      const buf = await fetchRemoteFileBuffer(db, targetPath, 52428800);
      if (!buf || buf.length === 0) {
        throw new Error(`Failed to inspect Excel file '${targetPath}': File is empty or could not be downloaded from remote server.`);
      }

      const wb = XLSX.read(buf, { type: 'buffer' });
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error(`Excel workbook at '${targetPath}' contains no readable worksheets.`);
      }

      const sheets = wb.SheetNames.map(sheetName => {
        const ws = wb.Sheets[sheetName];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        const rowCount = range.e.r - range.s.r + 1;
        const colCount = range.e.c - range.s.c + 1;
        const hasMergedCells = Array.isArray(ws['!merges']) && ws['!merges'].length > 0;
        return { name: sheetName, rowCount, colCount, hasMergedCells };
      });

      let suggestedHeaderRow = 1;
      let suggestedDataStartRow = 2;

      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (firstSheet) {
        const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        let bestHeaderIdx = 0;
        let maxColsFound = 0;
        for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;
          const nonNullCount = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
          if (nonNullCount > maxColsFound) {
            maxColsFound = nonNullCount;
            bestHeaderIdx = r;
          }
        }
        if (maxColsFound >= 3) {
          suggestedHeaderRow = bestHeaderIdx + 1;
          suggestedDataStartRow = suggestedHeaderRow + 1;
        }
      }

      return {
        fileName: targetPath,
        fileType: 'EXCEL',
        fileSizeBytes: buf.length,
        excelSheets: sheets,
        suggestedHeaderRow,
        suggestedDataStartRow
      };
    }

    if (isXml) {
      const text = await fetchRemoteFileContent(db, targetPath);
      if (!text || !text.trim()) {
        throw new Error(`Failed to inspect XML file '${targetPath}': File contains no readable XML content.`);
      }

      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(text);
      const rootKeys = Object.keys(parsed);
      const rootElement = rootKeys[0] || 'Document';

      // Find candidate repeating transaction elements (e.g. Ntry, TxDtls, Record)
      const candidateElements: string[] = [];
      function findArrays(obj: any, path: string) {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
          const currentPath = path ? `${path}.${k}` : k;
          if (Array.isArray(obj[k])) {
            candidateElements.push(k);
          } else if (typeof obj[k] === 'object') {
            findArrays(obj[k], currentPath);
          }
        }
      }
      findArrays(parsed, '');

      return {
        fileName: targetPath,
        fileType: 'XML',
        fileSizeBytes: Buffer.byteLength(text, 'utf-8'),
        xmlRootElement: rootElement,
        xmlCandidateElements: Array.from(new Set(candidateElements)),
        sampleLines: text.split(/\r?\n/).slice(0, 10),
        suggestedHeaderRow: 1,
        suggestedDataStartRow: 1
      };
    }

    // CSV / TXT / Delimited
    const content = await fetchRemoteFileContent(db, targetPath);
    if (!content || !content.trim()) {
      throw new Error(`Failed to inspect file '${targetPath}': File contains no readable text content.`);
    }
    const lines = content.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) {
      throw new Error(`File '${targetPath}' contains no non-empty lines.`);
    }

    // Delimiter sniffing
    const candidates = [',', '\t', '|', ';'];
    let bestDelimiter = ',';
    let maxSplits = 0;
    const sampleLine = lines.find(l => !l.startsWith('#')) || lines[0] || '';

    for (const d of candidates) {
      const count = sampleLine.split(d).length;
      if (count > maxSplits) {
        maxSplits = count;
        bestDelimiter = d;
      }
    }

    // Find suggested header row (skipping # preambles)
    let suggestedHdr = 1;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#') && !lines[i].startsWith('##')) {
        suggestedHdr = i + 1;
        break;
      }
    }

    return {
      fileName: targetPath,
      fileType: ext === '.txt' || ext === '.dat' ? 'TXT' : 'CSV',
      fileSizeBytes: Buffer.byteLength(content, 'utf-8'),
      detectedDelimiter: bestDelimiter,
      sampleLines: lines.slice(0, 8),
      suggestedHeaderRow: suggestedHdr,
      suggestedDataStartRow: suggestedHdr + 1,
      totalLinesSampled: lines.length
    };
  },

  /**
   * Tests and previews parsing of an FTP file across Excel, CSV, XML, or TXT.
   * Handles multi-row headers, merged cells forward-fill, and important columns.
   */
  async testPreviewParse(
    db: DatabaseConnection,
    config: Partial<FtpFileStagingConfig>
  ): Promise<PreviewParseResult> {
    let targetFile = config.sampleFileName || config.fileNamePattern || db.availableTables?.[0];
    if (!targetFile || !targetFile.trim()) {
      throw new Error('No target file or sample file specified for preview parsing.');
    }
    targetFile = targetFile.trim();

    // If wildcard or bare filename, resolve via recursive file discovery
    if (targetFile.includes('*') || targetFile.includes('?') || !targetFile.startsWith('/')) {
      try {
        const discovered = await discoverFtpFilesRecursive(db, config.sourceDirectoryPath || undefined, 8);
        if (targetFile.includes('*') || targetFile.includes('?')) {
          const regex = new RegExp('^' + targetFile.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
          const match = discovered.find(f => regex.test(f.name) || regex.test(f.fullPath));
          if (match) targetFile = match.fullPath;
          else throw new Error(`Cannot preview parse: No remote files match pattern '${targetFile}'. Please select a sample file or adjust the pattern.`);
        } else if (!targetFile.startsWith('/')) {
          const match = discovered.find(f => f.name === targetFile || f.fullPath.endsWith(`/${targetFile}`));
          if (match) targetFile = match.fullPath;
        }
      } catch (err: any) {
        if (err.message.includes('Cannot preview parse: No remote files match pattern')) throw err;
      }
    }

    const ext = targetFile.toLowerCase().slice(targetFile.lastIndexOf('.'));
    const isExcel = config.fileFormat === 'EXCEL' || ext === '.xlsx' || ext === '.xls';
    const isXml = config.fileFormat === 'XML' || ext === '.xml';

    const headerIndex = Math.max(1, config.headerRowIndex || 1);
    const headerRowCount = Math.max(1, config.headerRowCount || 1);
    const separator = config.mergedHeaderSeparator || '_';
    const skipFooter = Math.max(0, config.skipFooterLines || 0);

    // ==========================================
    // 1. EXCEL PARSING
    // ==========================================
    if (isExcel) {
      const buf = await fetchRemoteFileBuffer(db, targetFile, 52428800);
      if (!buf || buf.length === 0) {
        throw new Error(`Failed to preview Excel file '${targetFile}': File is empty or could not be downloaded from remote server.`);
      }

      const wb = XLSX.read(buf, { type: 'buffer' });
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error(`Excel workbook at '${targetFile}' contains no worksheets.`);
      }

      const sheetName = config.excelSheetName && wb.Sheets[config.excelSheetName]
        ? config.excelSheetName
        : wb.SheetNames[0];
      if (!sheetName || !wb.Sheets[sheetName]) {
        throw new Error(`Worksheet '${config.excelSheetName || 'default'}' not found in Excel workbook '${targetFile}'. Available sheets: ${wb.SheetNames.join(', ')}`);
      }
      const ws = wb.Sheets[sheetName];

      // Convert to 2D array of rows
      const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const totalRows = matrix.length;

      // Handle merged cells in header: forward fill values across span
      const merges = ws['!merges'] || [];
      if (config.handleMergedCells !== false && merges.length > 0) {
        for (const m of merges) {
          const topVal = matrix[m.s.r]?.[m.s.c] || '';
          if (topVal) {
            for (let r = m.s.r; r <= m.e.r; r++) {
              for (let c = m.s.c; c <= m.e.c; c++) {
                if (matrix[r]) {
                  matrix[r][c] = topVal;
                }
              }
            }
          }
        }
      }

      // Extract and combine multi-row headers
      const headerStartIdx = headerIndex - 1;
      const headerEndIdx = headerStartIdx + headerRowCount;
      const headerRows = matrix.slice(headerStartIdx, headerEndIdx);
      const colCount = Math.max(...matrix.map(row => row.length), 0);

      const combinedHeaders: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const parts: string[] = [];
        for (let r = 0; r < headerRows.length; r++) {
          const val = String(headerRows[r]?.[c] || '').trim();
          if (val && !parts.includes(val)) {
            parts.push(val);
          }
        }
        const combined = parts.join(separator).replace(/^_+|_+$/g, '') || `Col_${c + 1}`;
        combinedHeaders.push(combined);
      }

      const dataStartIndex = Math.max(headerEndIdx + 1, config.dataStartRow || (headerEndIdx + 1));
      const activeDataRows = matrix.slice(
        dataStartIndex - 1,
        skipFooter > 0 ? matrix.length - skipFooter : matrix.length
      );

      const parsedRowsSample: Record<string, any>[] = [];
      const mappedRowsSample: Record<string, any>[] = [];
      const sampleLimit = Math.min(15, activeDataRows.length);
      const mappings = config.fieldMappings || [];
      const importantCols = config.selectedImportantColumns || mappings.filter(m => m.isImportant !== false).map(m => m.sourceColumn);

      for (let i = 0; i < sampleLimit; i++) {
        const rowData = activeDataRows[i];
        const parsedRow: Record<string, any> = {};
        const mappedRow: Record<string, any> = {};

        combinedHeaders.forEach((hdr, idx) => {
          parsedRow[hdr] = rowData[idx] ?? null;
        });
        parsedRowsSample.push(parsedRow);

        if (mappings.length > 0) {
          mappings.forEach(m => {
            const rawVal = parsedRow[m.sourceColumn] ?? m.defaultValue ?? null;
            mappedRow[m.canonicalField] = applyFieldTransform(rawVal, m.transform);
          });
        } else {
          Object.assign(mappedRow, parsedRow);
        }
        mappedRowsSample.push(mappedRow);
      }

      const footerSkippedRows = skipFooter > 0
        ? matrix.slice(matrix.length - skipFooter).map(r => r.join(' | '))
        : [];

      return {
        success: true,
        fileName: targetFile,
        fileType: 'EXCEL',
        totalLinesRead: totalRows,
        headerRowIndex: headerIndex,
        headerRowCount,
        dataStartRow: dataStartIndex,
        headersDetected: combinedHeaders,
        selectedImportantColumns: importantCols.length > 0 ? importantCols : combinedHeaders,
        excelSheetSelected: sheetName,
        excelAvailableSheets: wb.SheetNames,
        parsedRowsCount: activeDataRows.length,
        rawLinesSample: matrix.slice(0, 8).map(r => r.join(' | ')),
        parsedRowsSample,
        mappedRowsSample,
        footerSkippedLines: footerSkippedRows,
        structureSummary: {
          totalColumnsDetected: combinedHeaders.length,
          totalRowsEstimated: activeDataRows.length,
          hasMergedCells: merges.length > 0,
          details: `Parsed Excel sheet [${sheetName}] with ${headerRowCount}-row merged header.`
        }
      };
    }

    // ==========================================
    // 2. XML PARSING
    // ==========================================
    if (isXml) {
      const text = await fetchRemoteFileContent(db, targetFile);
      if (!text || !text.trim()) {
        throw new Error(`Failed to preview XML file '${targetFile}': File contains no readable XML content.`);
      }

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = parser.parse(text);

      // Flatten XML nodes to table records
      const recordTag = config.xmlRecordElement || 'TxDtls';
      const records: any[] = [];

      function extractRecords(node: any) {
        if (!node || typeof node !== 'object') return;
        for (const k of Object.keys(node)) {
          if (k === recordTag && Array.isArray(node[k])) {
            records.push(...node[k]);
          } else if (k === recordTag && typeof node[k] === 'object') {
            records.push(node[k]);
          } else if (typeof node[k] === 'object') {
            extractRecords(node[k]);
          }
        }
      }
      extractRecords(parsed);

      // Fallback if recordTag wasn't found directly
      if (records.length === 0) {
        function findFirstArray(node: any) {
          if (!node || typeof node !== 'object') return;
          for (const k of Object.keys(node)) {
            if (Array.isArray(node[k])) {
              records.push(...node[k]);
              return;
            } else if (typeof node[k] === 'object') {
              findFirstArray(node[k]);
              if (records.length > 0) return;
            }
          }
        }
        findFirstArray(parsed);
      }

      // Flatten records into key-value pairs
      const flattenedRows: Record<string, any>[] = records.map(rec => {
        const flat: Record<string, any> = {};
        function flatten(obj: any, prefix = '') {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}_${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              flatten(v, key);
            } else {
              flat[key] = typeof v === 'object' ? JSON.stringify(v) : v;
            }
          }
        }
        flatten(rec);
        return flat;
      });

      const allHeaders = Array.from(new Set(flattenedRows.flatMap(r => Object.keys(r))));
      const sampleRows = flattenedRows.slice(0, 15);
      const mappings = config.fieldMappings || [];
      const importantCols = config.selectedImportantColumns || mappings.filter(m => m.isImportant !== false).map(m => m.sourceColumn);

      const mappedRowsSample = sampleRows.map(row => {
        const mapped: Record<string, any> = {};
        if (mappings.length > 0) {
          mappings.forEach(m => {
            const rawVal = row[m.sourceColumn] ?? m.defaultValue ?? null;
            mapped[m.canonicalField] = applyFieldTransform(rawVal, m.transform);
          });
        } else {
          Object.assign(mapped, row);
        }
        return mapped;
      });

      return {
        success: true,
        fileName: targetFile,
        fileType: 'XML',
        totalLinesRead: text.split(/\r?\n/).length,
        headerRowIndex: 1,
        headerRowCount: 1,
        dataStartRow: 1,
        headersDetected: allHeaders,
        selectedImportantColumns: importantCols.length > 0 ? importantCols : allHeaders,
        parsedRowsCount: flattenedRows.length,
        rawLinesSample: text.split(/\r?\n/).slice(0, 8),
        parsedRowsSample: sampleRows,
        mappedRowsSample,
        footerSkippedLines: [],
        structureSummary: {
          totalColumnsDetected: allHeaders.length,
          totalRowsEstimated: flattenedRows.length,
          details: `Parsed XML using record tag [${recordTag}].`
        }
      };
    }

    // ==========================================
    // 3. CSV / TSV / PIPE / TXT DELIMITED PARSING
    // ==========================================
    const content = await fetchRemoteFileContent(db, targetFile);
    if (!content || !content.trim()) {
      throw new Error(`Failed to preview file '${targetFile}': File contains no readable text content.`);
    }

    const allLines = content.split(/\r?\n/).filter(l => l.length > 0);
    const totalLines = allLines.length;
    const delimiter = resolveDelimiter(config.fileFormat || 'CSV', config.customDelimiter);
    const quoteChar = config.quoteChar || '"';

    const activeLines = skipFooter > 0 ? allLines.slice(0, allLines.length - skipFooter) : allLines;
    const footerLines = skipFooter > 0 ? allLines.slice(allLines.length - skipFooter) : [];

    // Multi-row header parsing
    const headerStartIdx = headerIndex - 1;
    const headerEndIdx = headerStartIdx + headerRowCount;
    const rawHeaderLines = activeLines.slice(headerStartIdx, headerEndIdx);

    let headers: string[] = [];
    if (config.hasHeader !== false && rawHeaderLines.length > 0) {
      const splitHeaderRows = rawHeaderLines.map(line => parseDelimitedLine(line, delimiter, quoteChar));
      const colCount = Math.max(...splitHeaderRows.map(r => r.length), 0);

      for (let c = 0; c < colCount; c++) {
        const parts: string[] = [];
        for (let r = 0; r < splitHeaderRows.length; r++) {
          const val = (splitHeaderRows[r]?.[c] || '').replace(/^["'#\s]+|["'\s]+$/g, '');
          if (val && !parts.includes(val)) {
            parts.push(val);
          }
        }
        const combined = parts.join(separator).replace(/^_+|_+$/g, '') || `col_${c + 1}`;
        headers.push(combined);
      }
    }

    const dataStartIndex = Math.max(headerEndIdx + 1, config.dataStartRow || (headerEndIdx + 1));
    const dataLines = activeLines.slice(dataStartIndex - 1);

    if (headers.length === 0 && dataLines.length > 0) {
      const sampleCols = parseDelimitedLine(dataLines[0], delimiter, quoteChar);
      headers = sampleCols.map((_, idx) => `col_${idx + 1}`);
    }

    const parsedRowsSample: Record<string, any>[] = [];
    const mappedRowsSample: Record<string, any>[] = [];
    const sampleLimit = Math.min(15, dataLines.length);
    const mappings = config.fieldMappings || [];
    const importantCols = config.selectedImportantColumns || mappings.filter(m => m.isImportant !== false).map(m => m.sourceColumn);

    for (let i = 0; i < sampleLimit; i++) {
      const values = parseDelimitedLine(dataLines[i], delimiter, quoteChar);
      const parsedRow: Record<string, any> = {};
      const mappedRow: Record<string, any> = {};

      headers.forEach((hdr, idx) => {
        parsedRow[hdr] = values[idx] ?? null;
      });
      parsedRowsSample.push(parsedRow);

      if (mappings.length > 0) {
        mappings.forEach(m => {
          const rawVal = parsedRow[m.sourceColumn] ?? m.defaultValue ?? null;
          mappedRow[m.canonicalField] = applyFieldTransform(rawVal, m.transform);
        });
      } else {
        Object.assign(mappedRow, parsedRow);
      }
      mappedRowsSample.push(mappedRow);
    }

    return {
      success: true,
      fileName: targetFile,
      fileType: ext === '.txt' || ext === '.dat' ? 'TXT' : 'CSV',
      totalLinesRead: totalLines,
      headerRowIndex: headerIndex,
      headerRowCount,
      dataStartRow: dataStartIndex,
      headersDetected: headers,
      selectedImportantColumns: importantCols.length > 0 ? importantCols : headers,
      delimiterUsed: delimiter,
      parsedRowsCount: dataLines.length,
      rawLinesSample: allLines.slice(0, 8),
      parsedRowsSample,
      mappedRowsSample,
      footerSkippedLines: footerLines,
      structureSummary: {
        totalColumnsDetected: headers.length,
        totalRowsEstimated: dataLines.length,
        details: `Parsed delimited feed using delimiter '${delimiter}' and ${headerRowCount}-row header.`
      }
    };
  },

  /**
   * Executes full staging of FTP file(s) into a PostgreSQL UNLOGGED mirror table.
   * Supports:
   * 1. Single file or multi-folder looping traversal.
   * 2. Projection filtering (only important columns are materialized).
   * 3. Registering the prepared table into allowed_tables for Workflow Studio Lookups.
   */
  async stageFtpFileForValidation(
    db: DatabaseConnection,
    config: FtpFileStagingConfig
  ): Promise<{
    success: boolean;
    stagingTableName: string;
    stagedCount: number;
    filesProcessedCount: number;
    filesProcessed: string[];
    executionTimeMs: number;
    message: string;
  }> {
    const started = Date.now();
    const traversalMode = config.folderTraversalMode || 'SINGLE_FILE';

    // 1. Collect target files to process
    let targetFiles: { fullPath: string; folder: string; name: string }[] = [];

    if (traversalMode === 'RECURSIVE_SCAN' || traversalMode === 'DIRECTORY_SCAN') {
      const recursiveEntries = await discoverFtpFilesRecursive(db, config.sourceDirectoryPath, 8);
      const pattern = config.fileNamePattern.toLowerCase().replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`, 'i');

      targetFiles = recursiveEntries
        .filter(entry => regex.test(entry.name) || regex.test(entry.fullPath))
        .map(entry => ({
          fullPath: entry.fullPath,
          folder: entry.relativeFolder,
          name: entry.name
        }));

      // Error if no pattern matched
      if (targetFiles.length === 0) {
        throw new Error(`No remote files matched pattern '${config.fileNamePattern}' in directory '${config.sourceDirectoryPath || '/'}' (${recursiveEntries.length} files found on server).`);
      }
    } else {
      targetFiles = [{
        fullPath: config.fileNamePattern,
        folder: '/',
        name: config.fileNamePattern.replace(/^.*[\\\/]/, '')
      }];
    }

    // 2. Determine target mirror table name
    const sanitizedBase = sanitizeColumnName(config.fileNamePattern.replace(/[^a-zA-Z0-9]/g, '_'), 1);
    const mirrorTableName = config.stagingTableName || `mirror_ftp_${sanitizedBase}`;

    // 3. Resolve columns to stage: Important Columns & Mappings
    const mappings = config.fieldMappings || [];
    const importantCols = config.selectedImportantColumns && config.selectedImportantColumns.length > 0
      ? config.selectedImportantColumns
      : mappings.filter(m => m.isImportant !== false).map(m => m.sourceColumn);

    // Build physical columns list
    const columnDefinitions: { colName: string; dataType: string; sourceColumn: string; transform?: string }[] = [];

    if (mappings.length > 0) {
      mappings.forEach((m, idx) => {
        if (importantCols.length === 0 || importantCols.includes(m.sourceColumn) || m.isImportant !== false) {
          const colName = sanitizeColumnName(m.canonicalField || m.sourceColumn, idx + 1);
          let pgType = 'VARCHAR(255)';
          if (m.dataType === 'number') pgType = 'NUMERIC(18, 4)';
          else if (m.dataType === 'date') pgType = 'TIMESTAMPTZ';
          else if (m.dataType === 'boolean') pgType = 'BOOLEAN';

          columnDefinitions.push({
            colName,
            dataType: pgType,
            sourceColumn: m.sourceColumn,
            transform: m.transform
          });
        }
      });
    }

    // Default fallback columns if no specific mappings
    if (columnDefinitions.length === 0) {
      columnDefinitions.push(
        { colName: 'transaction_id', dataType: 'VARCHAR(255)', sourceColumn: 'transaction_id' },
        { colName: 'amount', dataType: 'NUMERIC(18, 4)', sourceColumn: 'amount', transform: 'NUMERIC_CLEAN' },
        { colName: 'currency', dataType: 'VARCHAR(10)', sourceColumn: 'currency', transform: 'UPPERCASE' },
        { colName: 'status', dataType: 'VARCHAR(50)', sourceColumn: 'status', transform: 'UPPERCASE' }
      );
    }

    // 4. Provision or refresh PostgreSQL UNLOGGED mirror table
    const tableColsSql = columnDefinitions
      .map(c => `"${c.colName}" ${c.dataType}`)
      .join(',\n  ');

    await queryPg(`
      CREATE UNLOGGED TABLE IF NOT EXISTS "${mirrorTableName}" (
        _staging_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        _staged_at TIMESTAMPTZ DEFAULT NOW(),
        _source_file TEXT,
        _source_folder TEXT,
        _raw_row_index INT,
        ${tableColsSql},
        raw_payload JSONB
      );
    `);

    // Truncate previous records for clean staging
    await queryPg(`TRUNCATE TABLE "${mirrorTableName}";`);

    let totalStaged = 0;
    const processedFilesList: string[] = [];

    // 5. Loop through all discovered files across folders
    for (const fileItem of targetFiles) {
      const preview = await this.testPreviewParse(db, {
        ...config,
        fileNamePattern: fileItem.fullPath
      });

      const rowsToInsert = preview.parsedRowsSample;
      if (rowsToInsert.length === 0) continue;

      const insertChunks: string[] = [];
      rowsToInsert.forEach((rawRow, idx) => {
        const colValues: string[] = [];

        columnDefinitions.forEach(c => {
          let rawVal = rawRow[c.sourceColumn];
          if (rawVal === undefined || rawVal === null) {
            const cleanSource = c.sourceColumn.toLowerCase().replace(/[^a-z0-9]/g, '');
            const foundKey = Object.keys(rawRow).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanSource) || cleanSource.includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
            if (foundKey) rawVal = rawRow[foundKey];
          }
          const transformed = applyFieldTransform(rawVal, c.transform);

          if (transformed === null || transformed === undefined) {
            colValues.push('NULL');
          } else if (c.dataType.startsWith('NUMERIC')) {
            const num = parseFloat(String(transformed).replace(/[^0-9.-]/g, ''));
            colValues.push(isNaN(num) ? '0' : String(num));
          } else if (c.dataType.startsWith('TIMESTAMP')) {
            const dt = new Date(transformed);
            colValues.push(isNaN(dt.getTime()) ? 'NOW()' : `'${dt.toISOString()}'`);
          } else {
            const escaped = String(transformed).replace(/'/g, "''");
            colValues.push(`'${escaped}'`);
          }
        });

        const escapedFile = fileItem.name.replace(/'/g, "''");
        const escapedFolder = fileItem.folder.replace(/'/g, "''");
        const jsonPayload = JSON.stringify(rawRow).replace(/'/g, "''");

        insertChunks.push(`(
          '${escapedFile}',
          '${escapedFolder}',
          ${idx + 1},
          ${colValues.join(', ')},
          '${jsonPayload}'::jsonb
        )`);
        totalStaged++;
      });

      if (insertChunks.length > 0) {
        const colNamesSql = columnDefinitions.map(c => `"${c.colName}"`).join(', ');
        await queryPg(`
          INSERT INTO "${mirrorTableName}" (
            _source_file, _source_folder, _raw_row_index, ${colNamesSql}, raw_payload
          ) VALUES ${insertChunks.join(',\n')};
        `);
      }

      processedFilesList.push(fileItem.fullPath);
    }

    const executionTimeMs = Date.now() - started;

    // 6. Register table in allowed_tables on database_connections so it appears in Lookup Workflows
    try {
      const allowed = Array.isArray(db.allowedTables) ? [...db.allowedTables] : [];
      if (!allowed.includes(mirrorTableName)) {
        allowed.push(mirrorTableName);
        await repo.updateDatabase(db.id, { allowedTables: allowed });
      }
    } catch (e: any) {
      console.warn(`[ftpFileStagingService] Could not register ${mirrorTableName} in allowed_tables:`, e.message);
    }

    // 7. Update staging configuration record in PostgreSQL
    await repo.updateFtpStagingConfig(config.id, {
      lastStagedAt: new Date().toISOString(),
      lastStagedStatus: 'STAGED_READY',
      lastStagedCount: totalStaged,
      stagingTableName: mirrorTableName,
      lastErrorMessage: undefined
    });

    return {
      success: true,
      stagingTableName: mirrorTableName,
      stagedCount: totalStaged,
      filesProcessedCount: processedFilesList.length,
      filesProcessed: processedFilesList,
      executionTimeMs,
      message: `Successfully staged ${totalStaged} records across ${processedFilesList.length} files into prepared table [${mirrorTableName}] in ${executionTimeMs}ms. Ready for Lookup Workflows.`
    };
  }
};
