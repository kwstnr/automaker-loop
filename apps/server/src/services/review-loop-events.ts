/**
 * Review Loop Event Emitter Service
 *
 * Service for emitting WebSocket events during the review loop process.
 * Enables real-time UI updates for review loop state changes.
 */

import type { EventEmitter } from '../lib/events.js';
import type {
  ReviewLoopState,
  ReviewLoopSession,
  ReviewResult,
  ReviewIssue,
  PRFeedback,
} from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ReviewLoopEvents');

/**
 * Payload types for review loop events
 */
export interface ReviewLoopStateChangedPayload {
  type: 'review_loop_state_changed';
  featureId: string;
  previousState: ReviewLoopState;
  newState: ReviewLoopState;
  session: ReviewLoopSession;
}

export interface ReviewLoopReviewCompletedPayload {
  type: 'review_loop_review_completed';
  featureId: string;
  result: ReviewResult;
}

export interface ReviewLoopRefinementStartedPayload {
  type: 'review_loop_refinement_started';
  featureId: string;
  iteration: number;
  issuesToAddress: ReviewIssue[];
}

export interface ReviewLoopRefinementCompletedPayload {
  type: 'review_loop_refinement_completed';
  featureId: string;
  addressedIssueIds: string[];
  unaddressedIssueIds: string[];
}

export interface ReviewLoopPRFeedbackReceivedPayload {
  type: 'review_loop_pr_feedback_received';
  featureId: string;
  feedback: PRFeedback;
}

export interface ReviewLoopReadyForHumanPayload {
  type: 'review_loop_ready_for_human';
  featureId: string;
  prUrl: string;
  summary: string;
}

export interface ReviewLoopErrorPayload {
  type: 'review_loop_error';
  featureId: string;
  error: string;
  stage: ReviewLoopState;
}

/**
 * Union type of all review loop event payloads
 */
export type ReviewLoopEventPayload =
  | ReviewLoopStateChangedPayload
  | ReviewLoopReviewCompletedPayload
  | ReviewLoopRefinementStartedPayload
  | ReviewLoopRefinementCompletedPayload
  | ReviewLoopPRFeedbackReceivedPayload
  | ReviewLoopReadyForHumanPayload
  | ReviewLoopErrorPayload;

/**
 * Review Loop Event Emitter Service
 *
 * Provides methods for emitting review loop events to WebSocket clients.
 * Events are used by the UI to display real-time updates about the
 * review loop state and progress.
 */
export class ReviewLoopEventEmitter {
  constructor(private readonly events: EventEmitter) {}

  /**
   * Emit a state change event when the review loop transitions between states
   */
  emitStateChanged(
    featureId: string,
    previousState: ReviewLoopState,
    newState: ReviewLoopState,
    session: ReviewLoopSession
  ): void {
    logger.info(
      `Review loop state changed for feature ${featureId}: ${previousState} -> ${newState}`
    );
    this.events.emit('review-loop:state-changed', {
      type: 'review_loop_state_changed',
      featureId,
      previousState,
      newState,
      session,
    } satisfies ReviewLoopStateChangedPayload);
  }

  /**
   * Emit an event when a review (self-review or PR review analysis) is completed
   */
  emitReviewCompleted(featureId: string, result: ReviewResult): void {
    logger.info(
      `Review completed for feature ${featureId}: verdict=${result.verdict}, issues=${result.issues.length}`
    );
    this.events.emit('review-loop:review-completed', {
      type: 'review_loop_review_completed',
      featureId,
      result,
    } satisfies ReviewLoopReviewCompletedPayload);
  }

  /**
   * Emit an event when refinement starts for addressing review issues
   */
  emitRefinementStarted(
    featureId: string,
    iteration: number,
    issuesToAddress: ReviewIssue[]
  ): void {
    logger.info(
      `Refinement started for feature ${featureId}: iteration=${iteration}, issues=${issuesToAddress.length}`
    );
    this.events.emit('review-loop:refinement-started', {
      type: 'review_loop_refinement_started',
      featureId,
      iteration,
      issuesToAddress,
    } satisfies ReviewLoopRefinementStartedPayload);
  }

  /**
   * Emit an event when refinement completes with results
   */
  emitRefinementCompleted(
    featureId: string,
    addressedIssueIds: string[],
    unaddressedIssueIds: string[]
  ): void {
    logger.info(
      `Refinement completed for feature ${featureId}: addressed=${addressedIssueIds.length}, unaddressed=${unaddressedIssueIds.length}`
    );
    this.events.emit('review-loop:refinement-completed', {
      type: 'review_loop_refinement_completed',
      featureId,
      addressedIssueIds,
      unaddressedIssueIds,
    } satisfies ReviewLoopRefinementCompletedPayload);
  }

  /**
   * Emit an event when PR feedback is received from GitHub
   */
  emitPRFeedbackReceived(featureId: string, feedback: PRFeedback): void {
    logger.info(
      `PR feedback received for feature ${featureId}: comments=${feedback.comments.length}, reviews=${feedback.reviews.length}`
    );
    this.events.emit('review-loop:pr-feedback-received', {
      type: 'review_loop_pr_feedback_received',
      featureId,
      feedback,
    } satisfies ReviewLoopPRFeedbackReceivedPayload);
  }

  /**
   * Emit an event when the code is ready for human review
   */
  emitReadyForHuman(featureId: string, prUrl: string, summary: string): void {
    logger.info(`Feature ${featureId} ready for human review: ${prUrl}`);
    this.events.emit('review-loop:ready-for-human', {
      type: 'review_loop_ready_for_human',
      featureId,
      prUrl,
      summary,
    } satisfies ReviewLoopReadyForHumanPayload);
  }

  /**
   * Emit an error event when something goes wrong in the review loop
   */
  emitError(featureId: string, error: string, stage: ReviewLoopState): void {
    logger.error(`Review loop error for feature ${featureId} at stage ${stage}: ${error}`);
    this.events.emit('review-loop:error', {
      type: 'review_loop_error',
      featureId,
      error,
      stage,
    } satisfies ReviewLoopErrorPayload);
  }
}

/**
 * Factory function to create a ReviewLoopEventEmitter
 */
export function createReviewLoopEventEmitter(events: EventEmitter): ReviewLoopEventEmitter {
  return new ReviewLoopEventEmitter(events);
}
