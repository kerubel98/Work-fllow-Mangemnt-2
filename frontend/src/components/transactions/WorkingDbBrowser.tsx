import React, { useState, useEffect } from 'react';
import { Database, Search, Download, Trash2, RefreshCw, Layers } from 'lucide-react';
import { api } from '../../api/client';
import * as XLSX from 'xlsx';

interface WorkingDbBrowserProps {
  onImportToCase?: (record: any) => void;
}

export default function WorkingDbBrowser({ onImportToCase }: WorkingDbBrowserProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.getWorkingDbTransactions({
        search: searchTerm || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        limit: 100
      });
      setTransactions(res.transactions || []);
      setTotalCount(res.totalCount || 0);
    } catch (err) {
      console.warn('Could not fetch working db transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions();
  };

  const handleClearWorkingDb = async () => {
    if (!confirm('Are you sure you want to clear all working database transaction records?')) return;
    try {
      await api.clearWorkingDb();
      setTransactions([]);
      setTotalCount(0);
    } catch (err) {
      console.warn('Could not clear working db:', err);
    }
  };

  const handleExportExcel = () => {
    if (transactions.length === 0) return;
    const flatRows = transactions.map(t => ({
      ID: t.id,
      Batch: t.batchId,
      File: t.sourceFilename,
      Uploader: t.uploadedBy,
      ...t.mappedData
    }));
    const ws = XLSX.utils.json_to_sheet(flatRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Working_Transactions');
    XLSX.writeFile(wb, `Working_Database_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Working Transaction Repository</h2>
            <p className="text-xs text-slate-500">{totalCount} total loaded batch records</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search txn ID, card, email..."
              className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </form>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="SETTLED">SETTLED</option>
            <option value="REVERSED">REVERSED</option>
            <option value="DECLINED">DECLINED</option>
            <option value="CHARGEBACK">CHARGEBACK</option>
          </select>

          <button
            type="button"
            onClick={fetchTransactions}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={transactions.length === 0}
            className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-semibold flex items-center gap-1 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={handleClearWorkingDb}
            className="text-xs px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-semibold flex items-center gap-1 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Grid Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Txn ID</th>
                <th className="px-3 py-2.5">Card Number</th>
                <th className="px-3 py-2.5">Amount</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Customer Email</th>
                <th className="px-3 py-2.5">Batch / File</th>
                <th className="px-3 py-2.5">Auth Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans">
                    No transactions found in working database.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const m = t.mappedData || {};
                  const status = String(m.status || m.status_state || 'PENDING').toUpperCase();

                  return (
                    <tr key={t.id} className="hover:bg-blue-50/40 transition">
                      <td className="px-3 py-2 font-bold text-slate-900">{m.transaction_id || t.id}</td>
                      <td className="px-3 py-2">{m.card_number || '•••• •••• •••• ••••'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">${Number(m.amount_usd || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                          status === 'SETTLED' ? 'bg-emerald-100 text-emerald-700' :
                          status === 'REVERSED' ? 'bg-purple-100 text-purple-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 truncate max-w-xs">{m.customer_email || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-[11px] truncate max-w-xs">{t.sourceFilename || t.batchId}</td>
                      <td className="px-3 py-2 text-slate-400 text-[11px]">{m.auth_time || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
