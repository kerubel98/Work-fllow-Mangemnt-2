import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { escalationsRouter } from '../../routes/escalations.js';
import { sandboxRouter } from '../../routes/sandbox.js';
import { postgresRepo } from '../../store/postgresRepo.js';
import { sandboxExecutionService } from '../sandboxExecutionService.js';
import { investigationOrchestratorService } from '../investigationOrchestratorService.js';

describe('Sandbox & Escalations Audit Remediation (AUD-SBX-001 & AUD-SBX-002)', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let mockUser: any = null;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req: Request, _res: Response, next) => {
      if (mockUser) {
        (req as any).user = mockUser;
      }
      next();
    });

    app.use('/api/escalations', escalationsRouter);
    app.use('/api/sandbox', sandboxRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    mockUser = null;
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
  });

  // ==================== AUD-SBX-001 TESTS ====================
  describe('AUD-SBX-001: Escalation State Transitions, Actor Checks & Team Scoping', () => {
    it('1a. sign-escalating rejects state transition if agreement is not in AWAITING_ESCALATING_SIGNATURE', async () => {
      const mockAgreement = {
        id: 'esc-test-1',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'ACTIVE', // Invalid state for signing
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'user-esc-lead', teamId: 'team-esc', role: 'lead' };
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-1/sign-escalating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: 'user-esc-lead', signature: 'LeadEsc', checkerId: 'checker-1' })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Invalid state transition');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });

    it('1b. sign-escalating enforces team membership: rejects cross-team user with 403', async () => {
      const mockAgreement = {
        id: 'esc-test-2',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'AWAITING_ESCALATING_SIGNATURE',
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'intruder-user', teamId: 'team-other', role: 'lead' };
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-2/sign-escalating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: 'intruder-user', signature: 'Intruder', checkerId: 'checker-1' })
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain('Forbidden');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });

    it('1c. sign-escalating enforces Anti-Self-Approval: lead cannot assign themselves as checker', async () => {
      const mockAgreement = {
        id: 'esc-test-3',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'AWAITING_ESCALATING_SIGNATURE',
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'lead-123', teamId: 'team-esc', role: 'lead' };
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-3/sign-escalating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: 'lead-123', signature: 'Lead', checkerId: 'lead-123' })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Anti-Self-Approval');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });

    it('1d. accept-receiving rejects if agreement is not in AWAITING_RECEIVING_ACCEPTANCE', async () => {
      const mockAgreement = {
        id: 'esc-test-4',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'AWAITING_ESCALATING_SIGNATURE', // Not yet signed
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'rec-lead', teamId: 'team-rec', role: 'lead' };
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-4/accept-receiving`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: 'rec-lead', signature: 'RecLead', technicianId: 'tech-1' })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Invalid state transition');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });

    it('1e. accept-receiving rejects non-receiving team member with 403', async () => {
      const mockAgreement = {
        id: 'esc-test-5',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'AWAITING_RECEIVING_ACCEPTANCE',
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'esc-user', teamId: 'team-esc', role: 'lead' }; // Escalating team trying to accept
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-5/accept-receiving`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: 'esc-user', signature: 'EscUser', technicianId: 'tech-1' })
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain('Forbidden');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });

    it('1f. decline-receiving rejects if status is not AWAITING_RECEIVING_ACCEPTANCE', async () => {
      const mockAgreement = {
        id: 'esc-test-6',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'ACTIVE',
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'rec-lead', teamId: 'team-rec', role: 'lead' };
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-6/decline-receiving`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: 'rec-lead', reason: 'Capacity full' })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Invalid state transition');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });

    it('1g. close agreement rejects already CLOSED or DECLINED agreements with 400', async () => {
      const mockAgreement = {
        id: 'esc-test-7',
        issueId: 'task-100',
        escalatingTeamId: 'team-esc',
        receivingTeamId: 'team-rec',
        status: 'CLOSED',
        ledger: []
      };

      const origGet = postgresRepo.getEscalationAgreementById;
      postgresRepo.getEscalationAgreementById = async () => mockAgreement as any;

      try {
        mockUser = { id: 'rec-lead', teamId: 'team-rec', role: 'lead' };
        const res = await fetch(`${baseUrl}/api/escalations/agreements/esc-test-7/close`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ closedBy: 'rec-lead' })
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('already');
      } finally {
        postgresRepo.getEscalationAgreementById = origGet;
      }
    });
  });

  // ==================== AUD-SBX-002 TESTS ====================
  describe('AUD-SBX-002: Sandbox Isolation & dryRun Zero Persistence Leakage', () => {
    it('2a. executeUniversalWorkflow with dryRun=true skips recordTaskWorkflowExecution and updateTaskDatasetValidationStatus', async () => {
      let recordExecutionCalled = false;
      let updateDatasetCalled = false;

      const origRecord = postgresRepo.recordTaskWorkflowExecution;
      const origUpdate = postgresRepo.updateTaskDatasetValidationStatus;
      const origGetWorkflow = postgresRepo.getWorkflowById;

      postgresRepo.recordTaskWorkflowExecution = async (exec: any) => {
        recordExecutionCalled = true;
        return exec;
      };
      postgresRepo.updateTaskDatasetValidationStatus = async () => {
        updateDatasetCalled = true;
      };
      postgresRepo.getWorkflowById = async () => ({
        id: 'wf-dry-test',
        name: 'Dry Run Workflow',
        targetDbId: 'local',
        targetTable: 'transactions',
        stages: []
      } as any);

      try {
        const envelope = {
          sourceType: 'QUERY_SANDBOX',
          sourceId: 'task-sandbox-dryrun-1',
          workflowId: 'wf-dry-test',
          records: [{ transaction_id: 'TXN-100', amount: 50 }],
          options: {
            dryRun: true
          }
        };

        await investigationOrchestratorService.executeUniversalWorkflow(envelope as any);

        expect(recordExecutionCalled).toBe(false);
        expect(updateDatasetCalled).toBe(false);
      } finally {
        postgresRepo.recordTaskWorkflowExecution = origRecord;
        postgresRepo.updateTaskDatasetValidationStatus = origUpdate;
        postgresRepo.getWorkflowById = origGetWorkflow;
      }
    });

    it('2b. simulateWorkflow taints records with _isDiagnosticOnly: true and persists simulation telemetry', async () => {
      let savedSimulationEvidence: any = null;

      const origSave = postgresRepo.recordSandboxSimulationRun;
      const origGetHistory = postgresRepo.getSandboxSimulationRuns;
      const origExecUniversal = investigationOrchestratorService.executeUniversalWorkflow;

      postgresRepo.recordSandboxSimulationRun = async (ev: any) => {
        savedSimulationEvidence = ev;
      };
      postgresRepo.getSandboxSimulationRuns = async (wfId: string) => {
        if (savedSimulationEvidence && savedSimulationEvidence.workflowId === wfId) {
          return [savedSimulationEvidence];
        }
        return [];
      };

      investigationOrchestratorService.executeUniversalWorkflow = async (env: any) => ({
        jobId: 'job-mock-sbx',
        workflowId: env.workflowId,
        sourceType: env.sourceType,
        totalRecords: env.records.length,
        passedCount: env.records.length,
        failedCount: 0,
        durationMs: 15,
        records: env.records.map((r: any) => ({ ...r, _validation_status: 'PASS' }))
      } as any);

      try {
        const simRes = await sandboxExecutionService.simulateWorkflow({
          workflowId: 'wf-telemetry-test',
          records: [{ transaction_id: 'TX-999', amount: 250 }],
          executedBy: 'operator_alice'
        });

        // Diagnostic tainting verification
        expect(simRes.telemetry.isDiagnosticOnly).toBe(true);
        expect(simRes.telemetry.summary.dryRunConfirmed).toBe(true);
        expect(simRes.records[0]._isDiagnosticOnly).toBe(true);
        expect(simRes.records[0]._executionMode).toBe('SANDBOX_SIMULATION');

        // Telemetry persistence verification
        expect(savedSimulationEvidence).toBeDefined();
        expect(savedSimulationEvidence.workflowId).toBe('wf-telemetry-test');
        expect(savedSimulationEvidence.executedBy).toBe('operator_alice');

        // History retrieval verification
        const history = await sandboxExecutionService.getSandboxHistory('wf-telemetry-test');
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].workflowId).toBe('wf-telemetry-test');
      } finally {
        postgresRepo.recordSandboxSimulationRun = origSave;
        postgresRepo.getSandboxSimulationRuns = origGetHistory;
        investigationOrchestratorService.executeUniversalWorkflow = origExecUniversal;
      }
    });
  });
});
