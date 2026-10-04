/**
 * DiagnosticReportMethod — §6.6 REPORT Validation Method
 *
 * Operational Goal: Non-mutating forensic lineage synthesis.
 * Conforms strictly to §2.1, §2.7 & §6.6:
 *   - Synthesizes forensic and diagnostic audit trails from context.lineageHistory.
 *   - Strictly non-mutating: never alters balances or mutates operational flags.
 *   - Zero external DB I/O.
 *   - Prohibited from emitting STOP on business logic.
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.7, §6.6
 */
export class DiagnosticReportMethod {
    id;
    targetDbId;
    targetTable;
    requiredInputKeys;
    constructor(step) {
        this.id = step.id;
        this.targetDbId = undefined;
        this.targetTable = undefined;
        this.requiredInputKeys = []; // Reads lineageHistory directly from execution context
    }
    async execute(context, _inputs) {
        const lineage = context.lineageHistory || [];
        const reportPayload = {
            reportGeneratedAt: new Date().toISOString(),
            stagesEvaluated: lineage.length,
            passCount: lineage.filter(r => r.validationResult === 'PASS').length,
            failCount: lineage.filter(r => r.validationResult === 'FAIL').length,
            errorCount: lineage.filter(r => r.validationResult === 'ERROR' || r.validationResult === 'PAUSED_DB_OFFLINE').length,
            isTainted: lineage.some(r => r.producedValues?._isDiagnosticOnly === true),
            lineageSummary: lineage.map(r => ({
                stageId: r.stageId,
                stageName: r.stageName,
                validationId: r.validationId,
                result: r.validationResult,
                action: r.pipelineAction,
                cardinalityStatus: r.cardinalityStatus,
            })),
        };
        return {
            context,
            mirrorTable: '',
            fetchedRowCount: 1,
            rawRows: [reportPayload],
        };
    }
}
