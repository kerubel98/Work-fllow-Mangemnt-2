/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Check, Plus, Link2, Flag, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Team, User, Issue, EscalationAgreement, EscalationKpiTerm } from '../../types';
import { api } from '../../api/client';

export interface EscalateToTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue?: Issue;
  activeIssue?: Issue;
  currentUser?: User | null;
  currentTeam?: Team | null;
  availableTeams?: Team[];
  onEscalationCreated?: (agreement: EscalationAgreement) => void;
  onAgreementCreated?: (agreement: EscalationAgreement) => void;
}

export const EscalateToTeamModal: React.FC<EscalateToTeamModalProps> = ({
  isOpen,
  onClose,
  issue,
  activeIssue,
  currentUser,
  currentTeam,
  availableTeams = [],
  onEscalationCreated,
  onAgreementCreated
}) => {
  if (!isOpen) return null;

  const currentCase = issue || activeIssue || {
    id: 'ISS-3854',
    key: 'ISS-3854',
    title: 'trn test - Discrepancy Flagged',
    priority: 'HIGH',
    status: 'OPEN'
  } as unknown as Issue;

  const [loadedTeams, setLoadedTeams] = useState<Team[]>(availableTeams);

  React.useEffect(() => {
    if (!availableTeams || availableTeams.length === 0) {
      api.getTeams().then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setLoadedTeams(data);
        }
      }).catch(err => console.warn('Could not fetch teams for escalation modal:', err));
    }
  }, [availableTeams]);

  // Provide robust fallback teams matching PostgreSQL database seeds
  const safeTeams: Team[] = (loadedTeams && loadedTeams.length > 0)
    ? loadedTeams
    : [
        { id: 'team-1', name: 'Core Operations', description: 'Core clearing and settlement', members: [], created_at: new Date().toISOString() } as unknown as Team,
        { id: 'team-cards', name: 'Card Disputes', description: 'Dispute arbitration & chargebacks', members: [], created_at: new Date().toISOString() } as unknown as Team
      ];

  // Filter out the current team from candidate targets
  const targetTeams = safeTeams.filter(t => t.id !== currentTeam?.id);
  const defaultTarget = targetTeams[0] || safeTeams[0];

  const [selectedTeamId, setSelectedTeamId] = useState<string>(defaultTarget?.id || 'team-1');
  const [reason, setReason] = useState<string>(
    'Settlement amount mismatches need ledger access our team does not have.'
  );
  const [priority, setPriority] = useState<'Medium' | 'High' | 'Critical'>('High');

  // Payload traveler options
  const [sendSummary, setSendSummary] = useState(true);
  const [sendWorkflow, setSendWorkflow] = useState(true);
  const [sendFlaggedRows, setSendFlaggedRows] = useState(true);
  const [sendChatHistory, setSendChatHistory] = useState(false);

  // KPIs
  const [kpis, setKpis] = useState<EscalationKpiTerm[]>([
    { name: 'Time to first response', target: '4 hours', status: 'Running', progressPercent: 0 },
    { name: 'Resolution target', target: '24 hours', status: 'Running', progressPercent: 0 },
    { name: 'Accuracy of fixes', target: '99%', status: 'Not measured', progressPercent: 0 }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTeam = availableTeams.find(t => t.id === selectedTeamId) || defaultTarget;

  const handleAddKpi = () => {
    setKpis(prev => [
      ...prev,
      { name: 'SLA target', target: '12 hours', status: 'Running', progressPercent: 0 }
    ]);
  };

  const handleRemoveKpi = (index: number) => {
    setKpis(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleKpiChange = (index: number, field: 'name' | 'target', value: string) => {
    setKpis(prev => prev.map((k, idx) => idx === index ? { ...k, [field]: value } : k));
  };

  const handleSubmit = async () => {
    if (!selectedTeamId) {
      setError('Please select a destination team.');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason for the escalation.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const created = await api.createEscalationAgreement({
        issueId: currentCase.id,
        escalatingTeamId: currentTeam?.id || 'team-cards',
        receivingTeamId: selectedTeamId || 'team-1',
        priority,
        reason: reason.trim(),
        workflowId: currentCase.workflowId || 'wf-pipeline-1',
        workflowName: currentCase.workflowName || 'New Validation Pipeline',
        flaggedCount: currentCase.transactionCount ? Math.round(currentCase.transactionCount * 0.05) : 24,
        totalCount: currentCase.transactionCount || 500,
        raisedByUserId: currentUser?.id || 'user-1',
        raisedByUsername: currentUser?.username || 'kirubel_ops',
        kpis,
        payloadOptions: {
          sendSummary,
          sendWorkflow,
          sendFlaggedRows,
          sendChatHistory
        }
      });

      if (onEscalationCreated) {
        onEscalationCreated(created);
      }
      if (onAgreementCreated) {
        onAgreementCreated(created);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit escalation agreement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        id="modal-escalate-to-team"
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F27421]">
              <Flag size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 font-sans">Escalate to a team</h2>
              <p className="text-xs text-slate-500 font-mono">
                Case {currentCase.key || currentCase.id} · {currentCase.title || 'Settlement anomaly'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          {/* Left Form: 7 cols */}
          <div className="lg:col-span-7 space-y-4.5">
            {/* Escalate to (Team Picker) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2 font-sans">
                Escalate to
              </label>
              <div className="space-y-2">
                {targetTeams.slice(0, 3).map(team => {
                  const isSelected = selectedTeamId === team.id;
                  const initials = team.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'TM';
                  const leadName = team.leadName || (team.name.toLowerCase().includes('core') ? '@tech_sarah' : '@manager_alex');
                  const teamType = team.type || (team.name.toLowerCase().includes('project') ? 'Working team' : 'Permanent unit');

                  return (
                    <div
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-[#F27421] bg-orange-50/20 shadow-xs ring-1 ring-[#F27421]/30' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs font-mono shrink-0 ${
                          isSelected ? 'bg-orange-100 text-[#F27421]' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {initials}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 font-sans">
                            @@{team.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {teamType} · lead {leadName} · 3 members
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-[#F27421] text-white flex items-center justify-center shrink-0">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Why are you escalating? */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-sans">
                Why are you escalating?
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-hidden focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421] transition-all font-sans resize-none"
                placeholder="Explain the technical or access roadblock..."
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-sans">
                Priority
              </label>
              <div className="flex items-center space-x-2">
                {(['Medium', 'High', 'Critical'] as const).map(p => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium font-sans transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-[#0F142A] text-white shadow-xs' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Send with the case */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-sans">
                Send with the case
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSendSummary(!sendSummary)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono flex items-center space-x-1.5 cursor-pointer transition-all ${
                    sendSummary 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' 
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {sendSummary && <Check size={12} />}
                  <span>Investigation summary</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSendWorkflow(!sendWorkflow)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono flex items-center space-x-1.5 cursor-pointer transition-all ${
                    sendWorkflow 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' 
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {sendWorkflow && <Check size={12} />}
                  <span>Workflow & run result</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSendFlaggedRows(!sendFlaggedRows)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono flex items-center space-x-1.5 cursor-pointer transition-all ${
                    sendFlaggedRows 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' 
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {sendFlaggedRows && <Check size={12} />}
                  <span>24 flagged rows</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSendChatHistory(!sendChatHistory)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono flex items-center space-x-1.5 cursor-pointer transition-all ${
                    sendChatHistory 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' 
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {sendChatHistory && <Check size={12} />}
                  <span>Chat history</span>
                </button>
              </div>
            </div>

            {/* Terms both teams agree to (KPIs) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 font-sans">
                  Terms both teams agree to (KPIs)
                </label>
                <button
                  type="button"
                  onClick={handleAddKpi}
                  className="text-[11px] font-mono font-bold text-slate-700 hover:text-[#F27421] flex items-center space-x-1 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Add KPI</span>
                </button>
              </div>

              <div className="space-y-2">
                {kpis.map((kpi, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={kpi.name}
                      onChange={e => handleKpiChange(idx, 'name', e.target.value)}
                      className="flex-1 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:border-slate-400 font-sans"
                    />
                    <input
                      type="text"
                      value={kpi.target}
                      onChange={e => handleKpiChange(idx, 'target', e.target.value)}
                      className="w-28 text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-right font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveKpi(idx)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded-md transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Stepper: 5 cols */}
          <div className="lg:col-span-5 bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-900 mb-3.5 font-sans">
                How it works
              </h3>

              {/* Vertical Stepper */}
              <div className="space-y-4 relative before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                {/* Step 1 */}
                <div className="flex items-start space-x-3 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    1
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 font-sans">
                      Raised by @{currentUser.username}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">You</div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start space-x-3 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300 text-slate-600 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    2
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800 font-sans leading-snug">
                      Signed by your team lead, who assigns a checker
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">@manager_alex</div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start space-x-3 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300 text-slate-600 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    3
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800 font-sans leading-snug">
                      Accepted by receiving lead, who assigns a technician
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">@tech_sarah</div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start space-x-3 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300 text-slate-600 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    4
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800 font-sans">
                      Escalation room opens for both teams
                    </div>
                  </div>
                </div>
              </div>

              {/* Shared Workflow Card */}
              <div className="mt-5 p-3 bg-white border border-slate-200 rounded-xl space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-600 font-sans">
                  Workflow shared with both teams
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[11px] font-mono text-slate-800 flex items-center space-x-1">
                    <Link2 size={12} className="text-slate-500" />
                    <span>{currentCase.workflowName || 'New Validation Pipeline'}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">run 2 min ago</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 font-sans leading-relaxed border-t border-slate-200 pt-3">
              Once accepted, the terms are locked. Changes need a new amendment signed by both leads.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            id="btn-submit-escalate"
          >
            {isSubmitting ? 'Sending...' : 'Send to team lead for signature'}
          </button>
        </div>
      </div>
    </div>
  );
};
