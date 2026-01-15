/**
 * Refinement Service
 *
 * Service that uses Claude Agent SDK to automatically fix code issues
 * identified during review. Applies targeted fixes, validates changes,
 * and tracks refinement iterations.
 */

import path from 'path';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { createLogger, isAbortError, loadContextFiles } from '@automaker/utils';
import type {
  ReviewIssue,
  ReviewResult,
  RefinementResult,
  ReviewIssueSeverity,
  Feature,
  ReviewLoopConfig,
} from '@automaker/types';
import { DEFAULT_REVIEW_LOOP_CONFIG } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import { ReviewLoopEventEmitter, createReviewLoopEventEmitter } from './review-loop-events.js';
import {
  buildFeedbackFixerSystemPrompt,
  buildFeedbackFixerUserPrompt,
  filterIssuesBySeverity,
  DEFAULT_FEEDBACK_FIXER_CONFIG,
  type FeedbackFixerConfig,
} from '@automaker/prompts';
import * as secureFs from '../lib/secure-fs.js';
import { isSeverityAtOrAbove } from './quality-gate-evaluator.js';

const logger = createLogger('RefinementService');

// Environment variables allowed for SDK
const ALLOWED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LANG',
  'LC_ALL',
];

/**
 * Build environment for the SDK with only explicitly allowed variables
 */
function buildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of ALLOWED_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

/**
 * Options for refining code
 */
export interface RefineCodeOptions {
  /** Feature ID being refined */
  featureId: string;
  /** Path to the worktree where code is located */
  worktreePath: string;
  /** Review result containing issues to address */
  reviewResult: ReviewResult;
  /** Feature metadata */
  feature: Feature;
  /** Review loop configuration */
  config?: ReviewLoopConfig;
  /** Feedback fixer configuration */
  fixerConfig?: FeedbackFixerConfig;
  /** Optional abort controller for cancellation */
  abortController?: AbortController;
  /** Model to use for refinement (defaults to claude-sonnet-4) */
  model?: string;
}

/**
 * Refinement iteration state for tracking progress
 */
interface RefinementIteration {
  /** Iteration number (1-based) */
  iteration: number;
  /** Issues that were targeted for fixing */
  targetedIssues: ReviewIssue[];
  /** Issues that were successfully addressed */
  addressedIssueIds: string[];
  /** Issues that could not be addressed */
  unaddressedIssueIds: string[];
  /** Any new issues introduced during refinement */
  newIssuesIntroduced: ReviewIssue[];
  /** Notes from the refinement process */
  notes: string;
  /** ISO timestamp when refinement started */
  startedAt: string;
  /** ISO timestamp when refinement completed */
  completedAt?: string;
}

/**
 * Refinement Service
 *
 * Uses Claude Agent SDK to automatically fix code issues identified
 * during review. The service applies targeted fixes based on review
 * feedback while preserving existing functionality.
 */
export class RefinementService {
  private events: EventEmitter;
  private eventEmitter: ReviewLoopEventEmitter;
  private iterations = new Map<string, RefinementIteration[]>();

  constructor(events: EventEmitter) {
    this.events = events;
    this.eventEmitter = createReviewLoopEventEmitter(events);
  }

  /**
   * Refine code based on review feedback
   *
   * This is the main entry point for code refinement. It takes a review result
   * containing issues and uses Claude Agent SDK to apply targeted fixes.
   *
   * @param options - Refinement options including feature, worktree path, and issues
   * @returns RefinementResult with addressed/unaddressed issues and notes
   */
  async refineCode(options: RefineCodeOptions): Promise<RefinementResult> {
    const {
      featureId,
      worktreePath,
      reviewResult,
      feature,
      config = DEFAULT_REVIEW_LOOP_CONFIG,
      fixerConfig = DEFAULT_FEEDBACK_FIXER_CONFIG,
      abortController,
      model = 'claude-sonnet-4-20250514',
    } = options;

    logger.info(
      `Starting refinement for feature ${featureId}: ${reviewResult.issues.length} issues to address`
    );

    // Filter issues based on severity threshold
    const issuesToAddress = filterIssuesBySeverity(
      reviewResult.issues,
      fixerConfig.severityThreshold
    );

    // Limit issues per iteration if configured
    const limitedIssues = issuesToAddress.slice(0, fixerConfig.maxIssuesPerIteration);

    if (limitedIssues.length === 0) {
      logger.info(`No issues to address for feature ${featureId} (all below severity threshold)`);
      return {
        addressedIssueIds: [],
        unaddressedIssueIds: reviewResult.issues.map((i) => i.id),
        newIssuesIntroduced: [],
        notes: 'No issues met the severity threshold for automatic refinement.',
      };
    }

    // Emit refinement started event
    this.eventEmitter.emitRefinementStarted(featureId, reviewResult.iteration, limitedIssues);

    // Track this iteration
    const iterationState: RefinementIteration = {
      iteration: reviewResult.iteration,
      targetedIssues: limitedIssues,
      addressedIssueIds: [],
      unaddressedIssueIds: [],
      newIssuesIntroduced: [],
      notes: '',
      startedAt: new Date().toISOString(),
    };

    try {
      // Get feature title - use ID as fallback
      const featureTitle = feature.title ?? featureId;

      // Load context files from the worktree
      const contextResult = await loadContextFiles({
        projectPath: worktreePath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
        taskContext: {
          title: featureTitle,
          description: feature.description ?? '',
        },
      });

      // Build system prompt with optional examples
      const systemPrompt = buildFeedbackFixerSystemPrompt(fixerConfig.includeExamples);

      // Build user prompt with issues to address
      const userPrompt = buildFeedbackFixerUserPrompt(
        featureId,
        featureTitle,
        limitedIssues,
        feature.description ?? undefined
      );

      // Combine context with prompts
      const combinedSystemPrompt = contextResult?.formattedPrompt
        ? `${contextResult.formattedPrompt}\n\n${systemPrompt}`
        : systemPrompt;

      // Build Claude SDK options
      const sdkOptions: Options = {
        model,
        systemPrompt: combinedSystemPrompt,
        maxTurns: 50, // Allow sufficient turns for multi-file fixes
        cwd: worktreePath,
        env: buildEnv(),
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController,
      };

      // Execute refinement via Claude Agent SDK
      logger.info(`Executing refinement with ${limitedIssues.length} issues...`);

      let fullResponse = '';
      let assistantResponse = '';
      const stream = query({ prompt: userPrompt, options: sdkOptions });

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              // Accumulate all assistant text blocks
              assistantResponse += block.text;
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          // Use result as the final response, but prefer assistant response if it's more substantial
          // (result is often just a summary, while assistant response contains detailed fix explanations)
          fullResponse = msg.result;
        }
      }

      // Prefer the assistant response if it's more substantial (contains more details about fixes)
      if (assistantResponse.length > fullResponse.length) {
        fullResponse = assistantResponse;
      }

      // Parse the response to determine which issues were addressed
      const { addressedIds, unaddressedIds, notes } = this.parseRefinementResponse(
        fullResponse,
        limitedIssues
      );

      iterationState.addressedIssueIds = addressedIds;
      iterationState.unaddressedIssueIds = unaddressedIds;
      iterationState.notes = notes;
      iterationState.completedAt = new Date().toISOString();

      // Store iteration state
      const featureIterations = this.iterations.get(featureId) || [];
      featureIterations.push(iterationState);
      this.iterations.set(featureId, featureIterations);

      // Save refinement result to disk
      await this.saveRefinementResult(featureId, worktreePath, iterationState);

      // Emit refinement completed event
      this.eventEmitter.emitRefinementCompleted(featureId, addressedIds, unaddressedIds);

      logger.info(
        `Refinement completed for feature ${featureId}: ${addressedIds.length} addressed, ${unaddressedIds.length} unaddressed`
      );

      return {
        addressedIssueIds: addressedIds,
        unaddressedIssueIds: unaddressedIds,
        newIssuesIntroduced: [],
        notes,
      };
    } catch (error) {
      if (isAbortError(error)) {
        logger.info(`Refinement aborted for feature ${featureId}`);
        throw error;
      }

      logger.error(`Refinement failed for feature ${featureId}:`, error);

      iterationState.notes = `Refinement failed: ${(error as Error).message}`;
      iterationState.unaddressedIssueIds = limitedIssues.map((i) => i.id);
      iterationState.completedAt = new Date().toISOString();

      // Store failed iteration
      const featureIterations = this.iterations.get(featureId) || [];
      featureIterations.push(iterationState);
      this.iterations.set(featureId, featureIterations);

      throw error;
    }
  }

  /**
   * Check if refinement addressed all blocking issues
   *
   * @param originalIssues - Original issues from review
   * @param addressedIds - IDs of issues that were addressed
   * @param severityThreshold - Severity threshold for blocking issues
   * @returns true if all blocking issues were addressed
   */
  evaluateRefinement(
    originalIssues: ReviewIssue[],
    addressedIds: string[],
    severityThreshold: ReviewIssueSeverity
  ): boolean {
    const blockingIssues = originalIssues.filter((issue) =>
      isSeverityAtOrAbove(issue.severity, severityThreshold)
    );

    const unaddressedBlockingIssues = blockingIssues.filter(
      (issue) => !addressedIds.includes(issue.id)
    );

    if (unaddressedBlockingIssues.length === 0) {
      logger.info(`All ${blockingIssues.length} blocking issues were addressed`);
      return true;
    }

    logger.warn(
      `${unaddressedBlockingIssues.length} blocking issues remain unaddressed:`,
      unaddressedBlockingIssues.map((i) => `${i.id} (${i.severity}): ${i.description.slice(0, 50)}`)
    );

    return false;
  }

  /**
   * Get refinement history for a feature
   *
   * @param featureId - Feature ID
   * @returns Array of refinement iterations
   */
  getRefinementHistory(featureId: string): RefinementIteration[] {
    return this.iterations.get(featureId) || [];
  }

  /**
   * Clear refinement history for a feature
   *
   * @param featureId - Feature ID
   */
  clearRefinementHistory(featureId: string): void {
    this.iterations.delete(featureId);
    logger.info(`Cleared refinement history for feature ${featureId}`);
  }

  /**
   * Load refinement history from disk
   *
   * @param featureId - Feature ID
   * @param projectPath - Path to the project
   * @returns Array of refinement iterations
   */
  async loadRefinementHistory(
    featureId: string,
    projectPath: string
  ): Promise<RefinementIteration[]> {
    const historyFile = path.join(
      projectPath,
      '.automaker',
      'features',
      featureId,
      'refinement-history.json'
    );

    try {
      const data = (await secureFs.readFile(historyFile, 'utf-8')) as string;
      const history = JSON.parse(data) as RefinementIteration[];
      this.iterations.set(featureId, history);
      return history;
    } catch {
      return [];
    }
  }

  /**
   * Parse the refinement response to extract addressed/unaddressed issues
   */
  private parseRefinementResponse(
    response: string,
    issues: ReviewIssue[]
  ): {
    addressedIds: string[];
    unaddressedIds: string[];
    notes: string;
  } {
    const addressedIds: string[] = [];
    const unaddressedIds: string[] = [];
    const notes: string[] = [];

    // Look for explicit mentions of issue IDs in the response
    for (const issue of issues) {
      // Check if the issue ID is mentioned in the response
      const isAddressed = this.isIssueAddressed(response, issue);

      if (isAddressed) {
        addressedIds.push(issue.id);
      } else {
        unaddressedIds.push(issue.id);
      }
    }

    // Extract any summary or notes from the response
    const summaryMatch = response.match(
      /## (?:Summary|Fixes Applied|Changes Made)[\s\S]*?(?=##|$)/i
    );
    if (summaryMatch) {
      notes.push(summaryMatch[0].trim());
    }

    // If no explicit issue tracking, assume all were addressed if response is substantial
    if (addressedIds.length === 0 && unaddressedIds.length === issues.length) {
      // If the response is substantial (code changes were made), assume issues were addressed
      if (response.length > 500 && !response.toLowerCase().includes('could not')) {
        logger.info(
          'No explicit issue tracking found, inferring all issues addressed based on response'
        );
        return {
          addressedIds: issues.map((i) => i.id),
          unaddressedIds: [],
          notes: notes.join('\n') || 'Changes applied based on review feedback.',
        };
      }
    }

    return {
      addressedIds,
      unaddressedIds,
      notes: notes.join('\n') || 'Refinement completed.',
    };
  }

  /**
   * Check if an issue was addressed in the response
   */
  private isIssueAddressed(response: string, issue: ReviewIssue): boolean {
    const lowerResponse = response.toLowerCase();
    const lowerDescription = issue.description.toLowerCase();

    // Check for explicit issue ID mention with positive indicators
    if (response.includes(issue.id)) {
      // Check if it's marked as addressed, fixed, resolved
      const issueContext = response.substring(
        Math.max(0, response.indexOf(issue.id) - 100),
        Math.min(response.length, response.indexOf(issue.id) + 200)
      );
      const lowerContext = issueContext.toLowerCase();

      if (
        lowerContext.includes('fixed') ||
        lowerContext.includes('addressed') ||
        lowerContext.includes('resolved') ||
        lowerContext.includes('applied') ||
        lowerContext.includes('updated') ||
        lowerContext.includes('changed')
      ) {
        return true;
      }

      // If explicitly marked as not addressed
      if (
        lowerContext.includes('could not') ||
        lowerContext.includes('cannot') ||
        lowerContext.includes('not addressed') ||
        lowerContext.includes('skipped')
      ) {
        return false;
      }
    }

    // Check if the description keywords are mentioned with fix indicators
    const keyWords = lowerDescription.split(' ').filter((w) => w.length > 4);
    const matchedKeywords = keyWords.filter((keyword) => lowerResponse.includes(keyword));

    // If most keywords are mentioned and there are fix indicators
    if (matchedKeywords.length > keyWords.length * 0.5) {
      if (
        lowerResponse.includes('fixed') ||
        lowerResponse.includes('addressed') ||
        lowerResponse.includes('resolved')
      ) {
        return true;
      }
    }

    // Default: assume not addressed if we can't determine
    return false;
  }

  /**
   * Save refinement result to disk
   */
  private async saveRefinementResult(
    featureId: string,
    worktreePath: string,
    iteration: RefinementIteration
  ): Promise<void> {
    const featureDir = path.join(worktreePath, '.automaker', 'features', featureId);

    try {
      await secureFs.mkdir(featureDir, { recursive: true });

      // Load existing history
      const historyFile = path.join(featureDir, 'refinement-history.json');
      let history: RefinementIteration[] = [];

      try {
        const existingData = (await secureFs.readFile(historyFile, 'utf-8')) as string;
        history = JSON.parse(existingData);
      } catch {
        // No existing history
      }

      // Add new iteration
      history.push(iteration);

      // Save updated history
      await secureFs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');

      logger.info(`Saved refinement iteration ${iteration.iteration} for feature ${featureId}`);
    } catch (error) {
      logger.error(`Failed to save refinement result for feature ${featureId}:`, error);
    }
  }
}

/**
 * Factory function to create a RefinementService instance
 */
export function createRefinementService(events: EventEmitter): RefinementService {
  return new RefinementService(events);
}

/**
 * Singleton instance for convenience
 */
let refinementServiceInstance: RefinementService | null = null;

/**
 * Get or create the singleton RefinementService instance
 */
export function getRefinementService(events?: EventEmitter): RefinementService | null {
  if (!refinementServiceInstance && events) {
    refinementServiceInstance = createRefinementService(events);
  }
  return refinementServiceInstance;
}
