/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  X, Forward, Search, Users, ShieldAlert, FileText, 
  Check, MessageSquare, CornerDownRight, Hash, Building2
} from 'lucide-react';
import { Team, Issue, User } from '../../types';

export interface ForwardDestination {
  type: 'team' | 'case' | 'user';
  id: string;
  name: string;
  subtitle?: string;
}

export interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageToForward: {
    senderName: string;
    text: string;
    sourceTitle?: string;
    timestamp?: string;
  } | null;
  availableTeams?: Team[];
  availableIssues?: Issue[];
  availableUsers?: User[];
  currentTeamId?: string;
  currentUserId?: string;
  onConfirmForward: (
    destination: ForwardDestination,
    optionalComment: string
  ) => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  isOpen,
  onClose,
  messageToForward,
  availableTeams = [],
  availableIssues = [],
  availableUsers = [],
  currentTeamId,
  currentUserId,
  onConfirmForward
}) => {
  const [activeTab, setActiveTab] = useState<'team' | 'case' | 'user'>('team');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<ForwardDestination | null>(null);
  const [comment, setComment] = useState('');

  // Filtered lists
  const filteredTeams = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return availableTeams
      .filter(t => !q || t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)))
      .map(t => ({
        type: 'team' as const,
        id: t.id,
        name: `#${t.name.toLowerCase().replace(/\s+/g, '-')}-general`,
        subtitle: t.name
      }));
  }, [availableTeams, searchQuery]);

  const filteredCases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return availableIssues
      .filter(iss => !q || iss.id.toLowerCase().includes(q) || iss.title.toLowerCase().includes(q))
      .map(iss => ({
        type: 'case' as const,
        id: iss.id,
        name: `Case #${iss.id}`,
        subtitle: iss.title
      }));
  }, [availableIssues, searchQuery]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return availableUsers
      .filter(u => u.id !== currentUserId && (!q || (u.displayName || u.username).toLowerCase().includes(q) || u.role.toLowerCase().includes(q)))
      .map(u => ({
        type: 'user' as const,
        id: u.id,
        name: `@${u.displayName || u.username}`,
        subtitle: `${u.role.toUpperCase()} · ${u.email || ''}`
      }));
  }, [availableUsers, currentUserId, searchQuery]);

  if (!isOpen || !messageToForward) return null;

  const handleForward = () => {
    if (!selectedDestination) return;
    onConfirmForward(selectedDestination, comment.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Forward size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-mono">Forward Message</h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Share this message across channels, cases, or direct messages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message Preview Box */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-100">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Original Message Preview
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-800 font-mono">
                @{messageToForward.senderName}
              </span>
              {messageToForward.sourceTitle && (
                <span className="text-[10px] font-mono text-slate-400">
                  from {messageToForward.sourceTitle}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
              {messageToForward.text}
            </p>
          </div>
        </div>

        {/* Destination Tabs */}
        <div className="px-4 pt-3 flex items-center space-x-2 border-b border-slate-200/80 bg-white">
          <button
            type="button"
            onClick={() => { setActiveTab('team'); setSelectedDestination(null); }}
            className={`pb-2.5 text-xs font-mono font-semibold flex items-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'team'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Hash size={13} />
            <span>Teams & Channels ({filteredTeams.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('case'); setSelectedDestination(null); }}
            className={`pb-2.5 text-xs font-mono font-semibold flex items-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'case'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={13} />
            <span>Cases ({filteredCases.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('user'); setSelectedDestination(null); }}
            className={`pb-2.5 text-xs font-mono font-semibold flex items-center space-x-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'user'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={13} />
            <span>Direct ({filteredUsers.length})</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'team' ? 'channels or teams' : activeTab === 'case' ? 'cases by ID or title' : 'colleagues'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 text-slate-800 focus:outline-hidden focus:border-blue-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Destinations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-48 min-h-[140px] bg-slate-50/30">
          {activeTab === 'team' && (
            filteredTeams.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 font-mono">No matching teams found</div>
            ) : (
              filteredTeams.map((dest) => {
                const isSelected = selectedDestination?.id === dest.id && selectedDestination?.type === dest.type;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => setSelectedDestination(dest)}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-900 shadow-2xs font-semibold'
                        : 'bg-white hover:bg-slate-100/70 border-slate-200/70 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Hash size={13} />
                      </div>
                      <div className="truncate">
                        <div className="font-mono font-medium truncate">{dest.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{dest.subtitle}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )
          )}

          {activeTab === 'case' && (
            filteredCases.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 font-mono">No matching cases found</div>
            ) : (
              filteredCases.map((dest) => {
                const isSelected = selectedDestination?.id === dest.id && selectedDestination?.type === dest.type;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => setSelectedDestination(dest)}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-900 shadow-2xs font-semibold'
                        : 'bg-white hover:bg-slate-100/70 border-slate-200/70 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <FileText size={13} />
                      </div>
                      <div className="truncate">
                        <div className="font-mono font-medium truncate">{dest.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{dest.subtitle}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )
          )}

          {activeTab === 'user' && (
            filteredUsers.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 font-mono">No matching users found</div>
            ) : (
              filteredUsers.map((dest) => {
                const isSelected = selectedDestination?.id === dest.id && selectedDestination?.type === dest.type;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => setSelectedDestination(dest)}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-900 shadow-2xs font-semibold'
                        : 'bg-white hover:bg-slate-100/70 border-slate-200/70 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Users size={13} />
                      </div>
                      <div className="truncate">
                        <div className="font-mono font-medium truncate">{dest.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{dest.subtitle}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )
          )}
        </div>

        {/* Optional Add a Comment */}
        <div className="p-3 bg-white border-t border-slate-200/80">
          <label className="block text-[11px] font-mono text-slate-600 mb-1">
            Add an optional note:
          </label>
          <input
            type="text"
            placeholder="e.g. Please review this discrepancy before batch cutoff..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg placeholder-slate-400 text-slate-800 focus:outline-hidden focus:border-blue-500 transition-all"
          />
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono truncate max-w-[240px]">
            {selectedDestination ? (
              <span className="text-blue-600 font-semibold truncate block">
                Target: {selectedDestination.name}
              </span>
            ) : (
              <span className="italic">Select a destination above</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleForward}
              disabled={!selectedDestination}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-mono font-bold text-white transition-colors cursor-pointer shadow-2xs flex items-center space-x-1.5"
            >
              <Forward size={13} />
              <span>Forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

