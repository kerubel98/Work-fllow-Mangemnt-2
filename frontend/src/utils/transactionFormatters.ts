/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExtractedRowData {
  rowId: string;
  rowNum: number;
  txnId: string;
  amount: number;
  currency: string;
  status: string;
  investigationStatus: string;
  investigationLabel: string;
  validationStatus: string;
  validationText: string;
  isDuplicate: boolean;
  isClosed: boolean;
  resolutionNote: string;
  terminalId: string;
  trDate: string;
  rawData: any;
  targetRecord?: any;
  stepResults?: Record<string, any>;
}

/**
 * Universal extractor for transaction rows from various sources:
 * - PostgreSQL task_dataset_transactions
 * - OrchestratedRow instances from ValidationOrchestratorWorkspace
 * - Ingestion attachment tabular rows
 * - Raw database records
 */
export function extractRowData(r: any, idx: number = 0): ExtractedRowData {
  if (!r) {
    return {
      rowId: `row-${idx + 1}`,
      rowNum: idx + 1,
      txnId: `TXN-${idx + 1}`,
      amount: 0,
      currency: 'ETB',
      status: 'Pending',
      investigationStatus: 'UNINVESTIGATED',
      investigationLabel: 'Pending',
      validationStatus: 'PENDING',
      validationText: 'Awaiting verification',
      isDuplicate: false,
      isClosed: false,
      resolutionNote: '',
      terminalId: '',
      trDate: '',
      rawData: {}
    };
  }

  // Find the primary data dictionary:
  // 1. If r has sourceRecord, that contains the ingested transaction attributes
  // 2. If r has canonical_data, that contains the structured canonical fields
  // 3. Fallback to r itself
  const src = r.sourceRecord || r.canonical_data || r;
  const canon = src.canonical_data || r.canonical_data || {};

  // Row identification
  const rowId = String(r.rowId || r.id || src.id || `row-${idx + 1}`);

  // Transaction ID / Reference number
  const txnId = String(
    r.transaction_id ||
    r.tx_id ||
    src.fe_utrnno ||
    src.fe_utrn ||
    src.retrieval_ref_num ||
    src.refnum ||
    src.ref_num ||
    src.transaction_id ||
    src.tx_id ||
    canon.fe_utrnno ||
    canon.fe_utrn ||
    canon.retrieval_ref_num ||
    canon.refnum ||
    canon.transaction_id ||
    rowId
  );

  // Amount extraction (handling numeric, string numbers, commas, currencies)
  let rawAmt =
    r.amount ??
    src.reqamt ??
    src.amnt1 ??
    src.amount ??
    src.amount_usd ??
    src.REQAMT ??
    src.AMNT1 ??
    canon.reqamt ??
    canon.amnt1 ??
    canon.amount ??
    0;

  let amtNum = 0;
  if (typeof rawAmt === 'number') {
    amtNum = isNaN(rawAmt) ? 0 : rawAmt;
  } else if (rawAmt !== null && rawAmt !== undefined) {
    const cleaned = String(rawAmt).replace(/[^0-9.-]/g, '');
    amtNum = parseFloat(cleaned) || 0;
  }

  // Currency extraction and ISO conversion
  let rawCurr =
    r.currency ??
    src.currency ??
    src.currency1 ??
    src.currency_code ??
    src.ccy ??
    canon.currency ??
    canon.currency1 ??
    canon.currency_code ??
    '';

  let currency = String(rawCurr || '').trim().toUpperCase();
  if (currency === '230') currency = 'ETB';
  else if (currency === '840') currency = 'USD';
  else if (currency === '978') currency = 'EUR';
  else if (!currency) currency = 'ETB'; // Default settlement currency

  // Validation Status
  const valStatus = String(
    r._validation_status ||
    src._validation_status ||
    canon._validation_status ||
    (r.overallSeverity === 'RECONCILED' ? 'PASS' : r.overallSeverity === 'FLAGGED' ? 'FAIL' : 'PENDING')
  ).toUpperCase();

  // Financial status (e.g. Success, Settled, Failed, Pending)
  let status = String(
    r.status ||
    src.status ||
    src.status_state ||
    canon.status ||
    (valStatus === 'PASS' ? 'Success' : valStatus === 'FAIL' ? 'Failed' : 'Pending')
  );

  // Capitalize nicely if lowercase
  if (status.length > 0) {
    status = status.charAt(0).toUpperCase() + status.slice(1);
  }

  // Investigation status & label
  const invStatus = String(
    r.investigationStatus ||
    src.investigationStatus ||
    (valStatus === 'PASS' ? 'VERIFIED_MATCH' : valStatus === 'FAIL' ? 'FLAGGED_DISCREPANCY' : 'UNINVESTIGATED')
  );

  let invLabel = 'Pending';
  if (invStatus === 'VERIFIED_MATCH' || invStatus === 'RECONCILED') {
    invLabel = 'Reconciled';
  } else if (invStatus === 'FLAGGED_DISCREPANCY' || invStatus === 'FLAGGED') {
    invLabel = 'Flagged';
  } else if (invStatus === 'CLOSED') {
    invLabel = 'Closed';
  } else if (invStatus === 'IN_PROGRESS' || invStatus === 'INVESTIGATING') {
    invLabel = 'Investigating';
  }

  // Validation text summary
  let validationText = 'Awaiting verification';
  if (valStatus === 'PASS') {
    validationText = 'Verified Match';
  } else if (valStatus === 'FAIL') {
    validationText = 'Discrepancy Found';
  } else if (valStatus === 'PAUSED_DB_OFFLINE') {
    validationText = 'Database Paused';
  }

  // Duplicate flag
  const isDuplicate = Boolean(
    r.isDuplicate ||
    r._is_duplicate ||
    src.isDuplicate ||
    src._is_duplicate ||
    canon.isDuplicate ||
    canon._is_duplicate
  );

  const terminalId = String(src.terminal_id || src.termid || canon.terminal_id || '');
  const trDate = String(src.tr_date || src.transaction_date || canon.tr_date || '');

  return {
    rowId,
    rowNum: idx + 1,
    txnId,
    amount: amtNum,
    currency,
    status,
    investigationStatus: invStatus,
    investigationLabel: invLabel,
    validationStatus: valStatus,
    validationText,
    isDuplicate,
    isClosed: Boolean(r.isClosed || src.isClosed),
    resolutionNote: String(r.resolutionNote || src.resolutionNote || ''),
    terminalId,
    trDate,
    rawData: src,
    targetRecord: r._target_record || src._target_record || canon._target_record,
    stepResults: r.stepResults || src.stepResults
  };
}

/**
 * Human-readable relative time formatting (e.g., '10m ago', '2h ago', '3d ago')
 */
export function formatTimeAgo(dateStr?: string | Date): string {
  if (!dateStr) return 'recently';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'recently';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'just now';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
