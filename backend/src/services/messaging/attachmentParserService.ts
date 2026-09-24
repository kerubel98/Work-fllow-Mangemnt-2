/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { 
  MessageAttachment, 
  MessagePriority, 
  MessageAttachmentContentType 
} from '../../models/messageTypes.js';
import { cleanAmount } from '../dataSanitizerService.js';
import { parseDelimitedLine } from '../ftpFileStagingService.js';

export interface ParsedAttachmentResult {
  attachmentId: string;
  filename: string;
  mimeType: string;
  contentType: MessageAttachmentContentType;
  storagePath?: string;
  parsedText?: string;
  parsedData?: Record<string, any>;
  tabularHeaders?: string[];
  tabularRows?: Record<string, any>[];
  parsingStatus: 'PARSED' | 'FAILED' | 'SKIPPED';
  parsingError?: string;
}

export interface ExtractedRequestPayload {
  category: string;
  urgency: MessagePriority;
  confidenceScore: number;
  parsedFields: {
    requesterName?: string;
    requesterEmail?: string;
    customerAccount?: string;
    caseReference?: string;
    amount?: number;
    currency?: string;
    slaHours?: number;
    suggestedTaskTitle?: string;
    suggestedTeamId?: string;
    customFields?: Record<string, any>;
  };
  attachments: ParsedAttachmentResult[];
}

export class AttachmentParserService {
  /**
   * Main entrypoint to parse an array of message attachments and extract
   * structured business fields, tabular transaction sets, and metadata.
   */
  async parseAttachments(
    attachments: MessageAttachment[] = [],
    messageTextBody: string = '',
    messageSubject: string = ''
  ): Promise<ExtractedRequestPayload> {
    const results: ParsedAttachmentResult[] = [];
    const combinedTextParts: string[] = [messageSubject, messageTextBody];

    let extractedTabularRows: Record<string, any>[] = [];
    let detectedHeaders: string[] = [];

    for (const att of attachments) {
      try {
        const parsed = this.parseSingleAttachment(att);
        results.push(parsed);

        if (parsed.parsedText) {
          combinedTextParts.push(parsed.parsedText);
        }
        if (parsed.tabularRows && parsed.tabularRows.length > 0) {
          extractedTabularRows = extractedTabularRows.concat(parsed.tabularRows);
        }
        if (parsed.tabularHeaders && parsed.tabularHeaders.length > 0) {
          detectedHeaders = Array.from(new Set([...detectedHeaders, ...parsed.tabularHeaders]));
        }
      } catch (err: any) {
        results.push({
          attachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          contentType: att.contentType,
          storagePath: att.storagePath,
          parsingStatus: 'FAILED',
          parsingError: err.message
        });
      }
    }

    const fullExtractedText = combinedTextParts.join('\n');
    const { category, urgency, parsedFields, confidenceScore } = this.extractFieldsFromCorpus(
      fullExtractedText,
      messageSubject,
      attachments.length,
      extractedTabularRows.length
    );

    if (detectedHeaders.length > 0) {
      parsedFields.customFields = {
        ...parsedFields.customFields,
        detectedHeaders,
        extractedRowCount: extractedTabularRows.length
      };
    }

    return {
      category,
      urgency,
      confidenceScore,
      parsedFields,
      attachments: results
    };
  }

  /**
   * Inspects and parses individual file content.
   */
  private parseSingleAttachment(att: MessageAttachment): ParsedAttachmentResult {
    const filename = (att.filename || '').toLowerCase();
    const isSpreadsheet = att.contentType === 'spreadsheet' || filename.endsWith('.csv') || filename.endsWith('.xlsx') || filename.endsWith('.xls');

    // 1. Spreadsheet (CSV / Excel)
    if (isSpreadsheet) {
      if (att.rawBase64) {
        const buffer = Buffer.from(att.rawBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

        const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

        return {
          attachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          contentType: 'spreadsheet',
          storagePath: att.storagePath,
          tabularHeaders: headers,
          tabularRows: jsonData.slice(0, 500), // First 500 rows for preview/staging
          parsedText: `Spreadsheet "${att.filename}": ${jsonData.length} records found across columns [${headers.join(', ')}].`,
          parsedData: {
            sheetNames: workbook.SheetNames,
            activeSheet: sheetName,
            totalRows: jsonData.length,
            sampleHeaders: headers
          },
          parsingStatus: 'PARSED'
        };
      } else if (filename.endsWith('.csv') && att.storagePath) {
        return {
          attachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          contentType: 'spreadsheet',
          storagePath: att.storagePath,
          parsedText: `CSV file "${att.filename}" referenced at ${att.storagePath}. Ready for streaming mapper.`,
          parsingStatus: 'PARSED',
          parsedData: { format: 'CSV', path: att.storagePath }
        };
      }
    }

    // 2. Text / Logs / JSON
    if (filename.endsWith('.txt') || filename.endsWith('.json') || filename.endsWith('.log')) {
      let rawText = '';
      if (att.rawBase64) {
        rawText = Buffer.from(att.rawBase64, 'base64').toString('utf-8');
      }

      let parsedData: any = {};
      if (filename.endsWith('.json') && rawText) {
        try {
          parsedData = JSON.parse(rawText);
        } catch {
          // ignore json parse error
        }
      }

      return {
        attachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        contentType: 'document',
        storagePath: att.storagePath,
        parsedText: rawText ? rawText.substring(0, 4000) : `Text file "${att.filename}"`,
        parsedData,
        parsingStatus: 'PARSED'
      };
    }

    // 3. PDF / Document / OCR Placeholder
    return {
      attachmentId: att.id,
      filename: att.filename,
      mimeType: att.mimeType,
      contentType: att.contentType,
      storagePath: att.storagePath,
      parsedText: `Document attachment "${att.filename}" (${att.contentType}). Registered in secure staging vault.`,
      parsingStatus: 'PARSED'
    };
  }

  /**
   * Extracts canonical business entities from message text and attachments.
   */
  private extractFieldsFromCorpus(
    text: string,
    subject: string,
    attachmentCount: number,
    rowCount: number
  ): {
    category: string;
    urgency: MessagePriority;
    confidenceScore: number;
    parsedFields: ExtractedRequestPayload['parsedFields'];
  } {
    const lower = text.toLowerCase();
    let score = 0.5;

    // 1. Urgency Detection
    let urgency: MessagePriority = 'normal';
    if (lower.includes('critical') || lower.includes('urgent') || lower.includes('asap') || lower.includes('escalate immediately') || lower.includes('sla breach')) {
      urgency = 'critical';
      score += 0.15;
    } else if (lower.includes('high priority') || lower.includes('dispute') || lower.includes('mismatch')) {
      urgency = 'high';
      score += 0.1;
    }

    // 2. Category Detection
    let category = 'GENERAL_INQUIRY';
    let suggestedTeamId = 'team-settlement-01';

    if (lower.includes('chargeback') || lower.includes('dispute') || lower.includes('card fraud')) {
      category = 'CHARGEBACK_DISPUTE';
      suggestedTeamId = 'team-cards-01';
      score += 0.15;
    } else if (lower.includes('reconciliation') || lower.includes('settlement exception') || rowCount > 0 || lower.includes('clearing')) {
      category = 'RECONCILIATION_EXCEPTION';
      suggestedTeamId = 'team-settlement-01';
      score += 0.15;
    } else if (lower.includes('payment failure') || lower.includes('gateway timeout') || lower.includes('declined')) {
      category = 'PAYMENT_FAILURE';
      suggestedTeamId = 'team-core-switch';
      score += 0.1;
    } else if (lower.includes('audit') || lower.includes('compliance')) {
      category = 'AUDIT_REQUEST';
      suggestedTeamId = 'team-audit-01';
      score += 0.1;
    }

    // 3. Entity Extraction via Regex
    const parsedFields: ExtractedRequestPayload['parsedFields'] = {};

    // Case / Claim Reference (e.g. #ISS-105, CASE-9281, DISP-1029, RRN: 1029482910)
    const caseMatch = text.match(/(#?(?:ISS|CASE|DISP|CLAIM|REF|RRN)[-_]?[0-9a-zA-Z]{3,24})/i);
    if (caseMatch) {
      parsedFields.caseReference = caseMatch[1].toUpperCase();
      score += 0.1;
    }

    // Customer Account / ID (e.g. ACC-192839, Account: 10928391, CUST-827)
    const accMatch = text.match(/(?:ACC(?:OUNT)?|CUST(?:OMER)?|IBAN)[#:\s]*([a-zA-Z0-9-]{6,26})/i);
    if (accMatch) {
      parsedFields.customerAccount = accMatch[1].trim();
      score += 0.1;
    }

    // Amount & Currency (e.g. $1,250.00, 4,500.50 USD, EUR 320)
    const amountMatch = text.match(/(?:[\$€£¥₹]\s*([0-9,]+\.?[0-9]*)|([0-9,]+\.?[0-9]*)\s*(?:USD|EUR|GBP|KES|ETB|NGN))/i);
    if (amountMatch) {
      const rawNum = amountMatch[1] || amountMatch[2];
      const parsedNum = cleanAmount(rawNum);
      if (parsedNum !== null) {
        parsedFields.amount = parsedNum;
        parsedFields.currency = text.includes('EUR') || text.includes('€') ? 'EUR' : (text.includes('GBP') || text.includes('£') ? 'GBP' : 'USD');
        score += 0.1;
      }
    }

    // Suggested SLA (hours)
    parsedFields.slaHours = urgency === 'critical' ? 4 : (urgency === 'high' ? 12 : 48);

    // Suggested Task Title
    parsedFields.suggestedTaskTitle = subject ? `${category.replace(/_/g, ' ')}: ${subject}`.substring(0, 100) : `External ${category.replace(/_/g, ' ')}`;
    parsedFields.suggestedTeamId = suggestedTeamId;

    return {
      category,
      urgency,
      confidenceScore: Math.min(1.0, Math.round(score * 100) / 100),
      parsedFields
    };
  }
}

export const attachmentParserService = new AttachmentParserService();
