import React from 'react';
import { FlowchartNode, FlowchartConnection } from '../../../types';
import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

interface WorkflowValidationSummaryProps {
  nodes: FlowchartNode[];
  connections: FlowchartConnection[];
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

export const WorkflowValidationSummary: React.FC<WorkflowValidationSummaryProps> = ({
  nodes,
  connections
}) => {
  const issues: ValidationIssue[] = [];

  // Check 1: Must have at least one START terminal node
  const startNodes = nodes.filter(n => n.type === 'START');
  if (startNodes.length === 0) {
    issues.push({ type: 'error', message: 'Missing Start Point: Flowchart requires at least one START terminal.' });
  }

  // Check 2: Must have at least one END terminal node
  const endNodes = nodes.filter(n => n.type === 'END');
  if (endNodes.length === 0) {
    issues.push({ type: 'error', message: 'Missing End Goal: Flowchart requires at least one END terminal.' });
  }

  // Check 3: Check for disconnected/orphan nodes
  const connectedNodeIds = new Set<string>();
  connections.forEach(c => {
    if (c.fromNodeId) connectedNodeIds.add(c.fromNodeId);
    if (c.toNodeId) connectedNodeIds.add(c.toNodeId);
  });

  const orphanNodes = nodes.filter(n => !connectedNodeIds.has(n.id) && nodes.length > 1);
  if (orphanNodes.length > 0) {
    issues.push({
      type: 'warning',
      message: `${orphanNodes.length} disconnected block(s): "${orphanNodes.map(n => n.name || n.id).join(', ')}" will be skipped during execution.`
    });
  }

  // Check 4: Check if validation box nodes have missing boxId
  const unconfiguredBoxes = nodes.filter(n => n.type === 'VALIDATION_BOX' && !n.boxId);
  if (unconfiguredBoxes.length > 0) {
    issues.push({
      type: 'warning',
      message: `${unconfiguredBoxes.length} unassigned block(s) require a bound validation rule.`
    });
  }

  const hasErrors = issues.some(i => i.type === 'error');
  const hasWarnings = issues.some(i => i.type === 'warning');

  if (issues.length === 0) {
    return (
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-800 text-xs font-sans shadow-2xs">
        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        <span className="font-medium">Pre-flight passed · {nodes.length} nodes, {connections.length} wires</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-2 rounded-xl text-xs font-sans border transition-all shadow-2xs ${
      hasErrors 
        ? 'bg-rose-50 border-rose-200 text-rose-800' 
        : 'bg-amber-50 border-amber-200 text-amber-800'
    }`}>
      {hasErrors ? (
        <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
      )}
      <div className="space-y-0.5 flex-1">
        <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">
          {hasErrors ? 'Pipeline Validation Warning' : 'Topology Notice'}
        </div>
        <ul className="space-y-0.5 list-disc list-inside text-[11px] leading-relaxed">
          {issues.map((iss, idx) => (
            <li key={idx} className={iss.type === 'error' ? 'text-rose-700' : 'text-amber-700'}>
              {iss.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
