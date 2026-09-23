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
      <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-mono">
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        <span>Pre-Flight Check: Pipeline topology valid &amp; fully connected ({nodes.length} nodes, {connections.length} wires)</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start space-x-2.5 px-3 py-2 rounded-xl text-xs font-mono border transition-all ${
      hasErrors 
        ? 'bg-rose-950/50 border-rose-600/60 text-rose-200' 
        : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
    }`}>
      {hasErrors ? (
        <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
      )}
      <div className="space-y-1 flex-1">
        <div className="font-bold uppercase text-[10px] tracking-wider">
          {hasErrors ? 'Pipeline Validation Warning' : 'Topology Notice'}
        </div>
        <ul className="space-y-0.5 list-disc list-inside text-[11px] leading-relaxed">
          {issues.map((iss, idx) => (
            <li key={idx} className={iss.type === 'error' ? 'text-rose-300' : 'text-amber-300'}>
              {iss.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
