/**
 * PR Feedback Monitor Service
 *
 * Polls GitHub PRs for new comments and reviews using GitHub CLI.
 * Detects changes, fetches new feedback, and triggers analysis when
 * new comments are detected.
 */

import { createLogger } from '@automaker/utils';
import type {
  PRFeedbackMonitorConfig,
  MonitoredPRState,
  PRFeedbackMonitorEvent,
  PRFeedback,
  PRComment,
  PRReview,
  ChecksStatus,
  DEFAULT_PR_FEEDBACK_MONITOR_CONFIG,
} from '@automaker/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { EventEmitter } from '../lib/events.js';
import { execEnv, isGhCliAvailable } from '../routes/worktree/common.js';

const logger = createLogger('PRFeedbackMonitor');
const execAsync = promisify(exec);

/**
 * Options for starting PR monitoring
 */
export interface StartMonitoringOptions {
  /** Feature ID associated with this PR */
  featureId: string;
  /** Path to the project */
  projectPath: string;
  /** PR number to monitor */
  prNumber: number;
  /** PR URL */
  prUrl: string;
  /** Branch name */
  branch: string;
  /** Path to the worktree (optional) */
  worktreePath?: string;
  /** Custom poll interval in ms (optional) */
  pollIntervalMs?: number;
}

/**
 * GitHub PR data from gh CLI
 */
interface GitHubPRData {
  number: number;
  title: string;
  state: string;
  mergeable: string | null;
  mergeStateStatus: string;
  comments: GitHubComment[];
  reviews: GitHubReview[];
  statusCheckRollup?: GitHubStatusCheck[];
}

interface GitHubComment {
  id: number;
  author: { login: string; is_bot?: boolean };
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
}

interface GitHubReview {
  id: number;
  author: { login: string };
  state: string;
  body?: string;
  submittedAt: string;
  comments?: {
    nodes?: GitHubReviewComment[];
  };
}

interface GitHubReviewComment {
  id: number;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
}

interface GitHubStatusCheck {
  context: string;
  state: string;
  conclusion?: string;
}

/**
 * PR Feedback Monitor Service
 *
 * Monitors GitHub PRs for new comments and reviews, detecting changes
 * and emitting events when new feedback is received.
 */
export class PRFeedbackMonitor {
  private monitoredPRs = new Map<string, MonitoredPRState>();
  private monitoringLoops = new Map<string, AbortController>();
  private events: EventEmitter;
  private config: PRFeedbackMonitorConfig;
  private isRunning = false;

  constructor(events: EventEmitter, config?: Partial<PRFeedbackMonitorConfig>) {
    this.events = events;
    this.config = {
      enabled: true,
      pollIntervalMs: 30000,
      maxConcurrentPRs: 10,
      notifyOnNewComments: true,
      notifyOnReviewRequested: true,
      ...config,
    };
  }

  /**
   * Start monitoring a PR for new feedback
   */
  async startMonitoring(options: StartMonitoringOptions): Promise<void> {
    const { featureId, projectPath, prNumber, prUrl, branch, worktreePath, pollIntervalMs } =
      options;

    // Check if already monitoring this feature
    if (this.monitoredPRs.has(featureId)) {
      logger.warn(`Already monitoring PR for feature ${featureId}`);
      return;
    }

    // Check max concurrent PRs
    if (this.monitoredPRs.size >= this.config.maxConcurrentPRs) {
      const errorMsg = `Maximum concurrent PR monitors reached (${this.config.maxConcurrentPRs})`;
      logger.error(errorMsg);
      this.emitEvent({
        type: 'pr_monitor_error',
        featureId,
        prNumber,
        error: errorMsg,
        stage: 'fetch',
      });
      return;
    }

    // Check if gh CLI is available
    const ghAvailable = await isGhCliAvailable();
    if (!ghAvailable) {
      const errorMsg = 'GitHub CLI (gh) is not available';
      logger.error(errorMsg);
      this.emitEvent({
        type: 'pr_monitor_error',
        featureId,
        prNumber,
        error: errorMsg,
        stage: 'fetch',
      });
      return;
    }

    // Create initial state
    const state: MonitoredPRState = {
      featureId,
      prNumber,
      prUrl,
      projectPath,
      worktreePath,
      branch,
      lastChecked: new Date().toISOString(),
      lastCommentCount: 0,
      lastReviewCount: 0,
      checksStatus: 'pending',
      requestedChanges: false,
      mergeable: false,
      status: 'active',
      startedAt: new Date().toISOString(),
    };

    // Fetch initial PR state
    try {
      const feedback = await this.fetchPRFeedback(state);
      state.lastCommentCount = feedback.comments.length;
      state.lastReviewCount = feedback.reviews.length;
      state.checksStatus = feedback.checksStatus;
      state.requestedChanges = feedback.requestedChanges;
      state.mergeable = feedback.mergeable;
    } catch (error) {
      logger.error(`Failed to fetch initial PR state for ${prNumber}:`, error);
      this.emitEvent({
        type: 'pr_monitor_error',
        featureId,
        prNumber,
        error: error instanceof Error ? error.message : String(error),
        stage: 'fetch',
      });
      return;
    }

    // Store state and start monitoring loop
    this.monitoredPRs.set(featureId, state);

    const abortController = new AbortController();
    this.monitoringLoops.set(featureId, abortController);

    // Emit started event
    this.emitEvent({
      type: 'pr_monitor_started',
      featureId,
      prNumber,
      prUrl,
    });

    logger.info(`Started monitoring PR #${prNumber} for feature ${featureId}`);

    // Start the monitoring loop
    this.runMonitoringLoop(
      featureId,
      pollIntervalMs || this.config.pollIntervalMs,
      abortController
    ).catch((error) => {
      logger.error(`Monitoring loop error for feature ${featureId}:`, error);
    });
  }

  /**
   * Stop monitoring a PR
   */
  async stopMonitoring(
    featureId: string,
    reason: 'completed' | 'cancelled' | 'error' | 'merged' = 'cancelled'
  ): Promise<void> {
    const state = this.monitoredPRs.get(featureId);
    if (!state) {
      logger.warn(`No active monitor for feature ${featureId}`);
      return;
    }

    // Abort the monitoring loop
    const abortController = this.monitoringLoops.get(featureId);
    if (abortController) {
      abortController.abort();
      this.monitoringLoops.delete(featureId);
    }

    // Update state
    state.status = 'stopped';
    this.monitoredPRs.delete(featureId);

    // Emit stopped event
    this.emitEvent({
      type: 'pr_monitor_stopped',
      featureId,
      prNumber: state.prNumber,
      reason,
    });

    logger.info(`Stopped monitoring PR #${state.prNumber} for feature ${featureId} (${reason})`);
  }

  /**
   * Pause monitoring for a feature
   */
  pauseMonitoring(featureId: string): void {
    const state = this.monitoredPRs.get(featureId);
    if (state) {
      state.status = 'paused';
      logger.info(`Paused monitoring for feature ${featureId}`);
    }
  }

  /**
   * Resume monitoring for a feature
   */
  resumeMonitoring(featureId: string): void {
    const state = this.monitoredPRs.get(featureId);
    if (state && state.status === 'paused') {
      state.status = 'active';
      logger.info(`Resumed monitoring for feature ${featureId}`);
    }
  }

  /**
   * Get the current state of a monitored PR
   */
  getMonitoredPR(featureId: string): MonitoredPRState | undefined {
    return this.monitoredPRs.get(featureId);
  }

  /**
   * Get all monitored PRs
   */
  getAllMonitoredPRs(): MonitoredPRState[] {
    return Array.from(this.monitoredPRs.values());
  }

  /**
   * Check if a feature is being monitored
   */
  isMonitoring(featureId: string): boolean {
    return this.monitoredPRs.has(featureId);
  }

  /**
   * Stop all monitoring
   */
  async stopAll(): Promise<void> {
    const featureIds = Array.from(this.monitoredPRs.keys());
    await Promise.all(featureIds.map((id) => this.stopMonitoring(id, 'cancelled')));
    logger.info('Stopped all PR monitors');
  }

  /**
   * Run the monitoring loop for a PR
   */
  private async runMonitoringLoop(
    featureId: string,
    pollIntervalMs: number,
    abortController: AbortController
  ): Promise<void> {
    while (!abortController.signal.aborted) {
      await this.sleep(pollIntervalMs);

      if (abortController.signal.aborted) break;

      const state = this.monitoredPRs.get(featureId);
      if (!state || state.status !== 'active') {
        continue;
      }

      try {
        await this.checkForChanges(state);
        state.lastChecked = new Date().toISOString();
      } catch (error) {
        logger.error(`Error checking PR for feature ${featureId}:`, error);
        this.emitEvent({
          type: 'pr_monitor_error',
          featureId,
          prNumber: state.prNumber,
          error: error instanceof Error ? error.message : String(error),
          stage: 'fetch',
        });
      }
    }
  }

  /**
   * Check for changes in the PR and emit events if detected
   */
  private async checkForChanges(state: MonitoredPRState): Promise<void> {
    const feedback = await this.fetchPRFeedback(state);

    // Check for new comments
    const newComments = feedback.comments.slice(state.lastCommentCount);
    const newReviews = feedback.reviews.slice(state.lastReviewCount);

    // Check for changes in checks status
    const checksChanged = feedback.checksStatus !== state.checksStatus;
    const oldChecksStatus = state.checksStatus;

    // Check for state changes
    const stateChanged =
      feedback.mergeable !== state.mergeable ||
      feedback.requestedChanges !== state.requestedChanges;

    // Update state
    state.lastCommentCount = feedback.comments.length;
    state.lastReviewCount = feedback.reviews.length;
    state.checksStatus = feedback.checksStatus;
    state.requestedChanges = feedback.requestedChanges;
    state.mergeable = feedback.mergeable;

    // Emit events for detected changes
    if (newComments.length > 0 || newReviews.length > 0) {
      logger.info(
        `New feedback detected for PR #${state.prNumber}: ${newComments.length} comments, ${newReviews.length} reviews`
      );
      this.emitEvent({
        type: 'pr_monitor_new_feedback',
        featureId: state.featureId,
        prNumber: state.prNumber,
        feedback,
        newComments,
        newReviews,
      });
    }

    if (checksChanged) {
      logger.info(
        `Checks status changed for PR #${state.prNumber}: ${oldChecksStatus} -> ${feedback.checksStatus}`
      );
      this.emitEvent({
        type: 'pr_monitor_checks_changed',
        featureId: state.featureId,
        prNumber: state.prNumber,
        oldStatus: oldChecksStatus,
        newStatus: feedback.checksStatus,
      });
    }

    if (stateChanged) {
      logger.info(
        `PR state changed for #${state.prNumber}: mergeable=${feedback.mergeable}, requestedChanges=${feedback.requestedChanges}`
      );
      this.emitEvent({
        type: 'pr_monitor_state_changed',
        featureId: state.featureId,
        prNumber: state.prNumber,
        mergeable: feedback.mergeable,
        requestedChanges: feedback.requestedChanges,
      });
    }

    // Check if PR was merged
    if (feedback.mergeable && !feedback.requestedChanges && feedback.checksStatus === 'passing') {
      // Could trigger auto-merge or notify user
      logger.info(`PR #${state.prNumber} is ready to merge`);
    }
  }

  /**
   * Fetch PR feedback using GitHub CLI
   */
  private async fetchPRFeedback(state: MonitoredPRState): Promise<PRFeedback> {
    const { prNumber, projectPath, worktreePath } = state;
    const cwd = worktreePath || projectPath;

    try {
      // Fetch PR data including comments, reviews, and checks
      const prDataCmd = `gh pr view ${prNumber} --json number,title,state,mergeable,mergeStateStatus,comments,reviews,statusCheckRollup`;
      const { stdout: prDataOutput } = await execAsync(prDataCmd, { cwd, env: execEnv });
      const prData: GitHubPRData = JSON.parse(prDataOutput);

      // Convert to PRFeedback format
      const comments: PRComment[] = (prData.comments || []).map((c) => ({
        id: c.id,
        author: c.author?.login || 'unknown',
        body: c.body,
        file: c.path,
        line: c.line,
        createdAt: c.createdAt,
        isBot: c.author?.is_bot || c.author?.login?.includes('[bot]') || false,
      }));

      const reviews: PRReview[] = (prData.reviews || []).map((r) => ({
        id: r.id,
        author: r.author?.login || 'unknown',
        state: this.normalizeReviewState(r.state),
        body: r.body,
        comments: (r.comments?.nodes || []).map((c) => ({
          id: c.id,
          author: r.author?.login || 'unknown',
          body: c.body,
          file: c.path,
          line: c.line,
          createdAt: c.createdAt,
          isBot: false,
        })),
        submittedAt: r.submittedAt,
      }));

      // Determine checks status
      const checksStatus = this.determineChecksStatus(prData.statusCheckRollup || []);

      // Determine if changes are requested
      const requestedChanges = reviews.some((r) => r.state === 'changes_requested');

      // Determine if mergeable
      const mergeable = prData.mergeable === 'MERGEABLE' || prData.mergeStateStatus === 'CLEAN';

      return {
        prNumber,
        comments,
        reviews,
        checksStatus,
        mergeable,
        requestedChanges,
      };
    } catch (error) {
      logger.error(`Failed to fetch PR feedback for #${prNumber}:`, error);
      throw error;
    }
  }

  /**
   * Normalize review state to expected format
   */
  private normalizeReviewState(
    state: string
  ): 'approved' | 'changes_requested' | 'commented' | 'pending' {
    switch (state.toUpperCase()) {
      case 'APPROVED':
        return 'approved';
      case 'CHANGES_REQUESTED':
        return 'changes_requested';
      case 'COMMENTED':
        return 'commented';
      case 'PENDING':
      default:
        return 'pending';
    }
  }

  /**
   * Determine overall checks status from status checks
   */
  private determineChecksStatus(checks: GitHubStatusCheck[]): ChecksStatus {
    if (checks.length === 0) {
      return 'pending';
    }

    const hasFailure = checks.some(
      (c) =>
        c.state === 'FAILURE' ||
        c.state === 'ERROR' ||
        c.conclusion === 'failure' ||
        c.conclusion === 'error'
    );
    if (hasFailure) {
      return 'failing';
    }

    const allPassing = checks.every(
      (c) =>
        c.state === 'SUCCESS' ||
        c.state === 'NEUTRAL' ||
        c.conclusion === 'success' ||
        c.conclusion === 'neutral' ||
        c.conclusion === 'skipped'
    );
    if (allPassing) {
      return 'passing';
    }

    return 'pending';
  }

  /**
   * Emit a PR feedback monitor event
   */
  private emitEvent(event: PRFeedbackMonitorEvent): void {
    this.events.emit(event.type, event);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton for convenience
let prFeedbackMonitorInstance: PRFeedbackMonitor | null = null;

export function createPRFeedbackMonitor(
  events: EventEmitter,
  config?: Partial<PRFeedbackMonitorConfig>
): PRFeedbackMonitor {
  prFeedbackMonitorInstance = new PRFeedbackMonitor(events, config);
  return prFeedbackMonitorInstance;
}

export function getPRFeedbackMonitor(): PRFeedbackMonitor | null {
  return prFeedbackMonitorInstance;
}
