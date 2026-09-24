export type UserRole = 'admin' | 'operational' | 'technical' | 'managerial';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: string;
  canExecuteSelect?: boolean;
  canExecuteUpdate?: boolean;
  allowedDbIds?: string[];
  permanentTeamId?: string;
  shareWorkspaceWithTeam?: boolean;
}

export type NotificationType = 'chat' | 'task_assigned' | 'team_added' | 'issue_assigned' | 'system';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  linkTab?: string;
  targetTeamId?: string;
  targetTaskId?: string;
  targetIssueId?: string;
  targetDirectUserId?: string;
  targetSubTab?: string;
  actorName?: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  receiverId: string;
  receiverName: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export type AllowedQueryType = 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE' | 'ALTER' | 'CREATE' | 'DROP';

export interface MemberPrivilege {
  allowedDbIds: string[];
  allowedQueryTypes: AllowedQueryType[];
}

export interface TeamAdminPrivileges {
  isFullAdmin?: boolean;
  canManageConnections?: boolean;
  canMonitorConnections?: boolean;
  canManageAccessRequests?: boolean;
  canManageColumnMapping?: boolean;
  canManageUsers?: boolean;
  canManageSystems?: boolean;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  teamType?: 'permanent' | 'working';
  managerId: string;
  managerName: string;
  memberIds: string[];
  createdAt: string;
  allowedDbIds?: string[];
  allowedQueryTypes?: AllowedQueryType[];
  memberPrivileges?: Record<string, MemberPrivilege>;
  adminPrivileges?: TeamAdminPrivileges;
}

export type TeamRelationshipType =
  | 'PARENT_UNIT'
  | 'SUB_UNIT'
  | 'ESCALATION_TARGET'
  | 'PEER_COLLABORATOR'
  | 'UPSTREAM_PROVIDER'
  | 'DOWNSTREAM_CONSUMER'
  | 'AUDIT_COMPLIANCE_REVIEWER';

export interface TeamRelationship {
  id: string;
  sourceTeamId: string;
  targetTeamId: string;
  relationshipType: TeamRelationshipType;
  description?: string;
  createdBy?: string;
  createdAt: string;
  sourceTeamName?: string;
  targetTeamName?: string;
  sourceTeamType?: 'permanent' | 'working';
  targetTeamType?: 'permanent' | 'working';
}

export interface TeamTask {
  id: string;
  teamId: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  creatorId: string;
  creatorName: string;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  createdAt: string;
  dueDate?: string;
  startDate?: string;
  milestone?: string;
  isPublic?: boolean;
  visibility?: 'team' | 'public' | 'private';
  escalatedToTeamId?: string;
  escalationReason?: string;
  escalatedAt?: string;
}

export interface TeamInsight {
  id: string;
  teamId: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  tags: string[];
  createdAt: string;
}

export interface TeamDiscussionMessage {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  content: string;
  timestamp: string;
}

export type SolutionProcessType = 'READ_ONLY_AUDIT' | 'INTERNAL_STAGED_FIX' | 'CAUTIOUS_PROCESS';

export interface ChatMention {
  type: 'user' | 'team';
  id: string;
  name: string;
}

export interface ChatInvestigationSummary {
  issueId: string;
  totalRecords: number;
  discrepancyCount: number;
  affectedAmount?: number;
  keyFindings: string;
  validationStatus?: string;
  timestamp: string;
}

export interface ChatSolutionProposal {
  id: string;
  script: string;
  processType: SolutionProcessType;
  proposedBy: string;
  proposedByName: string;
  proposedAt: string;
  accepted?: boolean;
  acceptedBy?: string;
  acceptedByName?: string;
  acceptedAt?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  timestamp: string;
  mentions?: ChatMention[];
  attachedSummary?: ChatInvestigationSummary;
  solutionProposal?: ChatSolutionProposal;
}

export type IssueStatus = 'Open' | 'Investigating' | 'Resolved' | 'Closed';
export type IssuePriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  type: 'file' | 'single';
  transactionId?: string;
  uploadedFileName?: string;
  uploadedFileHeaders?: string[];
  fileMapping?: Record<string, string>;
  firstLevelNotes?: string;
  firstLevelMappedData?: Record<string, any>[];
  secondLevelNotes?: string;
  solutionScript?: string;
  solutionTestResult?: string;
  solutionExecuted?: boolean;
  solutionExecutedAt?: string;
  linkedHashtag?: string;
  chat?: ChatMessage[];
  assignedTechUserId?: string;
  assignedTechUserName?: string;
  investigationSystemId?: string;
  investigationEnvironment?: 'testing' | 'production';
  investigationTable?: string;
  validationStatus?: 'untested' | 'passed' | 'failed';
  validationErrors?: string[];
  queryResults?: any[];
  movedToTesting?: boolean;
  rowLabels?: Record<string, string>;
  addedLabelColumnName?: string;
  customFilters?: { column: string; value: string }[];
  transactionCount?: number;
  datasetStatus?: string;
  teamId?: string;
  visibility?: 'TEAM_PUBLIC' | 'PERSONAL_PRIVATE';
  processType?: SolutionProcessType;
  workflowId?: string;
  acceptedScriptProposalId?: string;
  initialSnapshot?: Record<string, any>[];
}

export interface CriteriaRule {
  column: string;
  operator: 'is_required' | 'must_be_numeric' | 'value_greater_than' | 'length_matches';
  value?: string;
}

export interface HashtagKpi {
  id: string;
  assignedTeamId?: string;
  assignedTeamName?: string;
  targetResolutionHours: number;
  expectedAccuracyPercent: number;
  maxPendingDays: number;
  createdAt: string;
}

export interface HashtagPreset {
  tag: string;
  description: string;
  criteria: string;
  expectedFileStructure: string[];
  solutionTemplate: string;
  author: string;
  createdAt: string;
  fileTemplateData?: Record<string, string>[];
  criteriaRules?: CriteriaRule[];
  workflowId?: string;
  workflowName?: string;
  processType?: SolutionProcessType;
  kpis?: HashtagKpi[];
}

export interface TransactionReversionSnapshot {
  id: string;
  taskId: string;
  transactionId?: string;
  processType: SolutionProcessType;
  beforeState: Record<string, any> | Record<string, any>[];
  afterState?: Record<string, any> | Record<string, any>[];
  reason?: string;
  createdBy: string;
  createdAt: string;
  revertedAt?: string;
  revertedBy?: string;
}

export interface UnifiedAuditDossier {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  priority: string;
  creator: { id: string; name: string };
  assignedTech?: { id?: string; name?: string };
  teamId?: string;
  visibility: string;
  linkedHashtag?: string;
  createdAt: string;
  solutionScript?: string;
  processType?: SolutionProcessType;
  solutionExecuted?: boolean;
  solutionExecutedAt?: string;
  chatHistory: ChatMessage[];
  investigationSummary?: Record<string, any>;
  validationExecutions: any[];
  initialTransactionsSnapshot: Record<string, any>[];
  currentTransactionsSnapshot: Record<string, any>[];
  reversionHistory: TransactionReversionSnapshot[];
  generatedAt: string;
}

export interface EnvironmentConfig {
  dbName: string;
  allowedTables: string[];
  apiEndpoint: string;
}

export interface EnvironmentSystem {
  id: string;
  name: string;
  description: string;
  testing: EnvironmentConfig;
  production: EnvironmentConfig;
  allowedUserIds: string[];
  allowedRoles: UserRole[];
  requireDmlApproval?: boolean;
}

export interface QueryApprovalRequest {
  id: string;
  systemId: string;
  systemName: string;
  environment: 'testing' | 'production';
  tableName: string;
  query: string;
  requesterId: string;
  requesterName: string;
  requesterRole: UserRole;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  issueId?: string;
  issueTitle?: string;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'notification' | 'security' | 'automation' | 'database';
  config?: Record<string, string>;
}

export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'PostgreSQL' | 'Oracle' | 'MySQL' | 'MongoDB' | 'FTP' | 'SFTP';
  host: string;
  port?: number;
  connectionString?: string;
  databaseName?: string;
  username?: string;
  password?: string;
  status: 'online' | 'offline';
  apiEndpoint: string;
  createdByAdmin?: boolean;
  requiresAccessApproval?: boolean;
  description?: string;
  allowedRoles?: UserRole[];
  systemCategory?: string;
  environmentType?: string;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed';
  lastTestMessage?: string;
  pingMs?: number;
  availableTables?: string[];
  allowedTables?: string[];
  secure?: boolean;
  passive?: boolean;
  baseDirectory?: string;
  scope?: 'global' | 'team';
  teamId?: string;
  createdByUserId?: string;
  promotionStatus?: 'NONE' | 'PENDING_ADMIN_APPROVAL' | 'APPROVED' | 'REJECTED';
  promotionRequestedAt?: string;
  promotionRequestedBy?: string;
  promotionReviewedAt?: string;
  promotionReviewedBy?: string;
  promotionNotes?: string;
  lastError?: string;
}

export interface FtpFieldMapping {
  sourceColumn: string;
  canonicalField: string;
  dataType: string;
  isImportant?: boolean;
  isRequired?: boolean;
  defaultValue?: string;
  transform?: 'NONE' | 'UPPERCASE' | 'LOWERCASE' | 'TRIM' | 'NUMERIC_CLEAN';
}

export interface FolderStructureException {
  id: string;
  folderPattern: string; // e.g. "legacy/**", "branch_reports/*", "special"
  description?: string;
  note?: string;
  fileFormat?: 'CSV' | 'TSV' | 'PIPE' | 'SEMICOLON' | 'CUSTOM_DELIMITED' | 'EXCEL' | 'XML' | 'JSON' | 'FIXED_WIDTH' | 'TXT';
  customDelimiter?: string;
  hasHeader?: boolean;
  headerRowIndex?: number;
  headerRowCount?: number;
  dataStartRow?: number;
  excelSheetName?: string;
  xmlRootElement?: string;
  xmlRecordElement?: string;
  fieldMappings?: FtpFieldMapping[];
}

export interface FtpStagingScheduleConfig {
  enabled: boolean;
  frequency: 'MANUAL' | 'EVERY_15_MIN' | 'HOURLY' | 'EVERY_6_HOURS' | 'DAILY';
  scheduledTime?: string; // "02:00" for DAILY
  targetType: 'ALL' | 'CSV' | 'EXCEL' | 'XML' | 'TXT';
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface FtpSkippedMismatch {
  fileName: string;
  folder: string;
  expectedFormat: string;
  detectedFormat?: string;
  reason: string;
  timestamp: string;
}

export interface FtpFileStagingConfig {
  id: string;
  name: string;
  ftpConnectionId: string;
  fileNamePattern: string;
  fileFormat: 'CSV' | 'TSV' | 'PIPE' | 'SEMICOLON' | 'CUSTOM_DELIMITED' | 'EXCEL' | 'XML' | 'JSON' | 'FIXED_WIDTH' | 'TXT';
  customDelimiter?: string;
  hasHeader: boolean;
  headerRowIndex: number;
  headerRowCount?: number;
  handleMergedCells?: boolean;
  mergedHeaderSeparator?: string;
  dataStartRow: number;
  skipFooterLines: number;
  quoteChar?: string;
  encoding?: string;
  dateFormat?: string;
  excelSheetName?: string;
  folderTraversalMode?: 'SINGLE_FILE' | 'DIRECTORY_SCAN' | 'RECURSIVE_SCAN';
  sourceDirectoryPath?: string;
  rootDirectoryPath?: string;
  folderExceptions?: FolderStructureException[];
  mismatchHandling?: 'SKIP_AND_NOTIFY' | 'ABORT';
  scheduleConfig?: FtpStagingScheduleConfig;
  unconfiguredFolderAction?: 'NOTIFY_ADMIN';
  selectedImportantColumns?: string[];
  xmlRootElement?: string;
  xmlRecordElement?: string;
  fieldMappings: FtpFieldMapping[];
  stagingTableName?: string;
  stagingMode?: 'APPEND' | 'REPLACE';
  isPermanentTable?: boolean;
  sampleFileName?: string;
  lastStagedAt?: string;
  lastStagedStatus?: 'IDLE' | 'STAGED_READY' | 'FAILED';
  lastStagedCount?: number;
  lastErrorMessage?: string;
  lastSkippedMismatches?: FtpSkippedMismatch[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DbAccessRequest {
  id: string;
  userId: string;
  username: string;
  userRole: UserRole;
  dbId: string;
  dbName: string;
  requestedPrivilege: 'SELECT' | 'UPDATE' | 'FULL';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
}

export interface ConnectionUsageLog {
  id: string;
  userId: string;
  username: string;
  userRole: UserRole;
  dbId: string;
  dbName: string;
  queryType: 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE';
  queryStatement: string;
  timestamp: string;
  executionTimeMs: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  blogPostContent: string;
  category: string;
  logoUrl?: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  pendingJoinRequestUserIds?: string[];
  associatedTeamIds?: string[];
  associatedDbIds?: string[];
  domain?: string;
  settings?: Record<string, any>;
  createdAt: string;
}

export interface GlobalStandardDirectoryRecord {
  id: string;
  key: string;
  label: string;
  description: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  isStandard: boolean;
  exampleValue?: any;
  category?: string;
  notes?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export type TransactionKeyField = GlobalTransactionSchemaField;

export interface GlobalTransactionSchemaField {
  id?: string;
  key: string;
  label: string;
  description: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  isStandard?: boolean;
  exampleValue?: any;
  category?: string;
  notes?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}


export interface GlobalTransactionSchemaConfig {
  version: string;
  updatedAt: string;
  updatedBy: string;
  standardFields: GlobalTransactionSchemaField[];
  customFields: GlobalTransactionSchemaField[];
  defaultTemplateId?: string;
}

export interface ColumnMappingRule {
  targetKey?: string;      // Standard key, e.g. 'transaction_id'
  targetFieldKey?: string;
  targetFieldLabel?: string;
  dataType?: string;
  required?: boolean;
  sourceHeader: string;    // Header in CSV, e.g. 'charge_id'
  defaultValue?: any;      // Fallback default value if blank
  transformRule?: 'none' | 'uppercase' | 'trim' | 'parse_currency' | 'mask_card' | string;
  transformationRule?: string;
  sampleSourceValue?: string;
  sampleMappedValue?: string;
  isValid?: boolean;
  validationMessage?: string;
}


export interface TransactionTemplate {
  id: string;
  name: string;             // e.g. "Stripe Chargebacks CSV Template"
  description: string;
  sourceType: 'csv' | 'json' | 'excel';
  isDefault?: boolean;
  sampleHeaders: string[];  // e.g. ['charge_id', 'card_num', 'charge_amount', 'buyer_email']
  mappings: ColumnMappingRule[];
  authorName: string;
  createdAt: string;
  updatedAt: string;
  globalKeyFieldSchemaId?: string;
}

export interface UploadedTransactionRecord {
  id: string;               // Unique working DB record ID
  batchId: string;          // Batch tracking ID e.g. BATCH-20260809-A71F
  sourceFilename: string;   // e.g. chargebacks_august.csv
  uploadedBy: string;       // username of uploader
  uploadedAt: string;       // ISO timestamp
  templateId?: string;
  templateName?: string;
  mappedData: {
    transaction_id: string;
    card_number: string;
    amount_usd: number;
    currency: string;
    customer_email: string;
    merchant_id: string;
    auth_time: string;
    status: string;
    response_code: string;
    category: string;
    [key: string]: any;
  };
  rawRecord: Record<string, any>;
  isReconciled?: boolean;
  notes?: string;
}

export interface WorkspaceTableRecord {
  id: string;
  file_name: string;
  user: string;
  user_id: string;
  tag: string;
  task_id: string;
  mapping_id?: string;
  mapping_name?: string;
  list_of_values_from_one_row?: any[];
  transformed_data: {
    transaction_id?: string;
    card_number?: string;
    amount_usd?: number | string;
    status_state?: string;
    created_at?: string;
    user_email?: string;
    merchant_id?: string;
    response_code?: string;
    currency?: string;
    terminal_id?: string;
    dispute_reason?: string;
    batch_seq_num?: string;
    [key: string]: any;
  };
  raw_data?: Record<string, any>;
  createdAt: string;
}

export interface UploadAuditLog {
  id: string;
  batchId: string;
  sourceFilename: string;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  uploadedBy: string;
  uploadedAt: string;
  templateId?: string;
  templateName?: string;
  fileSizeBytes?: number;
}

// ==========================================
// BUSINESS PROCESSING STAGE & STAGE-AWARE WORKFLOWS
// ==========================================

// 1. What a validation rule discovers (Rule Verdict)
export type ValidationResultStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED' | 'NOT_EVALUATED' | 'PAUSED_DB_OFFLINE';
export type ValidationVerdict = ValidationResultStatus;

// 2. What the workflow execution engine does next (Pipeline Action)
export type PipelineAction = 'CONTINUE' | 'STOP' | 'CLOSE' | 'FLAG' | 'REPORT';

// 3. Parent Task / Case lifecycle in the workspace (Case Lifecycle)
export type CaseLifecycleStatus = 'OPEN' | 'INVESTIGATING' | 'IN_PROGRESS' | 'ACTION_REQUIRED' | 'RESOLVED' | 'CLOSED';

// 4. Financial Transaction investigation and Maker-Checker resolution state
export type TransactionInvestigationStatus =
  | 'PENDING'
  | 'INVESTIGATING'
  | 'RECONCILED'
  | 'FLAGGED'
  | 'CLOSED'
  | 'UNINVESTIGATED'
  | 'IN_PROGRESS'
  | 'VERIFIED_MATCH'
  | 'FLAGGED_DISCREPANCY'
  | 'PENDING_CHECKER_REVIEW'
  | 'FORCE_MATCHED'
  | 'MANUALLY_REVERSED'
  | 'WRITTEN_OFF'
  | 'CLOSED_RESOLVED'
  | 'CLOSED_UNRESOLVED';

export interface ProcessingStage {
  id: string;
  name: string;
  description?: string;
  order: number;
  enabled: boolean;
  targetDbId: string;
  targetDataSource: string; // Dynamic table, view, or collection name
  mappingConfigId?: string; // Optional reference to DbTableMappingConfig
  businessMeaning?: string; // e.g., 'Authorization Processing', 'Financial Settlement'
  createdAt?: string;
  updatedAt?: string;
}

export type DataSourceOrigin = 'INPUT' | 'MIRROR' | 'LEG';

export interface ComparisonOperand {
  origin: DataSourceOrigin;
  field: string;          // User-configured column name (e.g., 'txn_amount', 'posted_amt')
  legKey?: string;        // e.g., 'ORIGINAL.DEBIT', 'ORIGINAL.CREDIT', 'ORIGINAL.FEE', 'REVERSAL.DEBIT'
}

export interface DualSourceCondition {
  id?: string;
  sourceA: ComparisonOperand;
  comparator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS' | 'NUMERIC_TOLERANCE' | 'GREATER_THAN' | 'LESS_THAN' | 'IN' | 'LOOKUP_MAP' | string;
  sourceB: ComparisonOperand;
  toleranceMargin?: number;
  lookupDictionary?: Record<string, string>; // Dynamic user-defined code-to-label map (no hardcoded ISO codes)
  failVerdict?: 'FAIL' | 'FLAG' | 'PAUSE';
}

export interface GroupedTransactionConfig {
  groupIdField: string;              // e.g. 'utrnno', 'rrn', 'parent_txn_id'
  eventPhaseField: string;           // e.g. 'event_type', 'action_code'
  eventPhaseMap: {
    originalValue: string;           // e.g. 'FINANCIAL_REQ', 'PURCHASE'
    reversalValue: string;           // e.g. 'REVERSAL', 'CHARGEBACK'
    refundValue?: string;
  };
  legIndicatorField: string;         // e.g. 'dr_cr_ind', 'entry_type'
  legIndicatorMap: {
    debitValue: string;              // e.g. 'D', 'DR', 'DEBIT'
    creditValue: string;             // e.g. 'C', 'CR', 'CREDIT'
    feeValue: string;                // e.g. 'F', 'FEE'
  };
}

export interface ReportColumnConfig {
  source: 'INPUT' | 'MIRROR' | 'COMPUTED';
  field: string;
  headerAlias: string;
}

export interface ReportStatusBinding {
  targetField: string;
  mappingRules: Array<{ whenVerdict: string; setStatusValue: string }>;
}

export type ValidationCheckType =
  | 'SQL_CONDITION'
  | 'FIELD_COMPARATOR'
  | 'REGEX_MATCH'
  | 'EXISTENCE_CHECK'
  | 'NUMERIC_THRESHOLD'
  | 'ISO_DECLINE_CODE'
  | 'AMOUNT_MATCH'
  | 'STATUS_MATCH'
  | 'CROSS_DB_LOOKUP'
  | 'DUAL_SOURCE_COMPARISON';

export interface ValidationCheckStep {
  id: string;
  stepNumber: number;
  name: string;
  description?: string;
  stageId?: string; // Linked business processing stage
  checkType: ValidationCheckType;
  targetDbId: string;
  targetTable: string; // Fallback or physical data source

  // Custom Criteria
  sqlCondition?: string;
  sourceField?: string;
  comparator?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'LIKE' | 'CONTAINS' | 'NOT_CONTAINS' | 'REGEX' | string;
  targetField?: string;
  compareValue?: string;
  toleranceMargin?: number;
  regexPattern?: string;

  // Condition Check Box fields
  canonicalField?: string;
  operator?: string;
  expectedValue?: string;
  tolerance?: number;
  actionOnSuccess?: string;
  actionOnFailure?: string;

  // Dual-Source Comparison
  dualSourceCondition?: DualSourceCondition;

  // Parameter Management
  requiredParams?: string[];
  optionalParams?: string[];
  searchParameters?: ValidationBoxSearchParam[];

  // Advanced Logic & Workflow Orchestration
  dependencyCondition: 'ALWAYS' | 'IF_PREV_SUCCESS' | 'IF_PREV_FAILURE' | 'IF_PREV_DATASET_NON_EMPTY';
  holdStateVariable?: string;

  // Pipeline Actions & Execution Routing
  onPassAction: 'CONTINUE' | 'CLOSE' | 'STOP' | 'REPORT';
  onFailAction: 'CONTINUE' | 'STOP' | 'CLOSE' | 'REPORT';
  onErrorAction: 'STOP' | 'CONTINUE';

  // Intermediate Reporting to Investigation Grid
  reportColumnName?: string;
  reportField?: string;

  // Filtering and Recursive Validation
  applyFilterOnPrevResult?: boolean;
  filterField?: string;
  filterOperator?: '=' | '!=' | '>' | '<' | 'CONTAINS';
  filterValue?: string;

  // Database Column Configurations & Table Rules
  columnConfigurationIds?: string[];
  columnConfigurations?: DatabaseColumnConfiguration[];

  // Output Configuration
  successMessage?: string;
  failureMessage?: string;
  severityOnFailure?: 'CRITICAL' | 'WARNING' | 'INFO';
}

export type FlowchartOutputAction = 'CONTINUE' | 'STOP' | 'REPORT';

export interface FlowchartNode {
  id: string;
  type: 'START' | 'VALIDATION_BOX' | 'RECONCILIATION' | 'DECISION' | 'REPORT' | 'END';
  boxId?: string;
  name: string;
  description?: string;
  category?: string;
  x: number;
  y: number;
  onPassAction: FlowchartOutputAction;
  onFailAction: FlowchartOutputAction;
  reportColumnName?: string;
  reportField?: string;
  targetDbId?: string;
  targetTable?: string;
  columnConfigurationIds?: string[];
  columnConfigurations?: DatabaseColumnConfiguration[];
}

export interface FlowchartConnection {
  id: string;
  fromNodeId: string;
  fromPort: 'pass' | 'fail' | 'output';
  toNodeId: string;
  action: FlowchartOutputAction;
  label?: string;
}

export interface WorkflowMessageAggregationRule {
  id: string;
  name: string;
  type: 'PASS' | 'FAIL';
  message: string;
  validationStepIds: string[];
  operator?: 'ALL' | 'ANY';
  severity?: 'CRITICAL' | 'WARNING' | 'RECONCILED';
}

export interface DatabaseValidationWorkflow {
  id: string;
  name: string;
  description?: string;
  targetDbId: string;
  targetTable: string;
  category?: 'Settlement' | 'Fulfillment' | 'Compliance' | 'Reconciliation' | 'Custom';
  stages: ProcessingStage[];
  steps: ValidationCheckStep[];
  nodes?: FlowchartNode[];
  connections?: FlowchartConnection[];
  globalSuccessMessage?: string;
  globalFailureMessage?: string;
  messageAggregations?: WorkflowMessageAggregationRule[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  isSystemDefault?: boolean;
  version?: string;
  teamId?: string;
  isPublic?: boolean;
  visibility?: 'team' | 'public' | 'private';
}

export interface RuleExecutionAuditEntry {
  transactionId: string;
  stageId?: string;
  stageName?: string;
  ruleId: string;
  ruleName: string;
  checkType: string;
  validationResult: ValidationResultStatus;
  pipelineAction: PipelineAction;
  executedAt: string;
  message: string;
  dataSnapshot?: Record<string, any>;
  errorDetail?: string;
  durationMs: number;
}

export interface TransactionExecutionSummary {
  transactionId: string;
  initialStatus: string;
  investigationStatus: TransactionInvestigationStatus;
  statusFlagText?: string;
  statusFlagColor?: 'emerald' | 'rose' | 'amber' | 'purple' | 'blue' | 'slate';
  auditTrail: RuleExecutionAuditEntry[];
  lastStageEvaluated?: string;
  lastRuleEvaluated?: string;
  isHalted: boolean;
  haltReason?: string;
  isClosed: boolean;
  hasTechnicalError: boolean;
  remedySql?: string;
}

// =============================================================================
// Query Extraction & Scalable Investigation Planning Models (Phases 7–15)
// =============================================================================

export interface QueryColumn {
  sourceColumn: string;
  alias?: string;
  dataType?: string;
  required: boolean;
  usedByRuleIds: string[];
}

export interface QueryKeyMapping {
  inputField: string;
  sourceField: string;
  required: boolean;
}

export interface QueryFilter {
  field: string;
  operator:
  | 'EQ'
  | 'NE'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'IN'
  | 'NOT_IN'
  | 'LIKE'
  | 'IS_NULL'
  | 'IS_NOT_NULL';
  value?: unknown;
}

export interface BatchPolicy {
  maxRowsPerBatch: number;
  maxQueryKeys: number;
  maxPayloadSizeMb?: number;
  maxExecutionTimeMs?: number;
}

export interface QueryExtraction {
  id: string;
  workflowId: string;
  stageId: string;
  targetDbId: string;
  targetDataSource: string;
  selectedColumns: QueryColumn[];
  keyMappings: QueryKeyMapping[];
  filters?: QueryFilter[];
  batchPolicy?: BatchPolicy;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface QueryChunkPlan {
  chunkId: string;
  sequence: number;
  transactionIds: string[];
}

export interface InvestigationBatchPlan {
  batchId: string;
  sequence: number;
  transactionIds: string[];
  queryChunks: QueryChunkPlan[];
}

export interface InvestigationStagePlan {
  stageId: string;
  stageName: string;
  targetDbId: string;
  targetDataSource: string;
  requiredColumns: string[];
  extractionId?: string;
}

export interface InvestigationExecutionPlan {
  id: string;
  workflowId: string;
  workflowName: string;
  transactionCount: number;
  stages: InvestigationStagePlan[];
  batches: InvestigationBatchPlan[];
  batchPolicy: BatchPolicy;
  createdAt: string;
}

export type InvestigationTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type InvestigationBatchStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING';

export interface InvestigationTask {
  id: string;
  workflowId: string;
  workflowName?: string;
  issueId?: string;
  teamTaskId?: string;
  totalTransactions: number;
  processedTransactions: number;
  reconciledTransactions: number;
  flaggedTransactions: number;
  closedTransactions: number;
  failedTransactions: number;
  status: InvestigationTaskStatus;
  executionPlan?: InvestigationExecutionPlan;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorDetail?: string;
}

export interface InvestigationBatch {
  id: string;
  taskId: string;
  sequence: number;
  transactionCount: number;
  processedCount: number;
  status: InvestigationBatchStatus;
  startedAt?: string;
  completedAt?: string;
  errorDetail?: string;
  retryCount?: number;
}

export interface InvestigationTransaction {
  id: string;
  taskId: string;
  batchId: string;
  transactionId: string;
  investigationStatus: TransactionInvestigationStatus;
  statusFlagText?: string;
  statusFlagColor?: string;
  currentStageId?: string;
  currentRuleId?: string;
  finalResult?: ValidationResultStatus;
  finalAction?: PipelineAction;
  auditTrail?: RuleExecutionAuditEntry[];
  updatedAt: string;
}

export interface ParentIssueAggregateStatus {
  issueStatus: 'OPEN' | 'IN_PROGRESS' | 'ACTION_REQUIRED' | 'RESOLVED' | 'CLOSED';
  reconciledCount: number;
  flaggedCount: number;
  closedCount: number;
  investigatingCount: number;
  pendingCount: number;
  totalTransactions: number;
  summaryText: string;
}

// ==========================================
// CENTRAL TRANSACTION REPOSITORY & VALIDATION BOXES
// ==========================================

export interface CentralTransactionRecord {
  transactionKey: string;
  originalTaskId: string;
  currentTaskId: string;
  allTaskIds: string[];
  batchId: string;
  rowNumber?: number;
  status: 'INGESTED' | 'BATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'FLAGGED' | 'DUPLICATE';
  isDuplicate: boolean;
  duplicateFromTaskId?: string;
  duplicateCount?: number;
  duplicateStatus?: string;
  workflowIds: string[];
  canonicalData: Record<string, any>;
  rawData?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export type ValidationBoxType = 'INGESTION_SEARCH' | 'CONDITION_CHECK' | 'RECONCILIATION' | 'REPORT';

export interface ValidationBoxSearchParam {
  inputField: string;
  targetColumn: string;
  required: boolean;
}

export interface ValidationBox {
  id: string;
  name: string;
  description?: string;
  boxType: ValidationBoxType;
  category?: string;
  targetDbId?: string;
  targetTable?: string;
  mirrorTableName?: string;
  searchParameters?: ValidationBoxSearchParam[];
  checkStep?: ValidationCheckStep;

  // Database Column Configurations & Table Rules
  columnConfigurationIds?: string[];
  columnConfigurations?: DatabaseColumnConfiguration[];

  // Standalone Reconciliation configuration
  matchKeyInput?: string;
  matchKeyExternal?: string;
  multiRowPolicy?: 'LATEST' | 'EARLIEST' | 'AGGREGATE_SUM' | 'COMPOSITE_BUNDLE' | 'STRICT_SINGLE';
  groupConfig?: GroupedTransactionConfig;

  // Dual-Source Condition configuration
  dualSourceCondition?: DualSourceCondition;

  // Standalone Report configuration
  outputColumns?: ReportColumnConfig[];
  statusBinding?: ReportStatusBinding;
  messageTemplate?: string;

  createdAt?: string;
  updatedAt?: string;
  teamId?: string;
  isPublic?: boolean;
  visibility?: 'team' | 'public' | 'private';
}

// ==========================================
// GLOBAL MAPPING SCHEMA & TABLE MAPPING ENFORCEMENT
// ==========================================

export interface GlobalTransactionSchemaField {
  id?: string;
  key: string;
  label: string;
  description: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  isStandard?: boolean;
  exampleValue?: string | any;
  category?: string;
  notes?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbColumnMappingItem {
  globalKey: string;
  physicalColumn: string;
  dataTypeOverride?: string;
  notes?: string;
}

export interface DbTableMappingConfig {
  dbId: string;
  dbName: string;
  tableName: string;
  columns: DbColumnMappingItem[];
  updatedAt?: string;
  isCustom?: boolean;
}

export interface SchemaVersionEntry {
  version: string;
  timestamp: string;
  author: string;
  description?: string;
  fieldCount: number;
}

export interface GlobalMappingConfig {
  version: string;
  updatedAt: string;
  updatedBy: string;
  standardFields: GlobalTransactionSchemaField[];
  tableMappings: Record<string, DbTableMappingConfig>;
  versionHistory?: SchemaVersionEntry[];
  strictMappingEnforced?: boolean;
}

export interface TableMappingValidationStatus {
  dbId: string;
  tableName: string;
  isMapped: boolean;
  missingRequiredKeys: string[];
  mappedColumnsCount: number;
  requiredColumnsCount: number;
  status: 'COMPLETE' | 'INCOMPLETE' | 'UNMAPPED';
}


export interface TaskWorkflowExecution {
  id?: number;
  taskId: string;
  workflowId: string;
  workflowName?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  totalRecords: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  executionSummary?: any;
  executedAt?: string;
  executedBy?: string;
}

// =============================================================================
// DATABASE COLUMN CONFIGURATIONS & RULES
// =============================================================================

export type DatabaseColumnRuleType =
  | 'DUPLICATE_CHECK'
  | 'GROUPING_CHECK'
  | 'UNIQUE_CONSTRAINT'
  | 'COMPLETENESS_CHECK'
  | 'VALUE_RANGE_CHECK'
  | 'PATTERN_CHECK'
  | 'MULTI_ROW_SEMANTIC_CHECK'
  | 'TYPE_RELATION_CHECK'
  | 'VALUE_LABEL_CHECK'
  | 'CUSTOM_LOGIC';

export interface ColumnValueLabelMapping {
  value: string; // Constant value in the column
  label: string; // Meaning/label specified by the user for this constant value
  description?: string; // Additional context or business explanation
  category?: 'VALID' | 'WARNING' | 'ERROR' | 'INFO'; // Classification of this value
  color?: string; // Optional badge color
  columnName?: string;
  constantValue?: string;
  severity?: string;
}

export interface TypeColumnCondition {
  columnName: string;
  operator: '=' | '!=' | 'IN' | 'NOT_IN' | 'LIKE' | 'STARTS_WITH';
  value: string;
}

export interface TransactionTypeGroupConfig {
  id: string;
  groupName: string; // e.g. "Card Purchase", "ATM Cash Withdrawal", "Reversal", "Fee"
  description?: string;
  conditions: TypeColumnCondition[]; // Single or multiple column conditions to classify rows into this type
  expectedLegCount?: { operator: '==' | '>=' | '<=' | '!=' | '>'; value: number };
  roles?: SemanticRowRoleConfig[]; // Leg roles specific to this transaction type
  legRelationships?: SemanticCrossRowRule[]; // Leg relationships specific to this transaction type
  aggregationRules?: RuleAggregation[]; // Grouping aggregations specific to this transaction type
}

export interface RuleColumnPriority {
  columnName: string;
  priority: number; // 1 = Primary key/criterion, 2 = Secondary, etc.
  role?: 'MATCH_KEY' | 'DISCRIMINATOR' | 'AGGREGATE_TARGET' | 'TIE_BREAKER' | string;
  matchMode?: 'EXACT' | 'CASE_INSENSITIVE' | 'TRIMMED';
  transform?: 'NONE' | 'LOWERCASE' | 'UPPERCASE' | 'DIGITS_ONLY';
  minValue?: number;
  maxValue?: number;
  pattern?: string;
}

export interface RuleAggregation {
  function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  column?: string;
  operator: '>' | '>=' | '=' | '!=' | '<' | '<=';
  value: any;
}

export interface SemanticRowRoleConfig {
  roleName: string; // e.g. "Original", "Debit", "Credit", "Reversal", "Decline", "Fee"
  matchValues: string[]; // e.g. ["200", "PURCHASE"] or ["D"]
  matchMode?: 'EXACT' | 'CASE_INSENSITIVE' | 'IN_LIST';
  expectedCount?: { operator: '==' | '>=' | '<=' | '>' | '<'; value: number };
  color?: string;
}

export interface SemanticCrossRowRule {
  id?: string;
  ruleType: 'ROLE_EXISTENCE' | 'VALUE_MATCH' | 'NET_BALANCE' | 'MUTUAL_EXCLUSION';
  primaryRole: string; // e.g. "Debit"
  targetRole?: string; // e.g. "Credit"
  valueColumn?: string; // e.g. "amount"
  targetValueColumn?: string; // e.g. "amount"
  tolerance?: number;
  conditionDescription?: string;
  description?: string;
}

export interface DatabaseColumnConfiguration {
  id: string;
  name: string;
  dbId: string;
  dbName?: string;
  tableName: string;
  ruleType: DatabaseColumnRuleType;
  description?: string;
  columns: RuleColumnPriority[];
  groupByColumns?: string[];
  aggregationRules?: RuleAggregation[];
  // Semantic multi-row transaction interpretation & leg relations
  primaryKeyColumn?: string; // The primary correlation column shared across all rows/legs of the transaction
  roleColumn?: string; // The discriminator column providing row meaning/business role
  semanticRoles?: SemanticRowRoleConfig[]; // Definitions of roles and their matching values
  crossRowRules?: SemanticCrossRowRule[]; // Rules across interpreted roles
  // Type Group classification based on single or multiple columns
  typeGroups?: TransactionTypeGroupConfig[]; // Transaction Type Groups (multi-column classified)
  typeGroupColumns?: string[]; // Columns used to identify type groups
  // Value constant labeling and interpretation
  valueLabels?: ColumnValueLabelMapping[]; // User labels and interpretation when column value equals a constant
  unmappedValueAction?: 'FLAG' | 'ALLOW' | 'IGNORE'; // How to handle values without a defined label
  violationAction: 'FLAG' | 'STOP' | 'CONTINUE' | 'REPORT';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  violationMessage?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResolutionApprovalRequest {
  id: string;
  taskId: string;
  transactionId: string;
  teamId: string;
  makerId: string;
  makerName: string;
  proposedAction: 'FORCE_MATCH' | 'WRITE_OFF' | 'MANUAL_REVERSAL' | 'OVERRIDE_VERDICT' | string;
  proposedStatus: 'VERIFIED_MATCH' | 'RECONCILED' | string;
  justificationNote: string;
  evidenceSnapshot: Record<string, any>;
  checkerId?: string;
  checkerName?: string;
  rejectionReason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt?: string;
}

export interface CrossFunctionalProjectGroup {
  id: string;
  name: string;
  description?: string;
  strategicObjectiveId?: string;
  memberUserIds: string[];
  createdBy: string;
  createdAt: string;
}

export interface TeamDashboardVisibilityGrant {
  id: string;
  grantorTeamId: string;
  granteeTeamId: string;
  accessLevel: 'FULL' | 'PARTIAL_KPI';
  grantedBy: string;
  createdAt: string;
}

export interface AIStrategicObjective {
  id: string;
  title: string;
  description?: string;
  targetMetric?: string;
  targetValue?: number;
  currentValue?: number;
  linkedHashtags?: string[];
  assignedTeamIds?: string[];
  createdAt: string;
}

// ==========================================
// WORKSPACE SETTING PROPOSALS (MAKER-CHECKER & ESCALATION)
// ==========================================

export type SettingProposalType = 
  | 'WORKSPACE_CONFIG' 
  | 'TABLE_MAPPING' 
  | 'COLUMN_CONFIG' 
  | 'VALIDATION_BOX' 
  | 'WORKFLOW';

export type SettingProposalStatus = 
  | 'PENDING_TEAM_APPROVAL' 
  | 'ESCALATED_TO_TARGET_TEAM' 
  | 'APPROVED' 
  | 'REJECTED';

export interface WorkspaceSettingProposal {
  id: string;
  settingType: SettingProposalType;
  settingKey: string;
  title: string;
  proposedChanges: Record<string, any>;
  currentSnapshot?: Record<string, any>;
  justification: string;
  makerId: string;
  makerName: string;
  teamId: string;
  teamName?: string;
  status: SettingProposalStatus;
  checkerId?: string;
  checkerName?: string;
  checkerFeedback?: string;
  escalatedTeamId?: string;
  escalatedTeamName?: string;
  escalationReason?: string;
  escalatedById?: string;
  escalatedByName?: string;
  escalatedAt?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// COMPOSITE WORKFLOW BUNDLES (OPERATIONAL GOVERNANCE)
// ==========================================

export type WorkflowBundleScope = 'PERSONAL' | 'TEAM' | 'GLOBAL_ENTERPRISE';

export type WorkflowBundleStatus = 
  | 'DRAFT' 
  | 'PENDING_CHECKER_REVIEW' 
  | 'APPROVED' 
  | 'REJECTED';

export interface WorkflowBundle {
  id: string;
  bundleCode: string;
  name: string;
  description?: string;
  version: string;
  scope: WorkflowBundleScope;
  workflowId: string;
  workflowName?: string;
  validationBoxIds: string[];
  dbCheckIds: string[];
  sourceTeamId: string;
  sourceTeamName?: string;
  status: WorkflowBundleStatus;
  makerId: string;
  makerName: string;
  checkerId?: string;
  checkerName?: string;
  checkerFeedback?: string;
  evidenceSnapshot?: Record<string, any>;
  hashtagBindings?: string[];
  createdAt: string;
  approvedAt?: string;
  updatedAt: string;
}



