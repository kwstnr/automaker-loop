import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReviewLoopEventEmitter,
  createReviewLoopEventEmitter,
} from '@/services/review-loop-events.js';
import type { EventEmitter } from '@/lib/events.js';
import type {
  ReviewLoopState,
  ReviewLoopSession,
  ReviewResult,
  ReviewIssue,
  PRFeedback,
} from '@automaker/types';

describe('ReviewLoopEventEmitter', () => {
  let mockEvents: EventEmitter;
  let emitter: ReviewLoopEventEmitter;

  beforeEach(() => {
    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    emitter = createReviewLoopEventEmitter(mockEvents);
  });

  describe('emitStateChanged', () => {
    it('should emit review-loop:state-changed event with correct payload', () => {
      const session: ReviewLoopSession = {
        featureId: 'feat-123',
        state: 'self_reviewing',
        iterations: [],
        currentIteration: 1,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      };

      emitter.emitStateChanged('feat-123', 'pending_self_review', 'self_reviewing', session);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:state-changed', {
        type: 'review_loop_state_changed',
        featureId: 'feat-123',
        previousState: 'pending_self_review',
        newState: 'self_reviewing',
        session,
      });
    });
  });

  describe('emitReviewCompleted', () => {
    it('should emit review-loop:review-completed event with correct payload', () => {
      const result: ReviewResult = {
        verdict: 'pass',
        issues: [],
        summary: 'Code looks good',
        iteration: 1,
        timestamp: new Date().toISOString(),
      };

      emitter.emitReviewCompleted('feat-123', result);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:review-completed', {
        type: 'review_loop_review_completed',
        featureId: 'feat-123',
        result,
      });
    });
  });

  describe('emitRefinementStarted', () => {
    it('should emit review-loop:refinement-started event with correct payload', () => {
      const issues: ReviewIssue[] = [
        {
          id: 'issue-1',
          severity: 'high',
          category: 'security',
          description: 'SQL injection vulnerability',
        },
      ];

      emitter.emitRefinementStarted('feat-123', 2, issues);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:refinement-started', {
        type: 'review_loop_refinement_started',
        featureId: 'feat-123',
        iteration: 2,
        issuesToAddress: issues,
      });
    });
  });

  describe('emitRefinementCompleted', () => {
    it('should emit review-loop:refinement-completed event with correct payload', () => {
      const addressedIds = ['issue-1', 'issue-2'];
      const unaddressedIds = ['issue-3'];

      emitter.emitRefinementCompleted('feat-123', addressedIds, unaddressedIds);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:refinement-completed', {
        type: 'review_loop_refinement_completed',
        featureId: 'feat-123',
        addressedIssueIds: addressedIds,
        unaddressedIssueIds: unaddressedIds,
      });
    });
  });

  describe('emitPRFeedbackReceived', () => {
    it('should emit review-loop:pr-feedback-received event with correct payload', () => {
      const feedback: PRFeedback = {
        prNumber: 42,
        comments: [
          {
            id: 1,
            author: 'reviewer',
            body: 'Please add tests',
            createdAt: new Date().toISOString(),
            isBot: false,
          },
        ],
        reviews: [],
        checksStatus: 'passing',
        mergeable: true,
        requestedChanges: false,
      };

      emitter.emitPRFeedbackReceived('feat-123', feedback);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:pr-feedback-received', {
        type: 'review_loop_pr_feedback_received',
        featureId: 'feat-123',
        feedback,
      });
    });
  });

  describe('emitReadyForHuman', () => {
    it('should emit review-loop:ready-for-human event with correct payload', () => {
      const prUrl = 'https://github.com/org/repo/pull/42';
      const summary = 'Feature implementation complete, ready for review';

      emitter.emitReadyForHuman('feat-123', prUrl, summary);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:ready-for-human', {
        type: 'review_loop_ready_for_human',
        featureId: 'feat-123',
        prUrl,
        summary,
      });
    });
  });

  describe('emitError', () => {
    it('should emit review-loop:error event with correct payload', () => {
      const error = 'Failed to analyze code changes';
      const stage: ReviewLoopState = 'self_reviewing';

      emitter.emitError('feat-123', error, stage);

      expect(mockEvents.emit).toHaveBeenCalledWith('review-loop:error', {
        type: 'review_loop_error',
        featureId: 'feat-123',
        error,
        stage,
      });
    });
  });

  describe('factory function', () => {
    it('should create a ReviewLoopEventEmitter instance', () => {
      const instance = createReviewLoopEventEmitter(mockEvents);
      expect(instance).toBeInstanceOf(ReviewLoopEventEmitter);
    });
  });

  describe('event type naming convention', () => {
    it('should use kebab-case for event type names', () => {
      // Verify that all emitted events use the correct kebab-case naming
      const eventTypes = [
        'review-loop:state-changed',
        'review-loop:review-completed',
        'review-loop:refinement-started',
        'review-loop:refinement-completed',
        'review-loop:pr-feedback-received',
        'review-loop:ready-for-human',
        'review-loop:error',
      ];

      // Emit all event types
      emitter.emitStateChanged('f1', 'pending_self_review', 'self_reviewing', {
        featureId: 'f1',
        state: 'self_reviewing',
        iterations: [],
        currentIteration: 1,
        startedAt: '',
        lastUpdatedAt: '',
      });
      emitter.emitReviewCompleted('f1', {
        verdict: 'pass',
        issues: [],
        summary: '',
        iteration: 1,
        timestamp: '',
      });
      emitter.emitRefinementStarted('f1', 1, []);
      emitter.emitRefinementCompleted('f1', [], []);
      emitter.emitPRFeedbackReceived('f1', {
        prNumber: 1,
        comments: [],
        reviews: [],
        checksStatus: 'passing',
        mergeable: true,
        requestedChanges: false,
      });
      emitter.emitReadyForHuman('f1', '', '');
      emitter.emitError('f1', '', 'self_reviewing');

      // Verify each event type was emitted
      eventTypes.forEach((eventType) => {
        expect(mockEvents.emit).toHaveBeenCalledWith(eventType, expect.any(Object));
      });
    });
  });
});
