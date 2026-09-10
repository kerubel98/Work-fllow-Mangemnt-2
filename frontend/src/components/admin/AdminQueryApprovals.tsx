import React, { useState } from 'react';
import { QueryApprovalRequest, DbAccessRequest } from '../../types';
import { 
  ShieldAlert, CheckCircle2, XCircle, Clock, 
  Database, User as UserIcon, Check, X, Server 
} from 'lucide-react';

interface AdminQueryApprovalsProps {
  queryApprovals: QueryApprovalRequest[];
  dbAccessRequests: DbAccessRequest[];
  onResolveQueryApproval: (id: string, status: 'approved' | 'rejected') => void;
  onResolveDbAccessRequest: (id: string, status: 'approved' | 'rejected') => void;
}

export default function AdminQueryApprovals({
  queryApprovals,
  dbAccessRequests,
  onResolveQueryApproval,
  onResolveDbAccessRequest
}: AdminQueryApprovalsProps) {
  const [activeTab, setActiveTab] = useState<'queries' | 'access'>('queries');

  const pendingQueryApprovals = queryApprovals.filter(q => q.status === 'pending');
  const resolvedQueryApprovals = queryApprovals.filter(q => q.status !== 'pending');

  const pendingAccessRequests = dbAccessRequests.filter(r => r.status === 'pending');
  const resolvedAccessRequests = dbAccessRequests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Governance & Approval Queue</h2>
          <p className="text-xs text-slate-500">Review production DML statements and database access requests</p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('queries')}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'queries' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            DML Approvals ({pendingQueryApprovals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('access')}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'access' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            DB Access Requests ({pendingAccessRequests.length})
          </button>
        </div>
      </div>

      {/* Query Approvals View */}
      {activeTab === 'queries' && (
        <div className="space-y-4">
          {pendingQueryApprovals.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">All DML query approval requests are resolved</p>
              <p className="text-xs text-slate-400 mt-0.5">No pending production queries awaiting review.</p>
            </div>
          ) : (
            pendingQueryApprovals.map((req) => (
              <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                      PENDING DML
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      System: <strong className="text-slate-800">{req.systemName}</strong> ({req.environment})
                    </span>
                    <span className="text-xs text-slate-400">
                      Requester: <strong className="text-slate-700">@{req.requesterName}</strong>
                    </span>
                  </div>

                  {req.issueTitle && (
                    <p className="text-xs text-slate-600">Linked Case: <strong className="text-slate-800">{req.issueTitle}</strong></p>
                  )}

                  <div className="p-2.5 bg-slate-900 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto shadow-inner">
                    <code>{req.query}</code>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onResolveQueryApproval(req.id, 'approved')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolveQueryApproval(req.id, 'rejected')}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* DB Access Requests View */}
      {activeTab === 'access' && (
        <div className="space-y-4">
          {pendingAccessRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No pending database access requests</p>
            </div>
          ) : (
            pendingAccessRequests.map((req) => (
              <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                      ACCESS REQUEST
                    </span>
                    <span className="text-xs text-slate-800 font-bold font-mono">
                      Target DB: {req.dbName}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                      Privilege: {req.requestedPrivilege}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    User: <strong className="text-slate-800 font-mono">@{req.username}</strong> ({req.userRole})
                  </p>
                  {req.reason && (
                    <p className="text-xs text-slate-500 italic">Reason: "{req.reason}"</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onResolveDbAccessRequest(req.id, 'approved')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Grant Access</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolveDbAccessRequest(req.id, 'rejected')}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Deny</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
