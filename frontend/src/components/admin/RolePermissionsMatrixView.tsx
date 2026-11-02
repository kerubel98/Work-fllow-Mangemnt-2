/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Check } from 'lucide-react';

export function RolePermissionsMatrixView() {
  const roles = [
    {
      title: 'Administrator',
      subtitle: 'Everything, including connections and users.',
      sections: [
        { title: 'WORK', items: ['Cases', 'Intake', 'Automations'] },
        { title: 'COLLABORATE', items: ['Team', 'Messages'] },
        { title: 'INSIGHTS', items: ['Dashboard'] },
        { title: 'BUILD', items: ['Workflows', 'Rules', 'Query sandbox'] },
        { title: 'ADMIN', items: ['People & access', 'Connections', 'Data setup', 'Authority Center'] }
      ],
      rights: [
        'Run SELECT and approved DML',
        'Approve anything except own requests',
        'Edit hashtags they own'
      ]
    },
    {
      title: 'Manager',
      subtitle: 'Runs teams and approves their work.',
      sections: [
        { title: 'WORK', items: ['Cases', 'Intake', 'Automations'] },
        { title: 'COLLABORATE', items: ['Team', 'Messages'] },
        { title: 'INSIGHTS', items: ['Dashboard'] },
        { title: 'BUILD', items: ['Workflows', 'Rules'] },
        { title: 'ADMIN', items: ['Authority Center'] }
      ],
      rights: [
        'Approve team requests and escalations',
        'See team and cross-team KPIs',
        'No database connection changes'
      ]
    },
    {
      title: 'Technical',
      subtitle: 'Investigates and solves escalated cases.',
      sections: [
        { title: 'WORK', items: ['Cases', 'Intake', 'Automations'] },
        { title: 'COLLABORATE', items: ['Team', 'Messages'] },
        { title: 'INSIGHTS', items: ['Dashboard'] },
        { title: 'BUILD', items: ['Workflows', 'Rules', 'Query sandbox'] },
        { title: 'ADMIN', items: ['Data setup'] }
      ],
      rights: [
        'Sandbox and staging queries',
        'Post and own hashtags',
        'Production needs a checker'
      ]
    },
    {
      title: 'Operational',
      subtitle: 'Handles cases day to day.',
      sections: [
        { title: 'WORK', items: ['Cases', 'Intake', 'Automations'] },
        { title: 'COLLABORATE', items: ['Team', 'Messages'] },
        { title: 'INSIGHTS', items: ['Dashboard'] },
        { title: 'BUILD', items: ['Workflows', 'Rules'] }
      ],
      rights: [
        'Run validation and resolve cases',
        'Escalate to other teams',
        'Build items are read only'
      ]
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto text-slate-800 text-xs p-8" style={{ zoom: 0.9 }}>
      {/* Header */}
      <div>
        <div className="text-[11px] font-semibold text-slate-400">IssueTrace · access</div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
          What each role sees
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          The sidebar shows only what a role can use. An empty group is hidden, and a locked action explains why.
        </p>
      </div>

      {/* 4 Role Columns matching 60_roles_and_navigation.png */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
        {roles.map((r, idx) => (
          <div key={idx} className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">{r.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-5 min-h-[32px]">{r.subtitle}</p>

              {/* Mock Sidebar Container */}
              <div className="bg-[#0b1329] border border-slate-800/80 rounded-2xl p-4 text-[11px] space-y-3.5 shadow-inner">
                {r.sections.map((sec, sIdx) => (
                  <div key={sIdx}>
                    <div className="text-[9px] font-bold tracking-wider text-slate-500 uppercase">
                      {sec.title}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {sec.items.map((item, iIdx) => (
                        <div key={iIdx} className="text-slate-300 font-medium px-1.5 py-0.5 rounded hover:bg-slate-800/50">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rights Checklist */}
            <div className="mt-6 pt-5 border-t border-slate-100 space-y-2.5">
              {r.rights.map((right, rIdx) => (
                <div key={rIdx} className="flex items-start space-x-2 text-xs text-slate-700">
                  <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span>{right}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Checker Duty Notice matching 60_roles_and_navigation.png */}
      <div className="mt-8 p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex items-center space-x-3 text-xs text-slate-600">
        <ShieldCheck size={18} className="text-slate-500 shrink-0" />
        <div>
          <span className="font-bold text-slate-900">Checker is a duty, not a role.</span>{' '}
          Any person who did not make a request can check it, if their role allows approvals. This sheet is a proposal based on your four roles and the permissions in your report.
        </div>
      </div>
    </div>
  );
}

export default RolePermissionsMatrixView;

