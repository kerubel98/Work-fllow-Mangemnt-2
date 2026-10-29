/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Download, FileEdit, CheckCircle2, Lock, ArrowLeft,
  Link2, Clock, Users, Shield, ShieldCheck, Check, AlertCircle
} from 'lucide-react';
import { EscalationAgreement, User } from '../../types';
import { api } from '../../api/client';

interface EscalationAgreementViewProps {
  agreementId?: string;
  agreement?: EscalationAgreement | null;
  currentUser: User;
  onBack?: () => void;
  onCloseCase?: () => void;
}

export const EscalationAgreementView: React.FC<EscalationAgreementViewProps> = ({
  agreementId,
  agreement: initialAgreement,
  currentUser,
  onBack,
  onCloseCase
}) => {
  const [agreement, setAgreement] = useState<EscalationAgreement | null>(initialAgreement || null);
  const [isLoading, setIsLoading] = useState(!initialAgreement && !!agreementId);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (agreementId && !initialAgreement) {
      setIsLoading(true);
      api.getEscalationAgreementById(agreementId)
        .then(data => setAgreement(data))
        .catch(err => console.error('Failed to load agreement:', err))
        .finally(() => setIsLoading(false));
    }
  }, [agreementId, initialAgreement]);

  // Default fallback data if empty for instant visual rendering
  const currentAgreement = agreement || {
    id: 'esc-agr-3854',
    issueId: 'iss-3854',
    issueKey: 'ISS-3854',
    issueTitle: 'trn test',
    escalatingTeamId: 'team-disputes',
    escalatingTeamName: 'Card Disputes & Chargebacks Unit',
    receivingTeamId: 'team-core-ops',
    receivingTeamName: 'Core Operations & Settlement Division',
    status: 'ACTIVE' as const,
    priority: 'High' as const,
    reason: 'Settlement amount mismatches need ledger access our team does not have.',
    workflowId: 'wf-val-1',
    workflowName: 'New Validation Pipeline',
    flaggedCount: 24,
    totalCount: 500,
    raisedByUserId: 'user-kirubel',
    raisedByUsername: 'kirubel_ops',
    escalatingLeadId: 'user-alex',
    escalatingLeadSignature: 'manager_alex',
    escalatingSignedAt: '2026-10-23T10:52:00Z',
    assignedCheckerId: 'user-checker-2',
    assignedCheckerName: 'checker_ops_2',
    receivingLeadId: 'user-sarah',
    receivingLeadSignature: 'tech_sarah',
    receivingAcceptedAt: '2026-10-23T11:05:00Z',
    assignedTechnicianId: 'user-samuel',
    assignedTechnicianName: 'samuel_tech',
    kpis: [
      { name: 'Time to first response', target: '4 hours', actual: '1h 12m', progressPercent: 30, status: 'Met' as const },
      { name: 'Resolution target', target: '24 hours', actual: '6h elapsed', progressPercent: 25, status: 'Running' as const },
      { name: 'Accuracy of fixes', target: '99%', actual: 'Pending', progressPercent: 0, status: 'Not measured' as const }
    ],
    payloadOptions: { sendSummary: true, sendWorkflow: true, sendFlaggedRows: true, sendChatHistory: false },
    ledger: [
      { id: '1', event: 'Raised by @kirubel_ops', actor: '@kirubel_ops', timestamp: '10:40', type: 'raised' as const },
      { id: '2', event: 'Signed by @manager_alex, checker @checker_ops_2 assigned', actor: '@manager_alex', timestamp: '10:52', type: 'signed' as const },
      { id: '3', event: 'Accepted by @tech_sarah, technician @samuel_tech assigned', actor: '@tech_sarah', timestamp: '11:05', type: 'accepted' as const },
      { id: '4', event: 'First response by @samuel_tech', actor: '@samuel_tech', timestamp: '11:17', type: 'response' as const },
      { id: '5', event: 'Room messages: 14 · 4 participants', actor: 'System', timestamp: 'Now', type: 'message' as const }
    ],
    clockStartedAt: '2026-10-23T11:05:00Z',
    createdAt: '2026-10-23T10:40:00Z',
    updatedAt: '2026-10-23T11:05:00Z'
  };

  const handleCloseCase = async () => {
    if (!currentAgreement?.id) return;
    try {
      setIsClosing(true);
      await api.closeEscalationAgreement(currentAgreement.id, { closedBy: currentUser.username });
      setAgreement(prev => prev ? { ...prev, status: 'CLOSED' } : null);
      if (onCloseCase) onCloseCase();
    } catch (err) {
      console.error('Failed to close agreement:', err);
    } finally {
      setIsClosing(false);
    }
  };

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/60 overflow-y-auto font-sans p-6 space-y-6" id="escalation-agreement-view">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5 mb-1.5">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer mr-1"
                title="Back to Room"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-full text-xs font-semibold font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              <span>{currentAgreement.status === 'ACTIVE' ? 'Active' : currentAgreement.status}</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-slate-200/70 text-slate-700 rounded-full text-xs font-mono font-medium">
              <Lock size={11} className="text-slate-500" />
              <span>Locked terms</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 font-sans tracking-tight">
            Escalation agreement · {currentAgreement.issueKey || 'ISS-3854'}
          </h1>
          <p className="text-xs text-slate-500 font-sans">
            Between {currentAgreement.escalatingTeamName || 'Card Disputes & Chargebacks Unit'} and {currentAgreement.receivingTeamName || 'Core Operations & Settlement Division'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleExportPdf}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
            id="btn-export-pdf"
          >
            <Download size={14} className="text-slate-500" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={() => alert('Amendment proposal draft opened. Both leads must sign amendments.')}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
            id="btn-propose-amendment"
          >
            <span>Propose amendment</span>
          </button>

          <button
            onClick={handleCloseCase}
            disabled={isClosing || currentAgreement.status === 'CLOSED'}
            className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            id="btn-close-case"
          >
            {isClosing ? 'Closing...' : currentAgreement.status === 'CLOSED' ? 'Case closed' : 'Close case'}
          </button>
        </div>
      </div>

      {/* Main Grid: 8 cols left, 4 cols right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Signatures */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3.5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-sans">
              Signatures
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Escalating Lead Signature */}
              <div className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/30 flex flex-col justify-between h-32">
                <div className="text-[11px] text-slate-500 font-sans">
                  Escalating team lead · Card Disputes
                </div>
                <div className="text-2xl text-slate-900 italic font-serif tracking-wide py-1 select-none">
                  {currentAgreement.escalatingLeadSignature || 'manager_alex'}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1.5">
                  <span className="flex items-center space-x-1 text-emerald-600 font-semibold">
                    <CheckCircle2 size={11} />
                    <span>Signed electronically</span>
                  </span>
                  <span>23 Oct, 10:52</span>
                </div>
              </div>

              {/* Receiving Lead Signature */}
              <div className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/30 flex flex-col justify-between h-32">
                <div className="text-[11px] text-slate-500 font-sans">
                  Receiving team lead · Core Operations
                </div>
                <div className="text-2xl text-slate-900 italic font-serif tracking-wide py-1 select-none">
                  {currentAgreement.receivingLeadSignature || 'tech_sarah'}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1.5">
                  <span className="flex items-center space-x-1 text-emerald-600 font-semibold">
                    <CheckCircle2 size={11} />
                    <span>Signed electronically</span>
                  </span>
                  <span>23 Oct, 11:05</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Case and roles */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3.5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-sans">
              Case and roles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div>
                <div className="text-[11px] text-slate-500 font-sans mb-1.5">Workflow used</div>
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-800">
                  <Link2 size={12} className="text-slate-400" />
                  <span>{currentAgreement.workflowName || 'New Validation Pipeline'}</span>
                </span>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 font-sans mb-1.5">Technician (receiving)</div>
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-[10px] font-mono font-bold">
                    SA
                  </div>
                  <span className="text-xs font-bold text-slate-900 font-mono">
                    @{currentAgreement.assignedTechnicianName || 'samuel_tech'}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 font-sans mb-1.5">Checker (escalating)</div>
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-mono font-bold">
                    CH
                  </div>
                  <span className="text-xs font-bold text-slate-900 font-mono">
                    @{currentAgreement.assignedCheckerName || 'checker_ops_2'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: KPI terms */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-sans">
                KPI terms
              </h3>
              <span className="text-[11px] text-slate-400 font-sans">
                Measured automatically from the room
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-sans">
                    <th className="pb-2 font-medium">Term</th>
                    <th className="pb-2 font-medium">Target</th>
                    <th className="pb-2 font-medium">Actual</th>
                    <th className="pb-2 font-medium w-48">Progress</th>
                    <th className="pb-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {currentAgreement.kpis.map((kpi, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 font-medium text-slate-800">{kpi.name}</td>
                      <td className="py-3 font-mono text-slate-600">{kpi.target}</td>
                      <td className="py-3 font-mono font-semibold text-slate-900">{kpi.actual || '—'}</td>
                      <td className="py-3">
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              kpi.status === 'Met' ? 'bg-emerald-500' :
                              kpi.status === 'Running' ? 'bg-[#F27421]' : 'bg-slate-300'
                            }`}
                            style={{ width: `${kpi.progressPercent || 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          kpi.status === 'Met' ? 'bg-emerald-100 text-emerald-800' :
                          kpi.status === 'Running' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {kpi.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Permanent Ledger Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-sans">
                Permanent ledger
              </h3>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono font-bold">
                Read only
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Every event, participant and message is saved and cannot be edited.
            </p>

            {/* Timeline */}
            <div className="space-y-3 relative before:absolute before:left-1 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {currentAgreement.ledger.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-3 text-xs relative z-10">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#F27421] ring-2 ring-white shrink-0 mt-1"></div>
                  <div className="flex-1 flex items-baseline justify-between">
                    <span className="text-slate-800 font-sans font-medium text-[11px] leading-tight">
                      {item.event}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono ml-2 shrink-0">
                      {item.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Participants on record */}
            <div className="border-t border-slate-100 pt-3.5 space-y-2">
              <div className="text-[11px] font-bold text-slate-700 font-sans">
                Participants on record
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['@kirubel_ops', '@manager_alex', '@tech_sarah', '@samuel_tech', '@checker_ops_2'].map(p => (
                  <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-mono">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
