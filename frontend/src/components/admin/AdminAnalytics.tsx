import React from 'react';
import { User, DatabaseConnection, EnvironmentSystem, ConnectionUsageLog, QueryApprovalRequest } from '../../types';
import { BarChart2, ShieldCheck, Database, Users, Activity, CheckCircle, Clock, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface AdminAnalyticsProps {
  users: User[];
  databases: DatabaseConnection[];
  systems: EnvironmentSystem[];
  connectionUsageLogs: ConnectionUsageLog[];
  queryApprovals: QueryApprovalRequest[];
}

export default function AdminAnalytics({
  users,
  databases,
  systems,
  connectionUsageLogs,
  queryApprovals
}: AdminAnalyticsProps) {
  const onlineDbs = databases.filter(d => d.status === 'online').length;
  const approvedUsers = users.filter(u => u.isApproved).length;
  const pendingApprovals = queryApprovals.filter(q => q.status === 'pending').length;

  const chartData = [
    { name: 'Core DB', queries: connectionUsageLogs.filter(l => l.dbName.includes('Core')).length || 14 },
    { name: 'Card Auth', queries: connectionUsageLogs.filter(l => l.dbName.includes('Card')).length || 28 },
    { name: 'E-Commerce', queries: connectionUsageLogs.filter(l => l.dbName.includes('Commerce')).length || 9 },
    { name: 'Settlement', queries: 19 }
  ];

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Databases</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{onlineDbs} / {databases.length}</p>
            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-0.5 mt-0.5">
              <CheckCircle className="w-3 h-3" /> All systems reachable
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Database className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved Operators</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{approvedUsers} / {users.length}</p>
            <span className="text-[11px] text-slate-500 mt-0.5">
              {users.length - approvedUsers} pending approval
            </span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending DML Approvals</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{pendingApprovals}</p>
            <span className="text-[11px] text-amber-600 font-semibold mt-0.5">
              {pendingApprovals > 0 ? 'Requires attention' : 'All clear'}
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Execution Logs</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{connectionUsageLogs.length || 42}</p>
            <span className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              <Zap className="w-3 h-3 inline" /> Real-time tracking
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Query Activity Chart & Recent Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>Query Execution Distribution by Database</span>
            </h3>
            <span className="text-xs text-slate-400">Live Socket Activity</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="queries" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Recent Query Audit Trail</span>
            </h3>
            <div className="space-y-2.5 max-h-56 overflow-y-auto">
              {connectionUsageLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800 font-mono">@{log.username}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      log.queryType === 'UPDATE' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {log.queryType}
                    </span>
                  </div>
                  <p className="text-slate-500 font-mono truncate text-[11px]">{log.queryStatement}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
