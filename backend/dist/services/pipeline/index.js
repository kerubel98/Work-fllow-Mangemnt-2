/**
 * Pipeline Module — Public API
 *
 * Re-exports all pipeline architecture components for use by:
 *   - investigationEngine.ts (WAVE 3: orchestrator wiring)
 *   - investigationOrchestratorService.ts (gradual replacement)
 *   - Route handlers for workflow preview/sandbox endpoints
 *   - Unit tests
 *
 * Canonical entry point:
 *   import { workflowPipelineBuilder, ExecutablePipeline } from '../services/pipeline/index.js';
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §3.1
 */
// Core execution classes
export { ExecutablePipeline, ExecutableStage } from './ExecutablePipeline.js';
// Builder (Compiler)
export { WorkflowPipelineBuilder, workflowPipelineBuilder } from './WorkflowPipelineBuilder.js';
// Reconciliation Engine
export { ReconciliationEngine } from './ReconciliationEngine.js';
// Input Resolver
export { NextStageInputResolver } from './NextStageInputResolver.js';
// Coordinate Injector (VALUES Ingress §8.2)
export { coordinateInjector } from './CoordinateInjector.js';
// Canonical Validation Methods (§6)
export { IngestionSearchMethod, ConditionCheckMethod, ReconciliationMethod, DiagnosticReportMethod, } from './methods/index.js';
