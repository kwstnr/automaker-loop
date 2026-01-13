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
