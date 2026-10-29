import React, { useState, useRef, useEffect } from 'react';
import { Team, TeamDiscussionMessage, User, Issue, HashtagPreset, EscalationAgreement } from '../../types';
import { 
  MessageSquare, Send, Pin, Tag, Sparkles, 
  CornerDownRight, CheckCheck, Smile, ShieldAlert, ChevronDown,
  Flag, FileText, Plus, CheckCircle2, Clock
} from 'lucide-react';
import { NoDiscussionEmptyState } from './TeamEmptyStates';
import { EscalationRoomModal } from './EscalationRoomModal';
import { EscalateToTeamModal } from './EscalateToTeamModal';
import { EscalationRoomView } from './EscalationRoomView';
import { EscalationAgreementView } from './EscalationAgreementView';
import { api } from '../../api/client';
import UnifiedChatInput, { InChatDirectiveType } from '../chat/UnifiedChatInput';

interface TeamDiscussionTabProps {
  currentTeam: Team;
  messages: TeamDiscussionMessage[];
  currentUser: User;
  onSendMessage: (msg: Omit<TeamDiscussionMessage, 'id' | 'timestamp'>) => void;
  availableTeams?: Team[];
  users?: User[];
  hashtags?: HashtagPreset[];
  onStageTask?: (issue: Issue) => void;
}

export const TeamDiscussionTab: React.FC<TeamDiscussionTabProps> = ({
  currentTeam,
  messages = [],
  currentUser,
  onSendMessage,
  availableTeams = [],
  users = [],
  hashtags = [],
  onStageTask
}) => {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Rooms navigation: 'general' | agreementId
  const [selectedRoom, setSelectedRoom] = useState<string>('general');
  const [agreements, setAgreements] = useState<EscalationAgreement[]>([]);
  const [isLoadingAgreements, setIsLoadingAgreements] = useState(false);
  const [viewingContractAgreement, setViewingContractAgreement] = useState<EscalationAgreement | null>(null);

  // Escalation Modals State
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [showEscalateToTeamModal, setShowEscalateToTeamModal] = useState(false);
  const [issuesList, setIssuesList] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);

  // Load active issues when user opens escalation selector
  useEffect(() => {
    let isMounted = true;
    const fetchIssues = async () => {
      try {
        setIsLoadingIssues(true);
        const data = await api.getIssues(undefined, 'all');
        if (isMounted && Array.isArray(data)) {
          setIssuesList(data);
          if (data.length > 0 && !selectedIssue) {
            setSelectedIssue(data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch issues for escalation room:', err);
      } finally {
        if (isMounted) setIsLoadingIssues(false);
      }
    };
    fetchIssues();
    return () => { isMounted = false; };
  }, []);

  // Fetch escalation agreements for the team (both escalating and receiving)
  const fetchAgreements = async () => {
    try {
      setIsLoadingAgreements(true);
      const data = await api.getEscalationAgreements(currentTeam?.id);
      if (Array.isArray(data)) {
        setAgreements(data);
      }
    } catch (err) {
      console.warn('Failed to fetch escalation agreements:', err);
    } finally {
      setIsLoadingAgreements(false);
    }
  };

  useEffect(() => {
    fetchAgreements();
  }, [currentTeam?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [safeMessages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentTeam || !currentUser) return;

    onSendMessage({
      teamId: currentTeam.id,
      senderId: currentUser.id,
      senderName: currentUser.username,
      content: inputText.trim()
    });
    setInputText('');
  };

  const activeAgreement = agreements.find(a => a.id === selectedRoom);

  return (
    <div className="flex h-full min-h-0 bg-slate-50/50 border border-slate-200/90 rounded-2xl overflow-hidden font-sans shadow-xs" id="team-discussion-tab">
      {/* Left Sidebar: Rooms (Screen 30 & 31) */}
      <div className="w-56 bg-slate-50/80 border-r border-slate-200/90 flex flex-col shrink-0 font-sans">
        <div className="p-3 border-b border-slate-200/70 flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
            Rooms
          </span>
          <button
            onClick={() => setShowEscalateToTeamModal(true)}
            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors"
            title="Escalate issue to another team under SLA contract"
            id="btn-sidebar-escalate"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* General channel */}
          <button
            onClick={() => { setSelectedRoom('general'); setViewingContractAgreement(null); }}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
              selectedRoom === 'general' && !viewingContractAgreement
                ? 'bg-blue-600 text-white font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
            id="room-general"
          >
            <div className="flex items-center space-x-2 truncate">
              <span className="text-slate-400 font-normal">#</span>
              <span className="truncate">{currentTeam?.name ? currentTeam.name.toLowerCase().replace(/\s+/g, '-') + '-general' : 'general'}</span>
            </div>
            {safeMessages.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedRoom === 'general' && !viewingContractAgreement ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {safeMessages.length}
              </span>
            )}
          </button>

          {/* Escalation rooms section */}
          <div className="pt-3 pb-1 px-1">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert size={10} className="text-amber-500" />
              Escalation Rooms
            </span>
          </div>

          {agreements.length === 0 ? (
            <div className="p-2 text-[11px] font-mono text-slate-400 italic">
              No active escalation rooms
            </div>
          ) : (
            agreements.map(agree => {
              const isSelected = selectedRoom === agree.id && !viewingContractAgreement;
              const isSigned = agree.status === 'SIGNED' || agree.status === 'IN_PROGRESS' || agree.status === 'COMPLETED';
              return (
                <button
                  key={agree.id}
                  onClick={() => { setSelectedRoom(agree.id); setViewingContractAgreement(null); }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition-colors border ${
                    isSelected
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold shadow-2xs'
                      : 'border-transparent text-slate-600 hover:bg-slate-200/60'
                  }`}
                  id={`room-${agree.id}`}
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <Flag size={12} className={isSelected ? 'text-amber-600' : 'text-slate-400'} />
                    <span className="truncate">{agree.issueKey} · {agree.issueTitle.substring(0, 14)}...</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-1 text-slate-400">
                    <span className="capitalize">{agree.status.replace(/_/g, ' ').toLowerCase()}</span>
                    {isSigned && <CheckCircle2 size={11} className="text-emerald-500" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Bottom Escalate Button */}
        <div className="p-2 border-t border-slate-200/70">
          <button
            onClick={() => setShowEscalateToTeamModal(true)}
            className="w-full py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
            id="btn-new-escalation-sidebar"
          >
            <ShieldAlert size={13} className="text-amber-600" />
            <span>+ Escalate Issue</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {viewingContractAgreement ? (
          /* Screen 32: Formal Signed Agreement View */
          <EscalationAgreementView
            agreement={viewingContractAgreement}
            onClose={() => setViewingContractAgreement(null)}
          />
        ) : activeAgreement ? (
          /* Screens 30 & 31: Dedicated Escalation Room View */
          <EscalationRoomView
            agreement={activeAgreement}
            currentUser={currentUser}
            currentTeam={currentTeam}
            availableTeams={availableTeams}
            users={users}
            hashtags={hashtags}
            onOpenAgreementContract={(agree) => setViewingContractAgreement(agree)}
            onAgreementUpdated={(updated) => {
              setAgreements(prev => prev.map(a => a.id === updated.id ? updated : a));
            }}
            onStageTask={onStageTask}
          />
        ) : (
          /* General Team Discussion Stream */
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="bg-white border-b border-slate-200/90 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-mono">Team Discussion</h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Live collaboration for #{currentTeam?.name ? currentTeam.name.toLowerCase().replace(/\s+/g, '-') : 'general'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowEscalateToTeamModal(true)}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Escalate to team under signed agreement"
                  id="btn-header-escalate-team"
                >
                  <ShieldAlert size={14} className="text-amber-600" />
                  <span>🏳 Escalate to Team</span>
                </button>

                <span className="text-xs font-mono font-bold text-slate-500 px-2.5 py-1 bg-white border border-slate-200 rounded-lg">
                  {safeMessages.length} messages
                </span>
              </div>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {safeMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <NoDiscussionEmptyState />
                </div>
              ) : (
                safeMessages.map(msg => {
                  const isSelf = currentUser && (msg.senderId === currentUser.id || msg.senderName === currentUser.username);
                  const initials = msg.senderName?.substring(0, 2).toUpperCase() || 'TM';
                  const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div 
                      key={msg.id}
                      className={`flex items-start space-x-2.5 ${isSelf ? 'flex-row-reverse space-x-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isSelf 
                          ? 'bg-blue-600 text-white shadow-2xs' 
                          : 'bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs'
                      }`}>
                        {initials}
                      </div>

                      <div className={`max-w-[80%] sm:max-w-[70%] space-y-1 ${isSelf ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center space-x-2 text-[10px] font-mono ${isSelf ? 'justify-end' : ''}`}>
                          <span className="font-bold text-slate-800">
                            @{msg.senderName} {isSelf && '(You)'}
                          </span>
                          <span className="text-slate-400">{timestamp}</span>
                        </div>

                        <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                          isSelf 
                            ? 'bg-[#155DFC] text-white rounded-tr-xs shadow-xs' 
                            : 'bg-slate-100 text-slate-800 rounded-tl-xs'
                        }`}>
                          {msg.content}
                        </div>

                        {/* Inline Stage task chip if message references an issue or case */}
                        {onStageTask && (msg.content.includes('ISS-') || msg.content.toLowerCase().includes('escalat') || msg.content.toLowerCase().includes('trn test')) && (
                          <div className={`pt-1 flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                            <button
                              type="button"
                              onClick={() => {
                                const issueMatch = msg.content.match(/ISS-\d+/);
                                const issueKey = issueMatch ? issueMatch[0] : 'ISS-3854';
                                const foundIssue = issuesList.find(i => i.id === issueKey);
                                const target = foundIssue || {
                                  id: issueKey,
                                  title: 'trn test',
                                  description: 'Settlement amount differences under 50.00 caused by fee rounding on the switch side.',
                                  priority: 'High' as any,
                                  status: 'Investigating',
                                  creatorId: msg.senderId || 'kirubel_ops',
                                  creatorName: msg.senderName || 'kirubel_ops',
                                  createdAt: msg.timestamp || new Date().toISOString(),
                                  targetDb: 'Sett · MySQL',
                                  targetTable: 'sv_fin_tab',
                                  stagedEnvironment: 'SANDBOX' as any,
                                  chat: []
                                };
                                onStageTask(target);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-[#F27421] text-orange-700 hover:text-white border border-orange-200 text-[11px] font-mono font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                              title="Stage this case into Level 2 Technician Investigation Workspace"
                            >
                              <Flag size={11} />
                              <span>Stage task ({msg.content.match(/ISS-\d+/)?.[0] || 'ISS-3854'}) →</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Box (Screen 28) */}
            <div className="p-3 border-t border-slate-200/80 bg-white">
              <UnifiedChatInput
                currentUser={currentUser}
                users={users}
                teams={availableTeams}
                hashtags={hashtags}
                placeholder="Type a message, @ to mention, @@ for team, / for directives..."
                value={inputText}
                onChange={setInputText}
                onSendMessage={(content) => {
                  onSendMessage({
                    teamId: currentTeam.id,
                    senderId: currentUser.id,
                    senderName: currentUser.username,
                    content
                  });
                  setInputText('');
                }}
                onExecuteDirective={(directive, context) => {
                  if (directive === 'create-escalate') {
                    setShowEscalateToTeamModal(true);
                  } else if (directive === 'create-task') {
                    alert(`Task Action: Created task context from discussion: "${context || 'Team Discussion'}"`);
                  } else if (directive === 'request-approval') {
                    alert('Maker-Checker: Staging proposal for team review.');
                  }
                }}
                inputId="input-team-discussion"
              />
            </div>
          </div>
        )}
      </div>

      {/* Screen 29: Escalate to Team Modal */}
      {showEscalateToTeamModal && (
        <EscalateToTeamModal
          isOpen={showEscalateToTeamModal}
          onClose={() => setShowEscalateToTeamModal(false)}
          currentTeam={currentTeam}
          availableTeams={availableTeams}
          currentUser={currentUser}
          activeIssue={selectedIssue || issuesList[0] || {
            id: 'ISS-3854',
            key: 'ISS-3854',
            title: 'trn test - Discrepancy Flagged',
            status: 'OPEN',
            priority: 'HIGH',
            tags: ['#AIB_SETTLEMENT_2026'],
            createdAt: new Date().toISOString()
          }}
          onAgreementCreated={(newAgreement) => {
            setAgreements(prev => [newAgreement, ...prev]);
            setSelectedRoom(newAgreement.id);
            fetchAgreements();
          }}
        />
      )}

      {/* Incident Escalation Room Modal fallback */}
      {showEscalationModal && selectedIssue && (
        <EscalationRoomModal
          isOpen={showEscalationModal}
          onClose={() => setShowEscalationModal(false)}
          issue={selectedIssue}
          currentUser={currentUser}
          currentTeam={currentTeam}
          availableTeams={availableTeams}
          onIssueUpdated={(updated) => {
            setSelectedIssue(updated);
            setIssuesList(prev => prev.map(i => i.id === updated.id ? updated : i));
          }}
        />
      )}
    </div>
  );
};


