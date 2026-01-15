/**
 * PR Merge Monitor Service
 *
 * Monitors GitHub PRs for merge status and automatically moves features
 * to 'verified' status when their associated PRs are merged.
 *
 * This service complements the PR-based workflow where:
 * - Features move to 'waiting_approval' when auto-mode completes and PR is created
 * - Features move to 'verified' when their PR is merged (detected by this service)
 */

import { createLogger } from '@automaker/utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { EventEmitter } from '../lib/events.js';
import { execEnv, isGhCliAvailable } from '../routes/worktree/common.js';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('PRMergeMonitor');
const execAsync = promisify(exec);

/**
 * Configuration for PR Merge Monitor
 */
export interface PRMergeMonitorConfig {
  /** Whether the monitor is enabled */
  enabled: boolean;
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** Maximum concurrent PRs to monitor */
  maxConcurrentPRs: number;
}

/**
 * State for a monitored PR
 */
export interface MonitoredPRMergeState {
  /** Feature ID associated with this PR */
  featureId: string;
  /** PR number */
  prNumber: number;
  /** PR URL */
  prUrl: string;
  /** Path to the project */
  projectPath: string;
  /** Path to the worktree (optional) */
  worktreePath?: string;
  /** Branch name */
  branch: string;
  /** Last time the PR was checked */
  lastChecked: string;
  /** Current PR state */
  prState: 'OPEN' | 'MERGED' | 'CLOSED';
  /** When monitoring started */
  startedAt: string;
}

/**
 * Event types emitted by the PR Merge Monitor
 */
export interface PRMergeMonitorEvent {
  type:
    | 'pr_merge_monitor_started'
    | 'pr_merge_monitor_stopped'
    | 'pr_merged'
    | 'pr_closed'
    | 'pr_merge_monitor_error';
  featureId: string;
  prNumber: number;
  prUrl?: string;
  error?: string;
  reason?: string;
}

/**
 * Options for starting PR merge monitoring
 */
export interface StartMergeMonitoringOptions {
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
 * Default configuration
 */
export const DEFAULT_PR_MERGE_MONITOR_CONFIG: PRMergeMonitorConfig = {
  enabled: true,
  pollIntervalMs: 60000, // Check every minute
  maxConcurrentPRs: 20,
};

/**
 * PR Merge Monitor Service
 *
 * Tracks features with open PRs and periodically checks PR status.
 * When a PR is merged, it automatically moves the feature to 'verified' status.
 */
export class PRMergeMonitor {
  private monitoredPRs = new Map<string, MonitoredPRMergeState>();
  private monitoringLoops = new Map<string, AbortController>();
  private events: EventEmitter;
  private config: PRMergeMonitorConfig;
  private featureLoader: FeatureLoader;

  constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    config?: Partial<PRMergeMonitorConfig>
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.config = {
      ...DEFAULT_PR_MERGE_MONITOR_CONFIG,
      ...config,
    };
  }

  /**
   * Start monitoring a PR for merge status
   */
  async startMonitoring(options: StartMergeMonitoringOptions): Promise<void> {
    const { featureId, projectPath, prNumber, prUrl, branch, worktreePath, pollIntervalMs } =
      options;

    // Check if already monitoring this feature
    if (this.monitoredPRs.has(featureId)) {
      logger.warn(`Already monitoring PR merge status for feature ${featureId}`);
      return;
    }

    // Check max concurrent PRs
    if (this.monitoredPRs.size >= this.config.maxConcurrentPRs) {
      const errorMsg = `Maximum concurrent PR merge monitors reached (${this.config.maxConcurrentPRs})`;
      logger.error(errorMsg);
      this.emitEvent({
        type: 'pr_merge_monitor_error',
        featureId,
        prNumber,
        error: errorMsg,
      });
      return;
    }

    // Check if gh CLI is available
    const ghAvailable = await isGhCliAvailable();
    if (!ghAvailable) {
      const errorMsg = 'GitHub CLI (gh) is not available';
      logger.error(errorMsg);
      this.emitEvent({
        type: 'pr_merge_monitor_error',
        featureId,
        prNumber,
        error: errorMsg,
      });
      return;
    }

    // Create initial state
    const state: MonitoredPRMergeState = {
      featureId,
      prNumber,
      prUrl,
      projectPath,
      worktreePath,
      branch,
      lastChecked: new Date().toISOString(),
      prState: 'OPEN',
      startedAt: new Date().toISOString(),
    };

    // Fetch initial PR state
    try {
      const initialState = await this.fetchPRState(prNumber, worktreePath || projectPath);
      state.prState = initialState;

      // If PR is already merged or closed, handle immediately
      if (initialState === 'MERGED') {
        logger.info(`PR #${prNumber} is already merged, moving feature ${featureId} to verified`);
        await this.handlePRMerged(state);
        return;
      } else if (initialState === 'CLOSED') {
        logger.info(`PR #${prNumber} is closed without merging`);
        this.emitEvent({
          type: 'pr_closed',
          featureId,
          prNumber,
          prUrl,
        });
        return;
      }
    } catch (error) {
      logger.error(`Failed to fetch initial PR state for #${prNumber}:`, error);
      this.emitEvent({
        type: 'pr_merge_monitor_error',
        featureId,
        prNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Store state and start monitoring loop
    this.monitoredPRs.set(featureId, state);

    const abortController = new AbortController();
    this.monitoringLoops.set(featureId, abortController);

    // Emit started event
    this.emitEvent({
      type: 'pr_merge_monitor_started',
      featureId,
      prNumber,
      prUrl,
    });

    logger.info(`Started monitoring PR #${prNumber} merge status for feature ${featureId}`);

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
      logger.warn(`No active merge monitor for feature ${featureId}`);
      return;
    }

    // Abort the monitoring loop
    const abortController = this.monitoringLoops.get(featureId);
    if (abortController) {
      abortController.abort();
      this.monitoringLoops.delete(featureId);
    }

    // Remove from monitored PRs
    this.monitoredPRs.delete(featureId);

    // Emit stopped event
    this.emitEvent({
      type: 'pr_merge_monitor_stopped',
      featureId,
      prNumber: state.prNumber,
      reason,
    });

    logger.info(`Stopped monitoring PR #${state.prNumber} merge status for feature ${featureId} (${reason})`);
  }

  /**
   * Get all monitored PRs
   */
  getAllMonitoredPRs(): MonitoredPRMergeState[] {
    return Array.from(this.monitoredPRs.values());
  }

  /**
   * Check if a feature is being monitored for merge
   */
  isMonitoring(featureId: string): boolean {
    return this.monitoredPRs.has(featureId);
  }

  /**
   * Get the state of a monitored PR
   */
  getMonitoredPR(featureId: string): MonitoredPRMergeState | undefined {
    return this.monitoredPRs.get(featureId);
  }

  /**
   * Stop all monitoring
   */
  async stopAll(): Promise<void> {
    const featureIds = Array.from(this.monitoredPRs.keys());
    await Promise.all(featureIds.map((id) => this.stopMonitoring(id, 'cancelled')));
    logger.info('Stopped all PR merge monitors');
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
      if (!state) {
        break;
      }

      try {
        await this.checkPRMergeStatus(state);
        state.lastChecked = new Date().toISOString();
      } catch (error) {
        logger.error(`Error checking PR merge status for feature ${featureId}:`, error);
        this.emitEvent({
          type: 'pr_merge_monitor_error',
          featureId,
          prNumber: state.prNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check PR merge status and handle state changes
   */
  private async checkPRMergeStatus(state: MonitoredPRMergeState): Promise<void> {
    const prState = await this.fetchPRState(
      state.prNumber,
      state.worktreePath || state.projectPath
    );

    if (prState === state.prState) {
      // No change
      return;
    }

    const previousState = state.prState;
    state.prState = prState;

    logger.info(`PR #${state.prNumber} state changed: ${previousState} -> ${prState}`);

    if (prState === 'MERGED') {
      await this.handlePRMerged(state);
    } else if (prState === 'CLOSED') {
      this.emitEvent({
        type: 'pr_closed',
        featureId: state.featureId,
        prNumber: state.prNumber,
        prUrl: state.prUrl,
      });
      await this.stopMonitoring(state.featureId, 'completed');
    }
  }

  /**
   * Handle when a PR is merged
   */
  private async handlePRMerged(state: MonitoredPRMergeState): Promise<void> {
    const { featureId, prNumber, prUrl, projectPath } = state;

    logger.info(`PR #${prNumber} merged! Moving feature ${featureId} to 'verified' status`);

    try {
      // Update feature status to 'verified'
      await this.featureLoader.update(projectPath, featureId, {
        status: 'verified',
      });

      logger.info(`Feature ${featureId} moved to 'verified' status after PR merge`);

      // Emit merged event
      this.emitEvent({
        type: 'pr_merged',
        featureId,
        prNumber,
        prUrl,
      });

      // Emit feature status changed event for UI updates
      this.events.emit('feature_status_changed', {
        featureId,
        projectPath,
        oldStatus: 'waiting_approval',
        newStatus: 'verified',
        reason: 'pr_merged',
        prNumber,
        prUrl,
      });

      // Stop monitoring this PR
      await this.stopMonitoring(featureId, 'merged');
    } catch (error) {
      logger.error(`Failed to update feature status after PR merge:`, error);
      this.emitEvent({
        type: 'pr_merge_monitor_error',
        featureId,
        prNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetch PR state using GitHub CLI
   */
  private async fetchPRState(prNumber: number, cwd: string): Promise<'OPEN' | 'MERGED' | 'CLOSED'> {
    try {
      const cmd = `gh pr view ${prNumber} --json state`;
      const { stdout } = await execAsync(cmd, { cwd, env: execEnv });
      const data = JSON.parse(stdout);

      // GitHub returns state in uppercase: OPEN, MERGED, CLOSED
      const state = (data.state || '').toUpperCase();

      if (state === 'MERGED') return 'MERGED';
      if (state === 'CLOSED') return 'CLOSED';
      return 'OPEN';
    } catch (error) {
      logger.error(`Failed to fetch PR state for #${prNumber}:`, error);
      throw error;
    }
  }

  /**
   * Emit a PR merge monitor event
   */
  private emitEvent(event: PRMergeMonitorEvent): void {
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
let prMergeMonitorInstance: PRMergeMonitor | null = null;

export function createPRMergeMonitor(
  events: EventEmitter,
  featureLoader: FeatureLoader,
  config?: Partial<PRMergeMonitorConfig>
): PRMergeMonitor {
  prMergeMonitorInstance = new PRMergeMonitor(events, featureLoader, config);
  return prMergeMonitorInstance;
}

export function getPRMergeMonitor(): PRMergeMonitor | null {
  return prMergeMonitorInstance;
}
