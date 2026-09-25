/**
 * Centralized status flag colors and pipeline default actions.
 * Decouples database/business logic from presentation tokens.
 */
export const STATUS_FLAG_COLORS = {
  PASS: 'emerald',
  FAIL: 'rose',
  ERROR: 'rose',
  WARNING: 'amber',
  DIAGNOSTIC: 'indigo',
  NEUTRAL: 'slate'
} as const;

export const DEFAULT_PIPELINE_ACTIONS = {
  ON_PASS: 'CONTINUE',
  ON_FAIL: 'STOP',
  ON_ERROR: 'STOP'
} as const;
