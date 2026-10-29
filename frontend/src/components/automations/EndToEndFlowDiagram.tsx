/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Upload, Database, GitBranch, Flag, Check, 
  Terminal, Zap, Layers, Inbox, Send, Lock, 
  ChevronRight, ArrowLeft
} from 'lucide-react';

interface EndToEndFlowDiagramProps {
  onBack?: () => void;
}

export function EndToEndFlowDiagram({ onBack }: EndToEndFlowDiagramProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto p-8 text-slate-800 text-xs" style={{ zoom: 0.85 }}>
      {/* Top Header matching 44_end_to_end_flow.png */}
      <div className="max-w-6xl mx-auto w-full space-y-1 mb-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 cursor-pointer"
          >
            <ArrowLeft size={13} />
            <span>Back</span>
          </button>
        )}
        <div className="text-xs font-semibold text-orange-600">
          IssueTrace · end to end
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          From a flagged case to an automated hashtag
        </h1>
        <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
          A solved case becomes a reusable workflow. It keeps the original process, collects every transaction that uses it, and reports back to the team that raised it.
        </p>
      </div>

      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* =================================================================== */}
        {/* CARD 1: Card Disputes & Chargebacks Unit / Original team builds    */}
        {/* =================================================================== */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">
              Card Disputes & Chargebacks Unit
            </div>
            <h2 className="text-sm font-bold text-slate-900">
              Original team builds the case
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
            {/* Step 1 */}
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <Upload size={14} className="text-slate-700" />
                <span>Ingest</span>
              </div>
              <p className="text-[11px] text-slate-500">Upload and clean the file</p>
            </div>

            {/* Step 2 */}
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <Database size={14} className="text-slate-700" />
                <span>Map data</span>
              </div>
              <p className="text-[11px] text-slate-500">Columns to global fields</p>
            </div>

            {/* Step 3 */}
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <GitBranch size={14} className="text-slate-700" />
                <span>Validate</span>
              </div>
              <p className="text-[11px] text-slate-500">Workflow flags 24 of 500</p>
            </div>

            {/* Step 4 (Highlighted Escalate) */}
            <div className="p-3.5 bg-orange-50/30 border-2 border-orange-500 rounded-xl space-y-1 relative shadow-2xs">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <Flag size={14} className="text-orange-500" />
                <span>Escalate</span>
              </div>
              <p className="text-[11px] text-slate-500">Lead signs, checker assigned</p>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CARD 2: Core Operations & Settlement Division / Technician solves it */}
        {/* =================================================================== */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">
              Core Operations & Settlement Division
            </div>
            <h2 className="text-sm font-bold text-slate-900">
              Technician solves it
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
            {/* Step 1 */}
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <Check size={14} className="text-slate-700" />
                <span>Stage task</span>
              </div>
              <p className="text-[11px] text-slate-500">Accept, assign technician</p>
            </div>

            {/* Step 2 */}
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <Terminal size={14} className="text-slate-700" />
                <span>Investigate</span>
              </div>
              <p className="text-[11px] text-slate-500">Sandbox, staging or production</p>
            </div>

            {/* Step 3 */}
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <Zap size={14} className="text-slate-700" />
                <span>Solution</span>
              </div>
              <p className="text-[11px] text-slate-500">Temporary solution or system fix</p>
            </div>

            {/* Step 4 (Highlighted Post hashtag) */}
            <div className="p-3.5 bg-orange-50/30 border-2 border-orange-500 rounded-xl space-y-1 relative shadow-2xs">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-xs">
                <span className="font-mono text-orange-500 font-bold">#</span>
                <span>Post hashtag</span>
              </div>
              <p className="text-[11px] text-slate-500">Checker approves, owner locks it</p>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CARD 3: Automation / The hashtag runs automatically                */}
        {/* =================================================================== */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">
              Automation
            </div>
            <h2 className="text-sm font-bold text-slate-900">
              The hashtag runs automatically
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
            {/* Step 1 */}
            <div className="p-3.5 bg-[#0F142A] text-white rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center space-x-1.5 font-bold text-xs">
                <Layers size={14} className="text-blue-400" />
                <span>Same process</span>
              </div>
              <p className="text-[11px] text-slate-300">Ingest, map, validate, solve</p>
            </div>

            {/* Step 2 */}
            <div className="p-3.5 bg-[#0F142A] text-white rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center space-x-1.5 font-bold text-xs">
                <Inbox size={14} className="text-emerald-400" />
                <span>Collects every transaction</span>
              </div>
              <p className="text-[11px] text-slate-300">All cases that use the hashtag</p>
            </div>

            {/* Step 3 */}
            <div className="p-3.5 bg-[#0F142A] text-white rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center space-x-1.5 font-bold text-xs">
                <Send size={14} className="text-amber-400" />
                <span>Reports to the original team</span>
              </div>
              <p className="text-[11px] text-slate-300">Weekly digest and every failure</p>
            </div>

            {/* Step 4 */}
            <div className="p-3.5 bg-[#0F142A] text-white rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center space-x-1.5 font-bold text-xs">
                <Lock size={14} className="text-purple-400" />
                <span>Only the owner edits</span>
              </div>
              <p className="text-[11px] text-slate-300">Others can view or request a change</p>
            </div>
          </div>
        </div>

        {/* Bottom Note matching 44_end_to_end_flow.png */}
        <div className="flex items-center space-x-2 text-xs text-slate-500 pt-1">
          <Lock size={13} className="text-slate-400" />
          <span>Locked means read only. The hashtag owner is the technician who created it.</span>
        </div>
      </div>
    </div>
  );
}

export default EndToEndFlowDiagram;
