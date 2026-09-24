/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportedMessageChannel = 'email' | 'teams' | 'whatsapp' | 'telegram';

export type MessageSenderType = 'person' | 'team' | 'bot' | 'system';

export type MessageIntent =
  | 'REQUEST_CREATE_TASK'
  | 'REQUEST_STATUS_UPDATE'
  | 'FOLLOW_UP'
  | 'TEAM_ESCALATION'
  | 'PERSONAL_RESPONSE'
  | 'APPROVAL_REQUEST'
  | 'ATTACHMENT_TASK'
  | 'DATA_INPUT_TASK'
  | 'SYSTEM_NOTIFICATION';

export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

export type MessageAttachmentContentType =
  | 'document'
  | 'image'
  | 'spreadsheet'
  | 'pdf'
  | 'audio'
  | 'other';

export interface MessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath?: string;
  checksum?: string;
  contentType: MessageAttachmentContentType;
  ingestionStatus?: 'NONE' | 'INGESTED' | 'PENDING_MAPPING' | 'FAILED';
  rawBase64?: string;
}

export interface MessageEnvelope {
  messageId: string;
  sourceChannel: SupportedMessageChannel;
  sourceMessageId: string;
  conversationId?: string;
  threadId?: string;
  senderAddress: string;
  senderName?: string;
  senderType: MessageSenderType;
  teamId?: string;
  personId?: string;
  receivedAt: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, any>;
  intent?: MessageIntent;
  priority?: MessagePriority;
  rawPayload?: Record<string, any>;
  dedupeKey: string;
}

export interface TeamChannelConfiguration {
  id: string;
  teamId: string;
  channel: SupportedMessageChannel;
  displayName: string;
  address: string; // team inbox, group id, channel id, alias
  isPrimary: boolean;
  isActive: boolean;
  webhookSecret?: string;
  permissions: Array<'read' | 'reply' | 'create_task' | 'escalate'>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalChannelConfiguration {
  id: string;
  userId: string;
  channel: SupportedMessageChannel;
  displayName: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
  notificationMode: 'all' | 'critical_only' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface OutboundMessage {
  id?: string;
  to: string;
  channel: SupportedMessageChannel;
  subject?: string;
  body: string;
  linkedIssueId?: string;
  linkedMessageId?: string;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface TaskCreationPayload {
  sourceChannel: SupportedMessageChannel;
  sourceMessageId: string;
  requesterId?: string;
  teamId?: string;
  issueTitle: string;
  taskType?: string;
  description?: string;
  extractedFields?: Record<string, any>;
  attachments?: MessageAttachment[];
  priority?: MessagePriority;
  workflowTemplate?: string;
  evidenceRefs?: string[];
}

export type StagedMessageStatus =
  | 'NEW'
  | 'STAGED'
  | 'ATTACHMENT_PENDING'
  | 'PARSE_FAILED'
  | 'READY_FOR_TASK_CREATION'
  | 'REJECTED'
  | 'APPROVED'
  | 'CONVERTED_TO_TASK'
  | 'ESCALATED'
  | 'FAILED';

export interface ProviderConnection {
  id: string;
  teamId?: string;
  userId?: string;
  channel: SupportedMessageChannel;
  displayName: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISABLED';
  config: Record<string, any>;
  lastFetchAt?: string;
  lastError?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderFetchJob {
  id: string;
  providerId: string;
  channel: SupportedMessageChannel;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  messagesFound: number;
  messagesStaged: number;
  errorTrace?: string;
  startedAt: string;
  completedAt?: string;
}

export interface StagedMessageAttachment {
  id: string;
  stagedMessageId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentType: MessageAttachmentContentType;
  storagePath?: string;
  parsedText?: string;
  parsedData?: Record<string, any>;
  parsingStatus: 'PENDING' | 'PARSED' | 'FAILED' | 'SKIPPED';
  parsingError?: string;
  createdAt: string;
}

export interface StagedMessage {
  id: string;
  channel: SupportedMessageChannel;
  sourceMessageId: string;
  conversationId?: string;
  threadId?: string;
  senderAddress: string;
  senderName?: string;
  teamId?: string;
  assignedUserId?: string;
  subject?: string;
  textBody?: string;
  rawPayload?: Record<string, any>;
  dedupeKey: string;
  status: StagedMessageStatus;
  urgency: MessagePriority;
  category: string;
  confidenceScore: number;
  parsedFields: Record<string, any>;
  linkedIssueId?: string;
  createdIssueId?: string;
  makerId?: string;
  checkerId?: string;
  reviewNotes?: string;
  slaDueAt?: string;
  createdAt: string;
  updatedAt: string;
  attachments?: StagedMessageAttachment[];
}

export interface ExternalRequestSummary {
  totalInbound: number;
  pendingTriage: number;
  readyForTaskCreation: number;
  convertedToTask: number;
  escalatedCount: number;
  slaBreachCount: number;
  activeProviders: number;
  channelBreakdown: Record<SupportedMessageChannel, number>;
}
