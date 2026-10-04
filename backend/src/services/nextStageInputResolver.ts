/**
 * Next-Stage Input Resolver Service
 *
 * Implements the core architectural mandate of PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §4:
 * 1. Decouples Validation Result (PASS/FAIL) from data source selection.
 * 2. Preserves enriched mirror data when an upstream stage produces FAIL + CONTINUE.
 * 3. Resolves fallback data from the closest valid upstream ancestor in the DAG rather
 *    than blindly falling back to the raw task dataset.
 * 4. Halts with a controlled CONFIGURATION_ERROR if required keys cannot be satisfied.
 */

import {
  NextStageInputRequest,
  NextStageInputResolution,
  StageOutputContract,
  MultiRowCardinalityPolicy
} from '../types.js';

export class NextStageInputResolver {
  private static instance: NextStageInputResolver;

  public static getInstance(): NextStageInputResolver {
    if (!NextStageInputResolver.instance) {
      NextStageInputResolver.instance = new NextStageInputResolver();
    }
    return NextStageInputResolver.instance;
  }

  /**
   * Resolves the authoritative data source and key bindings for a downstream stage.
   */
  public resolveStageInput(request: NextStageInputRequest): NextStageInputResolution {
    const {
      targetStageId,
      targetStageName,
      requiredKeys,
      upstreamContracts,
      initialTaskDatasetTable,
      initialKeys = []
    } = request;

    const normalizedRequiredKeys = (requiredKeys || [])
      .map(k => String(k).trim().toLowerCase())
      .filter(Boolean);

    // If target stage requires no keys, it can consume the immediate predecessor or task dataset
    if (normalizedRequiredKeys.length === 0) {
      const immediatePred = upstreamContracts.length > 0 ? upstreamContracts[upstreamContracts.length - 1] : null;
      if (immediatePred && immediatePred.outputTarget?.tableName) {
        return {
          status: 'RESOLVED',
          resolvedSource: {
            sourceType: 'MIRROR_TABLE',
            tableName: immediatePred.outputTarget.tableName,
            joinKeys: [],
            stageExecutionId: immediatePred.stageExecutionId,
            stageId: immediatePred.stageId
          },
          inputQuality: immediatePred.validationResult === 'PASS' ? 'VERIFIED_CLEAN' : 'UPSTREAM_FAILED_BUT_HYDRATED',
          availableKeys: immediatePred.producedKeys || []
        };
      }

      return {
        status: 'RESOLVED',
        resolvedSource: {
          sourceType: 'TASK_DATASET',
          tableName: initialTaskDatasetTable || 'task_dataset_transactions',
          joinKeys: []
        },
        inputQuality: 'SYNTHETIC_FALLBACK',
        availableKeys: initialKeys
      };
    }

    // Helper: checks if a set of candidate keys contains all required keys
    const containsAllKeys = (candidateKeys: string[]): boolean => {
      const lowerCandidateSet = new Set(candidateKeys.map(k => k.trim().toLowerCase()));
      return normalizedRequiredKeys.every(rk => lowerCandidateSet.has(rk));
    };

    // Helper: builds join keys between source and target
    const buildJoinKeys = (sourceKeys: string[]): Array<{ sourceKey: string; targetKey: string }> => {
      const lowerSourceMap = new Map(sourceKeys.map(k => [k.trim().toLowerCase(), k]));
      return normalizedRequiredKeys.map(rk => ({
        sourceKey: lowerSourceMap.get(rk) || rk,
        targetKey: rk
      }));
    };

    // =========================================================================
    // TIER 1: Immediate Upstream Predecessor (Split-Stream & Enriched Mirror)
    // =========================================================================
    const immediatePredecessor = upstreamContracts.length > 0
      ? upstreamContracts[upstreamContracts.length - 1]
      : null;

    if (immediatePredecessor && immediatePredecessor.outputTarget?.tableName) {
      const predKeys = immediatePredecessor.producedKeys || [];
      if (containsAllKeys(predKeys)) {
        // Architectural Mandate: If FAIL but action is CONTINUE / REPORT, external row exists in mirror!
        const isClean = immediatePredecessor.validationResult === 'PASS';
        const isHydratedFail =
          immediatePredecessor.validationResult === 'FAIL' &&
          (immediatePredecessor.pipelineAction === 'CONTINUE' || immediatePredecessor.pipelineAction === 'REPORT');

        if (isClean || isHydratedFail) {
          return {
            status: 'RESOLVED',
            resolvedSource: {
              sourceType: 'MIRROR_TABLE',
              tableName: immediatePredecessor.outputTarget.tableName,
              joinKeys: buildJoinKeys(predKeys),
              stageExecutionId: immediatePredecessor.stageExecutionId,
              stageId: immediatePredecessor.stageId
            },
            inputQuality: isClean ? 'VERIFIED_CLEAN' : 'UPSTREAM_FAILED_BUT_HYDRATED',
            availableKeys: predKeys
          };
        }
      }
    }

    // =========================================================================
    // TIER 2: Closest Valid Upstream Ancestor in the DAG (Dynamic Lineage)
    // =========================================================================
    // If the immediate predecessor did not produce the keys (e.g. 404 Missing Ingress or Condition-Only),
    // walk backwards up the ancestor chain to find the closest valid hydrated mirror.
    if (upstreamContracts.length > 1) {
      const priorAncestors = upstreamContracts.slice(0, -1).reverse();
      for (const ancestor of priorAncestors) {
        if (ancestor.outputTarget?.tableName) {
          const ancestorKeys = ancestor.producedKeys || [];
          if (containsAllKeys(ancestorKeys)) {
            const isClean = ancestor.validationResult === 'PASS';
            return {
              status: 'RESOLVED',
              resolvedSource: {
                sourceType: 'UPSTREAM_PREDECESSOR',
                tableName: ancestor.outputTarget.tableName,
                joinKeys: buildJoinKeys(ancestorKeys),
                stageExecutionId: ancestor.stageExecutionId,
                stageId: ancestor.stageId
              },
              inputQuality: isClean ? 'VERIFIED_CLEAN' : 'UPSTREAM_FAILED_BUT_HYDRATED',
              availableKeys: ancestorKeys
            };
          }
        }
      }
    }

    // =========================================================================
    // TIER 3: Initial Task Ingress Dataset (Raw File Fallback)
    // =========================================================================
    if (initialKeys.length > 0 && containsAllKeys(initialKeys) && initialTaskDatasetTable) {
      return {
        status: 'RESOLVED',
        resolvedSource: {
          sourceType: 'TASK_DATASET',
          tableName: initialTaskDatasetTable,
          joinKeys: buildJoinKeys(initialKeys)
        },
        inputQuality: 'SYNTHETIC_FALLBACK',
        availableKeys: initialKeys
      };
    }

    // =========================================================================
    // TIER 4: Controlled Configuration Error (Fail-Fast, Zero Silent Guessing)
    // =========================================================================
    const allDiscoveredKeys = new Set<string>();
    upstreamContracts.forEach(c => (c.producedKeys || []).forEach(k => allDiscoveredKeys.add(k)));
    initialKeys.forEach(k => allDiscoveredKeys.add(k));

    const missingKeys = normalizedRequiredKeys.filter(rk => !Array.from(allDiscoveredKeys).some(dk => dk.toLowerCase() === rk));

    return {
      status: 'CONFIGURATION_ERROR',
      resolvedSource: {
        sourceType: 'TASK_DATASET',
        tableName: initialTaskDatasetTable || 'task_dataset_transactions',
        joinKeys: []
      },
      inputQuality: 'SYNTHETIC_FALLBACK',
      availableKeys: Array.from(allDiscoveredKeys),
      errorMessage:
        `Configuration Error: Unable to resolve required input keys [${missingKeys.join(', ')}] for stage ` +
        `'${targetStageName || targetStageId}'. None of the ${upstreamContracts.length} upstream stages or initial ` +
        `task dataset produce these keys. (Available keys: [${Array.from(allDiscoveredKeys).join(', ')}]).`
    };
  }
}

export const nextStageInputResolver = NextStageInputResolver.getInstance();
