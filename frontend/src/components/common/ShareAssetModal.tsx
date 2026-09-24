import React, { useState, useEffect } from 'react';
import { X, Share2, Users, User, Send, CheckCircle2, AlertCircle, Box, Workflow, Database } from 'lucide-react';
import { api } from '../../api/client';
import { User as UserType, Team } from '../../types';

export interface ShareAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetType: 'WORKFLOW' | 'VALIDATION_BOX' | 'DB_CONFIG';
  assetId: string;
  assetTitle: string;
  assetDescription?: string;
  previewDetails?: {
    category?: string;
    stepCount?: number;
    dbTarget?: string;
    keys?: string[];
  };
  currentUser?: { id: string; name: string };
  onShareSuccess?: (shareRecord: any) => void;
}

export const ShareAssetModal: React.FC<ShareAssetModalProps> = ({
  isOpen,
  onClose,
  assetType,
  assetId,
  assetTitle,
  assetDescription,
  previewDetails,
  onShareSuccess
}) => {
  const [shareTargetType, setShareTargetType] = useState<'INDIVIDUAL' | 'TEAM'>('INDIVIDUAL');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [users, setUsers] = useState<UserType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      setMessage('');
      api.getUsers().then(res => {
        setUsers(res || []);
        if (res && res.length > 0 && shareTargetType === 'INDIVIDUAL') {
          setSelectedTargetId(res[0].id);
        }
      }).catch(console.warn);

      api.getTeams().then(res => {
        setTeams(res || []);
        if (res && res.length > 0 && shareTargetType === 'TEAM') {
          setSelectedTargetId(res[0].id);
        }
      }).catch(console.warn);
    }
  }, [isOpen, shareTargetType]);

  if (!isOpen) return null;

  const handleTargetTypeChange = (type: 'INDIVIDUAL' | 'TEAM') => {
    setShareTargetType(type);
    if (type === 'INDIVIDUAL' && users.length > 0) {
      setSelectedTargetId(users[0].id);
    } else if (type === 'TEAM' && teams.length > 0) {
      setSelectedTargetId(teams[0].id);
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) {
      setFeedback({ type: 'error', message: 'Please select a recipient teammate or team.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const targetName = shareTargetType === 'INDIVIDUAL'
        ? users.find(u => u.id === selectedTargetId)?.name || 'Teammate'
        : teams.find(t => t.id === selectedTargetId)?.name || 'Team';

      const res = await api.shareOperationalAsset({
        assetType,
        assetId,
        targetType: shareTargetType,
        targetId: selectedTargetId,
        targetName,
        message: message.trim() || undefined
      });

      setFeedback({
        type: 'success',
        message: shareTargetType === 'INDIVIDUAL'
          ? `Visual asset shared directly with ${targetName}! They can immediately add it to their workspace.`
          : `Asset staged in ${targetName}'s Resource Center for Checker testing and review.`
      });

      if (onShareSuccess) {
        onShareSuccess(res.share);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to share asset' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAssetIcon = () => {
    if (assetType === 'WORKFLOW') return <Workflow size={18} className="text-blue-600" />;
    if (assetType === 'VALIDATION_BOX') return <Box size={18} className="text-purple-600" />;
    return <Database size={18} className="text-emerald-600" />;
  };

  const getUserDisplayName = (user: UserType) => {
    const displayName = user.name || user.username || user.email || 'Unnamed user';
    const role = user.role ? String(user.role).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Operator';
    return `${displayName} • ${role}`;
  };

  const getTeamDisplayName = (team: Team) => team.name || 'Unnamed team';

  const selectedTargetLabel = shareTargetType === 'INDIVIDUAL'
    ? users.find(u => u.id === selectedTargetId) ? getUserDisplayName(users.find(u => u.id === selectedTargetId)!) : 'Select a teammate'
    : teams.find(t => t.id === selectedTargetId) ? getTeamDisplayName(teams.find(t => t.id === selectedTargetId)!) : 'Select a team';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[2px]">
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Share2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Share Operational Asset</h3>
              <p className="text-xs text-slate-500">Send to a teammate or team resource center</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleShareSubmit} className="p-5 sm:p-6 space-y-5">
          {/* Asset Preview Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start space-x-3.5">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200 shrink-0 shadow-sm">
              {getAssetIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900 truncate">{assetTitle}</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold uppercase border border-slate-200">
                  {assetType.replace('_', ' ')}
                </span>
              </div>
              {assetDescription && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{assetDescription}</p>
              )}
              {previewDetails && (
                <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-slate-600">
                  {previewDetails.category && (
                    <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
                      Category: <strong className="text-slate-900">{previewDetails.category}</strong>
                    </span>
                  )}
                  {previewDetails.stepCount !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
                      Steps: <strong className="text-slate-900">{previewDetails.stepCount}</strong>
                    </span>
                  )}
                  {previewDetails.dbTarget && (
                    <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200">
                      Target: <strong className="text-slate-900">{previewDetails.dbTarget}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Target Mode Toggle */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">
              Sharing Destination
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTargetTypeChange('INDIVIDUAL')}
                className={`flex items-center space-x-2.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  shareTargetType === 'INDIVIDUAL'
                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <User size={16} className={shareTargetType === 'INDIVIDUAL' ? 'text-blue-600' : 'text-slate-500'} />
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800">Teammate (Chat)</div>
                  <div className="text-[10px] text-slate-500 font-normal">1-click adoption</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTargetTypeChange('TEAM')}
                className={`flex items-center space-x-2.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  shareTargetType === 'TEAM'
                    ? 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Users size={16} className={shareTargetType === 'TEAM' ? 'text-purple-600' : 'text-slate-500'} />
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800">Team Resource Center</div>
                  <div className="text-[10px] text-slate-500 font-normal">Checker review flow</div>
                </div>
              </button>
            </div>
          </div>

          {/* Target Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {shareTargetType === 'INDIVIDUAL' ? 'Select Teammate' : 'Select Team'}
            </label>
            <select
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
            >
              {shareTargetType === 'INDIVIDUAL' ? (
                users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.username || u.email || 'Unnamed user'} • {u.role || 'Operator'}
                  </option>
                ))
              ) : (
                teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name || 'Unnamed team'}
                  </option>
                ))
              )}
            </select>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">Selected target:</span>
              <span className="ml-2 font-semibold text-slate-800">{selectedTargetLabel}</span>
            </div>
          </div>

          {/* Optional Message */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Testing Instructions / Note (Optional)
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={
                shareTargetType === 'INDIVIDUAL'
                  ? 'e.g., "Check this out for incident #ISS-102. You can add it to your studio and test it against your transactions."'
                  : 'e.g., "Ready for Checker hands-on testing on core settlement batches."'
              }
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors resize-none"
            />
          </div>

          {/* Feedback Alerts */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle size={16} className="shrink-0 text-rose-600" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Send size={13} />
              <span>{isSubmitting ? 'Sharing...' : 'Share Asset'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
