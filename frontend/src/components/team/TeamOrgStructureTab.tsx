/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, Users, ArrowUpRight, GitBranch, ArrowDown, 
  ArrowRight, Shield, Check, Calendar, ChevronRight
} from 'lucide-react';
import { Team, User } from '../../types';

export interface TeamOrgStructureTabProps {
  currentTeam?: Team;
  currentUser?: User;
  onDefineRelationship?: () => void;
}

export function TeamOrgStructureTab({
  currentTeam,
  currentUser,
  onDefineRelationship
}: TeamOrgStructureTabProps) {
  const [isDefineModalOpen, setIsDefineModalOpen] = useState(false);
  const [relType, setRelType] = useState<'ESCALATION' | 'PEER' | 'PARENT' | 'CHILD'>('ESCALATION');
  const [targetTeam, setTargetTeam] = useState('Core Operations & Settlement Division');

  const teamName = currentTeam?.name || 'Card Disputes & Chargebacks Unit';
  const teamLead = currentTeam?.lead || '@manager_alex';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden text-slate-800 text-xs" style={{ zoom: 0.9 }}>
      {/* Title & Metric Row */}
      <div className="px-8 pt-6 pb-5 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Org structure and links between teams
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Escalations from this team go to its escalation target by default.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDefineModalOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
          >
            <Plus size={14} />
            <span>Define relationship</span>
          </button>
        </div>

        {/* 4 Metric Cards matching 58_org_structure.png */}
        <div className="grid grid-cols-4 gap-4 mt-5">
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
            <div className="text-[11px] font-medium text-slate-500">Hierarchy links</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">1</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Parent and sub-units</div>
          </div>

          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
            <div className="text-[11px] font-medium text-slate-500">Escalation links</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">1</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Where escalations go</div>
          </div>

          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
            <div className="text-[11px] font-medium text-slate-500">Data pipelines</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">0</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Upstream and downstream</div>
          </div>

          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
            <div className="text-[11px] font-medium text-slate-500">Peer units</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">1</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Lateral collaborators</div>
          </div>
        </div>
      </div>

      {/* Main Area: Visual Diagram (Left) + Relationships List (Right) */}
      <div className="flex-1 px-8 pb-8 min-h-0 flex space-x-6 overflow-hidden">
        {/* Canvas Diagram matching 58_org_structure.png */}
        <div className="flex-1 bg-white border border-slate-200/80 rounded-3xl p-8 relative flex flex-col justify-between overflow-auto shadow-xs">
          {/* Subtle dot matrix grid background */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }}
          />

          <div className="relative z-10 flex flex-col items-center justify-between h-full py-4">
            {/* Top Node: Parent department */}
            <div className="w-80 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col">
              <div className="font-bold text-slate-900 text-sm">Digital Operations</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Parent department · lead @kir_tech · 1 member
              </div>
            </div>

            {/* Down Connector */}
            <div className="flex flex-col items-center my-2">
              <div className="h-6 w-px bg-slate-200" />
              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-medium text-slate-500">
                Reports to
              </span>
              <div className="h-6 w-px bg-slate-200" />
            </div>

            {/* Middle Row: Current Team + Escalation Link + Target Division */}
            <div className="w-full flex items-center justify-center space-x-12">
              {/* Current Team (Active Orange Border) */}
              <div className="w-80 p-4 bg-white border-2 border-[#F97316] rounded-2xl shadow-sm flex flex-col">
                <div className="font-bold text-slate-900 text-sm">{teamName}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  This team · lead {teamLead}
                </div>
              </div>

              {/* Horizontal Connecting Lines */}
              <div className="flex flex-col items-center space-y-3">
                {/* Escalation Link (Orange) */}
                <div className="flex items-center space-x-1.5">
                  <div className="w-16 h-0.5 bg-[#F97316]" />
                  <span className="px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200/60 rounded text-[10px] font-semibold">
                    Escalation
                  </span>
                  <div className="w-16 h-0.5 bg-[#F97316]" />
                </div>

                {/* Peer Link (Dashed) */}
                <div className="flex items-center space-x-1.5">
                  <div className="w-16 border-t-2 border-dashed border-slate-300" />
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                    Peer
                  </span>
                  <div className="w-16 border-t-2 border-dashed border-slate-300" />
                </div>
              </div>

              {/* Target Division */}
              <div className="w-80 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col">
                <div className="font-bold text-slate-900 text-sm">Core Operations & Settlement Division</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Lead @manager_alex · 3 members
                </div>
              </div>
            </div>

            {/* Bottom Subordinate Placeholder */}
            <div className="mt-8 w-80 p-4 border border-dashed border-slate-300 rounded-2xl text-center bg-slate-50/50">
              <div className="font-bold text-slate-600 text-xs">(add a unit)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Subordinate units appear here</div>
            </div>
          </div>
        </div>

        {/* Right Panel: Relationships List matching 58_org_structure.png */}
        <div className="w-96 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col shrink-0 overflow-y-auto">
          <h3 className="font-bold text-slate-900 text-sm tracking-tight mb-4">
            Relationships
          </h3>

          <div className="space-y-4 text-xs divide-y divide-slate-100">
            {/* 1. Escalation Target */}
            <div className="pt-2 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200/60 rounded font-semibold text-[10px]">
                  Escalation target
                </span>
                <span className="text-[11px] text-slate-400">19 Sep 2026</span>
              </div>
              <div className="font-bold text-slate-900 text-xs mt-1.5">
                Core Operations & Settlement Division
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Escalation target for disputed transaction settlements and policy exceptions.
              </p>
            </div>

            {/* 2. Peer collaborator */}
            <div className="pt-4">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-[10px]">
                  Peer collaborator
                </span>
                <span className="text-[11px] text-slate-400">18 Sep 2026</span>
              </div>
              <div className="font-bold text-slate-900 text-xs mt-1.5">
                Core Operations & Settlement Division
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                No SLA or notes added.
              </p>
            </div>

            {/* 3. Parent department */}
            <div className="pt-4">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-[10px]">
                  Parent department
                </span>
                <span className="text-[11px] text-slate-400">18 Sep 2026</span>
              </div>
              <div className="font-bold text-slate-900 text-xs mt-1.5">
                Digital Operations
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                No SLA or notes added.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamOrgStructureTab;

