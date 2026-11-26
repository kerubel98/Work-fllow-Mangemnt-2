import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { applyTransformationRule } from '../valueDictionaryService.js';
import { recipeExecutionService } from '../recipeExecutionService.js';
import { dataSanitizerService } from '../dataSanitizerService.js';
import { miscRouter } from '../../routes/misc.js';
import { postgresRepo as repo } from '../../store/postgresRepo.js';

describe('Mapping & Ingestion Remediation (AUD-MAP-001..005)', () => {
  describe('AUD-MAP-002: valueDictionaryService & recipeExecutionService Transformation Rule Parity', () => {
    it('correctly applies NUMBER_CLEAN formatting amounts to 2 decimal places across both services', () => {
      // valueDictionaryService (applyTransformationRule: rule, value)
      expect(applyTransformationRule('NUMBER_CLEAN', '1250.5')).toBe('1250.50');
      expect(applyTransformationRule('NUMBER_CLEAN', '$1,250.50 ETB')).toBe('1250.50');
      expect(applyTransformationRule('NUMBER_CLEAN', 'invalid_str')).toBe('invalid_str');

      // recipeExecutionService (applySingleTransform: value, ruleType)
      expect(recipeExecutionService.applySingleTransform('1250.5', 'NUMBER_CLEAN')).toBe('1250.50');
      expect(recipeExecutionService.applySingleTransform('$1,250.50 ETB', 'NUMBER_CLEAN')).toBe('1250.50');
      expect(recipeExecutionService.applySingleTransform('invalid_str', 'NUMBER_CLEAN')).toBe('invalid_str');
    });

    it('correctly applies ROUND_INT rounding amounts to nearest integer string across both services', () => {
      // valueDictionaryService (applyTransformationRule: rule, value)
      expect(applyTransformationRule('ROUND_INT', '1250.49')).toBe('1250');
      expect(applyTransformationRule('ROUND_INT', '1250.50')).toBe('1251');
      expect(applyTransformationRule('ROUND_INT', 'invalid_str')).toBe('invalid_str');

      // recipeExecutionService (applySingleTransform: value, ruleType)
      expect(recipeExecutionService.applySingleTransform('1250.49', 'ROUND_INT')).toBe('1250');
      expect(recipeExecutionService.applySingleTransform('1250.50', 'ROUND_INT')).toBe('1251');
      expect(recipeExecutionService.applySingleTransform('invalid_str', 'ROUND_INT')).toBe('invalid_str');
    });
  });

  describe('AUD-MAP-004: dataSanitizerService autoMapHeaders Collision & Priority Guards', () => {
    it('prevents Ref_Date from being hijacked by refnum and maps it to date/time', async () => {
      const mockStandardFields = [
        { id: '1', key: 'refnum', label: 'Reference Number', dataType: 'string', required: true, isStandard: true, category: 'Identification' },
        { id: '2', key: 'ttime', label: 'Transaction Time', dataType: 'date', required: true, isStandard: true, category: 'Audit' },
        { id: '3', key: 'reqamt', label: 'Requested Amount', dataType: 'number', required: true, isStandard: true, category: 'Financial' }
      ];

      const rawHeaders = ['Txn_Reference', 'Ref_Date', 'Amount_ETB'];
      const mapping = await dataSanitizerService.autoMapHeaders(rawHeaders, mockStandardFields as any);

      expect(mapping['Txn_Reference']).toBe('refnum');
      expect(mapping['Ref_Date']).toBe('ttime');
      expect(mapping['Amount_ETB']).toBe('reqamt');
    });

    it('guarantees unique target key assignment when multiple headers match similar synonyms', async () => {
      const mockStandardFields = [
        { id: '1', key: 'refnum', label: 'Reference Number', dataType: 'string', required: true, isStandard: true, category: 'Identification' },
        { id: '2', key: 'transaction_id', label: 'Transaction ID', dataType: 'string', required: false, isStandard: true, category: 'Identification' },
        { id: '3', key: 'reqamt', label: 'Requested Amount', dataType: 'number', required: true, isStandard: true, category: 'Financial' },
        { id: '4', key: 'amount', label: 'Amount', dataType: 'number', required: false, isStandard: true, category: 'Financial' }
      ];

      // Two reference-like columns and two amount-like columns
      const rawHeaders = ['Reference_No', 'Txn_Ref_Secondary', 'Tran_Amt', 'Fee_Amount'];
      const mapping = await dataSanitizerService.autoMapHeaders(rawHeaders, mockStandardFields as any);

      const mappedTargets = Object.values(mapping);
      const uniqueTargets = new Set(mappedTargets);

      // Every assigned target key must be distinct (zero collisions)
      expect(mappedTargets.length).toBe(uniqueTargets.size);
      expect(mapping['Reference_No']).toBe('refnum');
      expect(mapping['Txn_Ref_Secondary']).toBe('transaction_id');
      expect(mapping['Tran_Amt']).toBe('reqamt');
      expect(mapping['Fee_Amount']).toBe('amount');
    });

    it('prioritizes exact column key and label matches over substring heuristics', async () => {
      const mockStandardFields = [
        { id: '1', key: 'refnum', label: 'Reference Number', dataType: 'string', required: true, isStandard: true, category: 'Identification' },
        { id: '2', key: 'terminal_id', label: 'Terminal ID', dataType: 'string', required: true, isStandard: true, category: 'Terminal' }
      ];

      const rawHeaders = ['Terminal ID', 'RefNum'];
      const mapping = await dataSanitizerService.autoMapHeaders(rawHeaders, mockStandardFields as any);

      expect(mapping['Terminal ID']).toBe('terminal_id');
      expect(mapping['RefNum']).toBe('refnum');
    });
  });

  describe('AUD-MAP-005: File Ingestion Mapping Templates Route Authorization', () => {
    let server: Server;
    let baseUrl: string;
    let mockUser: any;

    beforeAll(async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as any).user = mockUser;
        next();
      });
      app.use('/api', miscRouter);

      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('POST /api/file-mapping-templates returns 400 if name is missing', async () => {
      mockUser = { id: 'usr-1', role: 'admin' };
      const res = await fetch(`${baseUrl}/api/file-mapping-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Template without name' })
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toMatch(/Template name is required/i);
    });

    it('POST /api/file-mapping-templates rejects non-admin updating another team template with 403', async () => {
      mockUser = { id: 'usr-2', role: 'operator', teamId: 'team-alpha' };

      vi.spyOn(repo, 'getFileMappingTemplateById').mockResolvedValueOnce({
        id: 'tpl-beta-1',
        name: 'Beta Settlement Template',
        teamId: 'team-beta'
      } as any);

      const res = await fetch(`${baseUrl}/api/file-mapping-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'tpl-beta-1', name: 'Tampered Template Name' })
      });

      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.error).toMatch(/Access denied/i);
    });

    it('DELETE /api/file-mapping-templates/:id returns 404 for nonexistent template', async () => {
      mockUser = { id: 'usr-1', role: 'admin' };
      vi.spyOn(repo, 'getFileMappingTemplateById').mockResolvedValueOnce(null as any);

      const res = await fetch(`${baseUrl}/api/file-mapping-templates/nonexistent-id`, {
        method: 'DELETE'
      });
      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.error).toMatch(/not found/i);
    });

    it('DELETE /api/file-mapping-templates/:id rejects non-admin deleting another team template with 403', async () => {
      mockUser = { id: 'usr-3', role: 'analyst', teamId: 'team-gamma' };

      vi.spyOn(repo, 'getFileMappingTemplateById').mockResolvedValueOnce({
        id: 'tpl-delta-1',
        name: 'Delta Template',
        teamId: 'team-delta'
      } as any);

      const res = await fetch(`${baseUrl}/api/file-mapping-templates/tpl-delta-1`, {
        method: 'DELETE'
      });
      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.error).toMatch(/Access denied/i);
    });

    it('DELETE /api/file-mapping-templates/:id allows admin to delete any template', async () => {
      mockUser = { id: 'admin-1', role: 'admin' };

      vi.spyOn(repo, 'getFileMappingTemplateById').mockResolvedValueOnce({
        id: 'tpl-delta-1',
        name: 'Delta Template',
        teamId: 'team-delta'
      } as any);
      vi.spyOn(repo, 'deleteFileMappingTemplate').mockResolvedValueOnce(true);

      const res = await fetch(`${baseUrl}/api/file-mapping-templates/tpl-delta-1`, {
        method: 'DELETE'
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });

    it('GET /api/file-mapping-templates filters non-admin callers by caller teamId', async () => {
      mockUser = { id: 'usr-4', role: 'operator', teamId: 'team-finance' };
      const getSpy = vi.spyOn(repo, 'getFileMappingTemplates').mockResolvedValueOnce([]);

      const res = await fetch(`${baseUrl}/api/file-mapping-templates`);
      expect(res.status).toBe(200);
      expect(getSpy).toHaveBeenCalledWith('team-finance');
    });
  });
});
