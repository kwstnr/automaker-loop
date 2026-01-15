/**
 * Review Loop Types
 *
 * Type definitions for the AI review loop system that enables automatic
 * self-review and PR feedback processing for features.
 */

/**
 * Verdict from self-review or PR feedback analysis.
 * - 'pass': No blocking issues found
 * - 'needs_work': Has issues that should be addressed
 * - 'critical_issues': Has critical issues that must be fixed
 */
export type ReviewVerdict = 'pass' | 'needs_work' | 'critical_issues';

/**
 * Severity level for review issues.
 * - 'critical': Security vulnerabilities or correctness issues that must be fixed
 * - 'high': Significant issues that should be addressed before merge
 * - 'medium': Issues that should typically be fixed
 * - 'low': Minor issues that are nice to fix
 * - 'suggestion': Optional improvements
 */
export type ReviewIssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'suggestion';

/**
 * Category of a review issue.
 */
export type ReviewIssueCategory =
  | 'security'
  | 'architecture'
  | 'logic'
  | 'style'
  | 'performance'
  | 'testing'
  | 'documentation';

/**
 * A single issue identified during code review.
 */
export interface ReviewIssue {
  /** Unique identifier for this issue */
  id: string;
  /** Severity level of the issue */
  severity: ReviewIssueSeverity;
  /** Category of the issue */
  category: ReviewIssueCategory;
  /** File path where the issue was found (optional) */
  file?: string;
  /** Starting line number (optional) */
  lineStart?: number;
  /** Ending line number (optional) */
  lineEnd?: number;
  /** Description of the issue */
  description: string;
  /** Suggested fix for the issue (optional) */
  suggestedFix?: string;
}

/**
 * Result of a self-review or PR feedback analysis.
 */
export interface ReviewResult {
  /** Overall verdict of the review */
  verdict: ReviewVerdict;
  /** List of issues found during review */
  issues: ReviewIssue[];
  /** Summary of the review findings */
  summary: string;
  /** Iteration number (1-based) */
  iteration: number;
  /** ISO timestamp when the review was completed */
  timestamp: string;
}

/**
 * Notification channels for review loop notifications.
 */
export type NotificationChannel = 'github' | 'slack' | 'email';

// ============================================================================
// Quality Gate Thresholds
// ============================================================================

/**
 * Thresholds for quality gate checks during review.
 * These define minimum standards code must meet before PR creation.
 */
export interface QualityGateThresholds {
  /** Minimum test coverage percentage required (0-100, default: 80) */
  minTestCoverage: number;
  /** Maximum cyclomatic complexity allowed per function (default: 10) */
  maxComplexity: number;
  /** Maximum code duplication percentage allowed (0-100, default: 5) */
  maxDuplication: number;
  /** Issue categories that must have zero issues to pass (default: ['security']) */
  requiredCategories: ReviewIssueCategory[];
}

/**
 * Default quality gate thresholds.
 */
export const DEFAULT_QUALITY_GATE_THRESHOLDS: QualityGateThresholds = {
  minTestCoverage: 80,
  maxComplexity: 10,
  maxDuplication: 5,
  requiredCategories: ['security'],
};

// ============================================================================
// Quality Gate Evaluation Results
// ============================================================================

/**
 * Status of a quality gate check.
 * - 'passed': The check passed all thresholds
 * - 'failed': The check failed one or more thresholds
 * - 'skipped': The check was skipped (e.g., no data available)
 */
export type QualityGateCheckStatus = 'passed' | 'failed' | 'skipped';

/**
 * Result of an individual quality gate check.
 */
export interface QualityGateCheckResult {
  /** Name of the check */
  name: string;
  /** Status of the check */
  status: QualityGateCheckStatus;
  /** Human-readable message explaining the result */
  message: string;
  /** Current value (if applicable) */
  currentValue?: number;
  /** Threshold value (if applicable) */
  threshold?: number;
  /** Details about issues that caused failure (if applicable) */
  details?: string[];
}

/**
 * Summary of issue counts by severity.
 */
export interface IssueSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  suggestion: number;
}

/**
 * Summary of issue counts by category.
 */
export interface IssueCategoryCounts {
  security: number;
  architecture: number;
  logic: number;
  style: number;
  performance: number;
  testing: number;
  documentation: number;
}

/**
 * Overall verdict of quality gate evaluation.
 * - 'passed': All quality gates passed, PR can be created
 * - 'failed': One or more quality gates failed, PR should be blocked
 * - 'warning': Some checks have warnings but PR can proceed
 */
export type QualityGateVerdict = 'passed' | 'failed' | 'warning';

/**
 * Complete result of quality gate evaluation.
 */
export interface QualityGateEvaluationResult {
  /** Overall verdict of the evaluation */
  verdict: QualityGateVerdict;
  /** Whether PR creation should be blocked */
  shouldBlockPR: boolean;
  /** Human-readable summary of the evaluation */
  summary: string;
  /** Results of individual checks */
  checks: QualityGateCheckResult[];
  /** Count of issues by severity level */
  severityCounts: IssueSeverityCounts;
  /** Count of issues by category */
  categoryCounts: IssueCategoryCounts;
  /** Total number of issues evaluated */
  totalIssues: number;
  /** Timestamp of the evaluation */
  evaluatedAt: string;
}

/**
 * Input for quality gate evaluation.
 */
export interface QualityGateEvaluationInput {
  /** Issues from the review to evaluate */
  issues: ReviewIssue[];
  /** Thresholds to evaluate against */
  thresholds: QualityGateThresholds;
  /** Severity threshold from review loop config - issues at or above this block PR */
  severityThreshold: ReviewIssueSeverity;
  /** Optional test coverage percentage (0-100) */
  testCoverage?: number;
  /** Optional cyclomatic complexity values by function */
  complexityByFunction?: Record<string, number>;
  /** Optional code duplication percentage (0-100) */
  duplicationPercentage?: number;
}

// ============================================================================
// Review Loop Configuration
// ============================================================================

/**
 * Configuration for the review loop system.
 */
export interface ReviewLoopConfig {
  /** Whether the review loop is enabled */
  enabled: boolean;
  /** Maximum number of refinement iterations before creating PR (default: 3) */
  maxIterations: number;
  /** Whether to perform self-review before PR creation (default: true) */
  selfReviewBeforePR: boolean;
  /** Whether to automatically address PR review comments (default: true) */
  autoAddressReviewComments: boolean;
  /** Issues at or above this severity level block PR creation */
  severityThreshold: ReviewIssueSeverity;
  /** Whether to send notifications when ready for human review (default: true) */
  notifyOnReady: boolean;
  /** Channels to use for notifications */
  notificationChannels: NotificationChannel[];
  /** Whether to automatically refine code based on review feedback (default: true) */
  autoRefine: boolean;
  /** Quality gate thresholds that must be met before PR creation */
  qualityGate: QualityGateThresholds;
}

/**
 * Default configuration for the review loop.
 */
export const DEFAULT_REVIEW_LOOP_CONFIG: ReviewLoopConfig = {
  enabled: true,
  maxIterations: 3,
  selfReviewBeforePR: true,
  autoAddressReviewComments: true,
  severityThreshold: 'medium',
  notifyOnReady: true,
  notificationChannels: ['github'],
  autoRefine: true,
  qualityGate: DEFAULT_QUALITY_GATE_THRESHOLDS,
};

/**
 * State of a feature in the review loop.
 * - 'pending_self_review': Waiting to start self-review
 * - 'self_reviewing': Self-review in progress
 * - 'self_review_passed': Self-review completed with passing verdict
 * - 'self_review_failed': Self-review found blocking issues
 * - 'refining': Code is being refined based on review feedback
 * - 'pr_created': Pull request has been created
 * - 'awaiting_pr_feedback': Waiting for PR feedback from reviewers
 * - 'addressing_feedback': Addressing feedback from PR reviews
 * - 'ready_for_human_review': Ready for human review and approval
 * - 'approved': Human has approved the PR
 * - 'merged': PR has been merged
 */
export type ReviewLoopState =
  | 'pending_self_review'
  | 'self_reviewing'
  | 'self_review_passed'
  | 'self_review_failed'
  | 'refining'
  | 'pr_created'
  | 'awaiting_pr_feedback'
  | 'addressing_feedback'
  | 'ready_for_human_review'
  | 'approved'
  | 'merged';

/**
 * Session tracking for a feature's review loop.
 */
export interface ReviewLoopSession {
  /** ID of the feature being reviewed */
  featureId: string;
  /** Current state in the review loop */
  state: ReviewLoopState;
  /** History of review iterations */
  iterations: ReviewResult[];
  /** Current iteration number (1-based) */
  currentIteration: number;
  /** PR number if a PR has been created */
  prNumber?: number;
  /** URL of the PR if created */
  prUrl?: string;
  /** ISO timestamp when the review loop started */
  startedAt: string;
  /** ISO timestamp of the last update */
  lastUpdatedAt: string;
  /** ISO timestamp when the review loop completed */
  completedAt?: string;
}

/**
 * A comment on a pull request.
 */
export interface PRComment {
  /** Unique identifier for the comment */
  id: number;
  /** GitHub username of the comment author */
  author: string;
  /** Comment body text */
  body: string;
  /** File path if this is a file-specific comment */
  file?: string;
  /** Line number if this is a line-specific comment */
  line?: number;
  /** ISO timestamp when the comment was created */
  createdAt: string;
  /** Whether this comment was made by a bot */
  isBot: boolean;
}

/**
 * A review on a pull request.
 */
export interface PRReview {
  /** Unique identifier for the review */
  id: number;
  /** GitHub username of the reviewer */
  author: string;
  /** State of the review */
  state: 'approved' | 'changes_requested' | 'commented' | 'pending';
  /** Optional review body text */
  body?: string;
  /** Comments associated with this review */
  comments: PRComment[];
  /** ISO timestamp when the review was submitted */
  submittedAt: string;
}

/**
 * Status of CI/CD checks on a PR.
 */
export type ChecksStatus = 'pending' | 'passing' | 'failing';

/**
 * Structured feedback from a GitHub pull request.
 */
export interface PRFeedback {
  /** PR number */
  prNumber: number;
  /** All comments on the PR */
  comments: PRComment[];
  /** All reviews on the PR */
  reviews: PRReview[];
  /** Status of CI/CD checks */
  checksStatus: ChecksStatus;
  /** Whether the PR is mergeable */
  mergeable: boolean;
  /** Whether any reviewer has requested changes */
  requestedChanges: boolean;
}

/**
 * Source of an actionable item from PR feedback.
 */
export type FeedbackSource = 'comment' | 'review' | 'check';

/**
 * An actionable item extracted from PR feedback.
 */
export interface ActionableFeedbackItem {
  /** Source of this feedback (comment, review, or CI check) */
  source: FeedbackSource;
  /** ID of the source (comment ID, review ID, or check name) */
  sourceId: number | string;
  /** Author of the feedback */
  author: string;
  /** Severity of the issue */
  severity: ReviewIssueSeverity;
  /** File path if applicable */
  file?: string;
  /** Line number if applicable */
  line?: number;
  /** Description of what needs to change */
  description: string;
  /** Suggested action to address the feedback */
  suggestedAction: string;
}

/**
 * A question from PR feedback that needs to be answered.
 */
export interface FeedbackQuestion {
  /** ID of the source comment or review */
  sourceId: number;
  /** Author who asked the question */
  author: string;
  /** The question that was asked */
  question: string;
  /** Suggested response to the question */
  suggestedResponse: string;
}

/**
 * An item that requires human decision-making.
 */
export interface HumanDecisionItem {
  /** ID of the source comment or review */
  sourceId: number;
  /** Reason why this needs human input */
  reason: string;
}

/**
 * Overall status of analyzed feedback.
 */
export type AnalyzedFeedbackStatus = 'ready_to_fix' | 'needs_human_input' | 'blocked';

/**
 * Result of analyzing PR feedback for actionability.
 */
export interface AnalyzedFeedback {
  /** Items that can be automatically addressed */
  actionableIssues: ActionableFeedbackItem[];
  /** Questions that need to be answered with comments */
  questionsToAnswer: FeedbackQuestion[];
  /** Items that require human decision-making */
  requiresHumanDecision: HumanDecisionItem[];
  /** Overall status of the feedback */
  overallStatus: AnalyzedFeedbackStatus;
}

/**
 * Result of a refinement operation.
 */
export interface RefinementResult {
  /** IDs of issues that were successfully addressed */
  addressedIssueIds: string[];
  /** IDs of issues that could not be addressed */
  unaddressedIssueIds: string[];
  /** New issues introduced during refinement */
  newIssuesIntroduced: ReviewIssue[];
  /** Notes about the refinement process */
  notes: string;
}

/**
 * Events emitted during the review loop.
 */
export type ReviewLoopEvent =
  | {
      type: 'review_loop_state_changed';
      featureId: string;
      previousState: ReviewLoopState;
      newState: ReviewLoopState;
      session: ReviewLoopSession;
    }
  | {
      type: 'review_loop_review_completed';
      featureId: string;
      result: ReviewResult;
    }
  | {
      type: 'review_loop_refinement_completed';
      featureId: string;
      result: RefinementResult;
    }
  | {
      type: 'review_loop_pr_feedback_received';
      featureId: string;
      feedback: AnalyzedFeedback;
    }
  | {
      type: 'review_loop_ready_for_human';
      featureId: string;
      prUrl: string;
      summary: string;
    }
  | {
      type: 'review_loop_error';
      featureId: string;
      error: string;
      stage: ReviewLoopState;
    };

/**
 * Configuration for PR feedback monitoring.
 */
export interface PRFeedbackMonitorConfig {
  /** Whether PR feedback monitoring is enabled */
  enabled: boolean;
  /** Polling interval in milliseconds (default: 30000) */
  pollIntervalMs: number;
  /** Maximum concurrent PRs to monitor (default: 10) */
  maxConcurrentPRs: number;
  /** Whether to notify on new comments */
  notifyOnNewComments: boolean;
  /** Whether to notify when review is requested */
  notifyOnReviewRequested: boolean;
}

/**
 * Default configuration for PR feedback monitoring.
 */
export const DEFAULT_PR_FEEDBACK_MONITOR_CONFIG: PRFeedbackMonitorConfig = {
  enabled: true,
  pollIntervalMs: 30000,
  maxConcurrentPRs: 10,
  notifyOnNewComments: true,
  notifyOnReviewRequested: true,
};

/**
 * State of a monitored PR.
 */
export interface MonitoredPRState {
  /** Feature ID associated with this PR */
  featureId: string;
  /** PR number on GitHub */
  prNumber: number;
  /** URL of the PR */
  prUrl: string;
  /** Path to the project */
  projectPath: string;
  /** Path to the worktree (if applicable) */
  worktreePath?: string;
  /** Branch name */
  branch: string;
  /** Last checked timestamp */
  lastChecked: string;
  /** Number of comments at last check */
  lastCommentCount: number;
  /** Number of reviews at last check */
  lastReviewCount: number;
  /** CI/CD checks status */
  checksStatus: ChecksStatus;
  /** Whether changes have been requested */
  requestedChanges: boolean;
  /** Whether the PR is mergeable */
  mergeable: boolean;
  /** Monitoring status */
  status: 'active' | 'paused' | 'stopped';
  /** ISO timestamp when monitoring started */
  startedAt: string;
}

/**
 * Events emitted by the PR feedback monitor.
 */
export type PRFeedbackMonitorEvent =
  | {
      type: 'pr_monitor_started';
      featureId: string;
      prNumber: number;
      prUrl: string;
    }
  | {
      type: 'pr_monitor_new_feedback';
      featureId: string;
      prNumber: number;
      feedback: PRFeedback;
      newComments: PRComment[];
      newReviews: PRReview[];
    }
  | {
      type: 'pr_monitor_checks_changed';
      featureId: string;
      prNumber: number;
      oldStatus: ChecksStatus;
      newStatus: ChecksStatus;
    }
  | {
      type: 'pr_monitor_state_changed';
      featureId: string;
      prNumber: number;
      mergeable: boolean;
      requestedChanges: boolean;
    }
  | {
      type: 'pr_monitor_stopped';
      featureId: string;
      prNumber: number;
      reason: 'completed' | 'cancelled' | 'error' | 'merged';
    }
  | {
      type: 'pr_monitor_error';
      featureId: string;
      prNumber?: number;
      error: string;
      stage: 'fetch' | 'parse' | 'analyze';
    };

// ============================================================================
// Review Loop Analytics Types
// ============================================================================

/**
 * Statistics about issues found during the review loop.
 * Provides a breakdown of issues by category and severity.
 */
export interface IssueStatistics {
  /** Total number of issues found across all iterations */
  totalIssuesFound: number;
  /** Issues automatically fixed by the AI agent */
  issuesAutoFixed: number;
  /** Issues that required manual intervention or review */
  issuesRequiringManualReview: number;
  /** Breakdown of issues by category */
  byCategory: Record<ReviewIssueCategory, number>;
  /** Breakdown of issues by severity level */
  bySeverity: Record<ReviewIssueSeverity, number>;
}

/**
 * Metrics for a single iteration of the review loop.
 * Tracks performance and outcomes of each review cycle.
 */
export interface IterationMetrics {
  /** Iteration number (1-based) */
  iterationNumber: number;
  /** Verdict from this iteration's review */
  verdict: ReviewVerdict;
  /** Number of issues found in this iteration */
  issuesFound: number;
  /** Number of issues fixed from previous iteration */
  issuesFixed: number;
  /** Time taken for this iteration in milliseconds */
  durationMs: number;
  /** ISO timestamp when this iteration started */
  startedAt: string;
  /** ISO timestamp when this iteration completed */
  completedAt: string;
}

/**
 * Metrics for estimating time savings from automated review.
 * Helps quantify the value of the review loop.
 */
export interface TimeSavingsMetrics {
  /** Estimated hours saved by automatic issue detection */
  estimatedHoursSavedByDetection: number;
  /** Estimated hours saved by automatic issue fixing */
  estimatedHoursSavedByAutoFix: number;
  /** Total estimated hours saved */
  totalEstimatedHoursSaved: number;
  /** Number of issues caught before human review */
  issuesCaughtBeforeHumanReview: number;
  /** Number of review iterations completed before human review */
  iterationsBeforeHumanReview: number;
}

/**
 * Comprehensive metrics for a review loop session.
 * Aggregates all analytics data for tracking and reporting.
 */
export interface ReviewLoopMetrics {
  /** ID of the feature this metrics relates to */
  featureId: string;
  /** Total number of iterations performed */
  totalIterations: number;
  /** Whether the code passed on the first review attempt */
  passedOnFirstReview: boolean;
  /** Final verdict after all iterations */
  finalVerdict: ReviewVerdict;
  /** Total time spent in the review loop in milliseconds */
  totalDurationMs: number;
  /** ISO timestamp when the review loop started */
  startedAt: string;
  /** ISO timestamp when the review loop completed */
  completedAt: string;
  /** Metrics for each individual iteration */
  iterations: IterationMetrics[];
  /** Aggregated issue statistics */
  issueStatistics: IssueStatistics;
  /** Time savings metrics */
  timeSavings: TimeSavingsMetrics;
}

/**
 * Summary of analytics across multiple review loop sessions.
 * Used for generating reports and dashboards.
 */
export interface ReviewLoopAnalyticsSummary {
  /** Total number of review sessions analyzed */
  totalSessions: number;
  /** Number of sessions that passed on first review */
  sessionsPassedOnFirstReview: number;
  /** Average number of iterations per session */
  averageIterations: number;
  /** Average duration per session in milliseconds */
  averageDurationMs: number;
  /** Total issues found across all sessions */
  totalIssuesFound: number;
  /** Total issues auto-fixed across all sessions */
  totalIssuesAutoFixed: number;
  /** Total estimated hours saved */
  totalEstimatedHoursSaved: number;
  /** Breakdown of all issues by category */
  issuesByCategory: Record<ReviewIssueCategory, number>;
  /** Breakdown of all issues by severity */
  issuesBySeverity: Record<ReviewIssueSeverity, number>;
  /** ISO timestamp when this summary was generated */
  generatedAt: string;
}

/**
 * Default empty issue statistics.
 */
export const DEFAULT_ISSUE_STATISTICS: IssueStatistics = {
  totalIssuesFound: 0,
  issuesAutoFixed: 0,
  issuesRequiringManualReview: 0,
  byCategory: {
    security: 0,
    architecture: 0,
    logic: 0,
    style: 0,
    performance: 0,
    testing: 0,
    documentation: 0,
  },
  bySeverity: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    suggestion: 0,
  },
};

/**
 * Default time savings metrics.
 */
export const DEFAULT_TIME_SAVINGS_METRICS: TimeSavingsMetrics = {
  estimatedHoursSavedByDetection: 0,
  estimatedHoursSavedByAutoFix: 0,
  totalEstimatedHoursSaved: 0,
  issuesCaughtBeforeHumanReview: 0,
  iterationsBeforeHumanReview: 0,
};
