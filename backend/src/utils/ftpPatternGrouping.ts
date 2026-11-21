/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Semantic Pattern Grouping & Deduplication for Remote SFTP Files
 * Groups similar file types across different folders (e.g. AIB vs BIB, different years/months),
 * prepares one dedicated table per file pattern, and detects candidate file types automatically.
 */

import { FtpFileEntry } from '../services/ftpConnectionService.js';
import { SemanticPatternGroup } from '../types.js';

/**
 * Derives a normalized wildcard pattern for a given filename by generalizing
 * variable bank acronyms, rotating date stamps, and sequence numbers.
 */
export function deriveSemanticPattern(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot !== -1 ? fileName.slice(dot) : '';
  const stem = dot !== -1 ? fileName.slice(0, dot) : fileName;
  const lowerStem = stem.toLowerCase();

  // 1. High-precedence banking business signature patterns
  if (lowerStem.includes('unsettled')) {
    return '*-Unsettled' + ext;
  }
  if (lowerStem.includes('morning_settlement')) {
    return '*_Morning_Settlement*' + ext;
  }
  if (lowerStem.includes('morning_summary')) {
    return '*_Morning_Summary*' + ext;
  }
  if (lowerStem.includes('settlemnt')) {
    return '*Settlemnt' + ext;
  }
  if (lowerStem.includes('settlement')) {
    return '*Settlement' + ext;
  }
  if (lowerStem.includes('clearing')) {
    return '*Clearing*' + ext;
  }
  if (lowerStem.includes('chargeback')) {
    return '*Chargeback*' + ext;
  }
  if (lowerStem.includes('reversal')) {
    return '*Reversal*' + ext;
  }

  // 2. Generic date & sequence number generalization
  let generalized = stem
    // Date formats: 2026.08.29, 22.06.2026, 9-10-26, 2026-08-29, 20260829
    .replace(/\b\d{2,4}[._-]\d{1,2}[._-]\d{1,4}\b/g, '*')
    .replace(/\b(19|20)\d{6}\b/g, '*')
    .replace(/\b\d{4,}\b/g, '*')
    // Trailing batch sequence counters: _1, _3
    .replace(/_\d+$/g, '_*')
    // Leading bank / institution acronyms: AIB_, BIB_, AMHARA_, CBE_
    .replace(/^[A-Za-z0-9]+[_-]/, '*_')
    // Collapse duplicate wildcards
    .replace(/\*+/g, '*');

  if (!generalized.startsWith('*')) {
    generalized = '*' + generalized;
  }

  return generalized + ext;
}

/**
 * Derives a clean, deterministic PostgreSQL mirror table name for a given pattern.
 * E.g., "*Settlemnt.xls" -> "mirror_ftp_settlemnt"
 *       "*-Unsettled.xls" -> "mirror_ftp_unsettled"
 *       "*_Morning_Settlement*.xlsx" -> "mirror_ftp_morning_settlement"
 */
export function deriveTableNameForPattern(pattern: string): string {
  const dot = pattern.lastIndexOf('.');
  const base = (dot !== -1 ? pattern.slice(0, dot) : pattern)
    .replace(/[\*?]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  const clean = base || 'incoming_feed';
  return `mirror_ftp_${clean}`;
}

/**
 * Evaluates whether a candidate file matches the given wildcard pattern.
 */
export function matchesFilePattern(pattern: string, fileName: string, fullPath?: string): boolean {
  if (!pattern || pattern.trim() === '*' || pattern.trim() === '.*') return true;
  const cleanPat = pattern.trim();
  const escaped = cleanPat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${escaped}$`, 'i');
  if (regex.test(fileName)) return true;
  if (fullPath) {
    if (regex.test(fullPath)) return true;
    const pathBase = fullPath.replace(/^.*[\\\/]/, '');
    if (regex.test(pathBase)) return true;
  }
  return false;
}

/**
 * Groups discovered files into semantic file-type patterns across all folders recursively.
 */
export function groupFilesBySemanticPattern(files: FtpFileEntry[]): SemanticPatternGroup[] {
  if (!files || files.length === 0) return [];

  const patternMap = new Map<string, FtpFileEntry[]>();

  for (const f of files) {
    const pat = deriveSemanticPattern(f.name);
    if (!patternMap.has(pat)) {
      patternMap.set(pat, []);
    }
    patternMap.get(pat)!.push(f);
  }

  const groups: SemanticPatternGroup[] = [];

  for (const [pattern, matched] of patternMap.entries()) {
    const folders = Array.from(new Set(matched.map(f => (f.relativeFolder || '/').replace(/\\/g, '/')))).sort();
    const sample = matched[0];
    const suggestedTableName = deriveTableNameForPattern(pattern);

    groups.push({
      pattern,
      cleanPattern: pattern.replace(/\*/g, '').replace(/^\./, ''),
      fileType: sample.fileType as any || 'OTHER',
      fileCount: matched.length,
      folders,
      suggestedTableName,
      sampleFile: {
        name: sample.name,
        fullPath: sample.fullPath,
        relativeFolder: sample.relativeFolder || '/',
        size: sample.size || 0,
        fileType: sample.fileType
      },
      matchedFiles: matched.map(m => ({
        name: m.name,
        fullPath: m.fullPath,
        relativeFolder: m.relativeFolder || '/',
        size: m.size || 0,
        fileType: m.fileType
      }))
    });
  }

  // Sort by highest file count first, then pattern name
  return groups.sort((a, b) => b.fileCount - a.fileCount || a.pattern.localeCompare(b.pattern));
}
