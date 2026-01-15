/**
 * React Hook for Review Loop WebSocket Events
 *
 * Provides real-time subscription to review loop state changes and events.
 * Use this hook to receive updates about the AI review loop progress.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getHttpApiClient } from '@/lib/http-api-client';
import type {
  ReviewLoopWebSocketEvent,
  ReviewLoopState,
  ReviewLoopSessionInfo,
  ReviewResultInfo,
  ReviewIssueInfo,
  PRFeedbackInfo,
} from '@/types/electron';

const logger = createLogger('ReviewLoopEvents');

/**
 * Activity entry for tracking review loop events
 */
export interface ReviewLoopActivity {
  id: string;
  type: ReviewLoopWebSocketEvent['type'];
  featureId: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

/**
 * State tracked by the useReviewLoopEvents hook
 */
export interface ReviewLoopEventState {
  /** Map of feature IDs to their current review loop sessions */
  sessions: Map<string, ReviewLoopSessionInfo>;
  /** Recent activity events for display in UI */
  activities: ReviewLoopActivity[];
  /** Map of feature IDs to their latest review results */
  latestResults: Map<string, ReviewResultInfo>;
  /** Map of feature IDs to their latest PR feedback */
  latestFeedback: Map<string, PRFeedbackInfo>;
  /** Features that are ready for human review */
  readyForHumanReview: Set<string>;
  /** Map of feature IDs to error messages */
  errors: Map<string, string>;
}

/**
 * Callbacks for handling specific review loop events
 */
export interface ReviewLoopEventCallbacks {
  onStateChanged?: (
    featureId: string,
    previousState: ReviewLoopState,
    newState: ReviewLoopState,
    session: ReviewLoopSessionInfo
  ) => void;
  onReviewCompleted?: (featureId: string, result: ReviewResultInfo) => void;
  onRefinementStarted?: (featureId: string, iteration: number, issues: ReviewIssueInfo[]) => void;
  onRefinementCompleted?: (
    featureId: string,
    addressedIssueIds: string[],
    unaddressedIssueIds: string[]
  ) => void;
  onPRFeedbackReceived?: (featureId: string, feedback: PRFeedbackInfo) => void;
  onReadyForHuman?: (featureId: string, prUrl: string, summary: string) => void;
  onError?: (featureId: string, error: string, stage: ReviewLoopState) => void;
}

/**
 * Options for the useReviewLoopEvents hook
 */
export interface UseReviewLoopEventsOptions {
  /** Maximum number of activities to keep in history */
  maxActivities?: number;
  /** Optional callbacks for handling specific events */
  callbacks?: ReviewLoopEventCallbacks;
  /** Filter events to specific feature IDs */
  featureIds?: string[];
}

const DEFAULT_MAX_ACTIVITIES = 100;

/**
 * Generate a unique ID for activity entries
 */
function generateActivityId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format a message for an activity entry based on event type
 */
function formatActivityMessage(event: ReviewLoopWebSocketEvent): string {
  switch (event.type) {
    case 'review_loop_state_changed':
      return `State changed: ${event.previousState} → ${event.newState}`;
    case 'review_loop_review_completed':
      return `Review completed: ${event.result.verdict} (${event.result.issues.length} issues)`;
    case 'review_loop_refinement_started':
      return `Refinement started: iteration ${event.iteration}, addressing ${event.issuesToAddress.length} issues`;
    case 'review_loop_refinement_completed':
      return `Refinement completed: ${event.addressedIssueIds.length} addressed, ${event.unaddressedIssueIds.length} remaining`;
    case 'review_loop_pr_feedback_received':
      return `PR feedback received: ${event.feedback.comments.length} comments, ${event.feedback.reviews.length} reviews`;
    case 'review_loop_ready_for_human':
      return `Ready for human review: ${event.prUrl}`;
    case 'review_loop_error':
      return `Error at ${event.stage}: ${event.error}`;
    default:
      return 'Unknown event';
  }
}

/**
 * Hook for subscribing to review loop WebSocket events
 *
 * @param options Configuration options for the hook
 * @returns Review loop state and helper functions
 *
 * @example
 * ```tsx
 * const { state, isFeatureInReviewLoop, getFeatureSession, clearActivities } = useReviewLoopEvents({
 *   callbacks: {
 *     onStateChanged: (featureId, prev, next, session) => {
 *       console.log(`Feature ${featureId} changed from ${prev} to ${next}`);
 *     },
 *     onReadyForHuman: (featureId, prUrl, summary) => {
 *       toast.success(`Feature ready for review: ${prUrl}`);
 *     },
 *   },
 * });
 * ```
 */
export function useReviewLoopEvents(options: UseReviewLoopEventsOptions = {}) {
  const { maxActivities = DEFAULT_MAX_ACTIVITIES, callbacks, featureIds } = options;

  // Use refs to avoid stale closures in event handlers
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const featureIdsRef = useRef(featureIds);
  featureIdsRef.current = featureIds;

  // State for tracking review loop events
  const [state, setState] = useState<ReviewLoopEventState>({
    sessions: new Map(),
    activities: [],
    latestResults: new Map(),
    latestFeedback: new Map(),
    readyForHumanReview: new Set(),
    errors: new Map(),
  });

  /**
   * Check if an event should be processed based on feature ID filter
   */
  const shouldProcessEvent = useCallback((featureId: string): boolean => {
    const filterIds = featureIdsRef.current;
    if (!filterIds || filterIds.length === 0) return true;
    return filterIds.includes(featureId);
  }, []);

  /**
   * Add an activity entry to the state
   */
  const addActivity = useCallback(
    (event: ReviewLoopWebSocketEvent) => {
      setState((prev) => {
        const newActivity: ReviewLoopActivity = {
          id: generateActivityId(),
          type: event.type,
          featureId: event.featureId,
          message: formatActivityMessage(event),
          timestamp: new Date(),
          data: event,
        };

        const newActivities = [newActivity, ...prev.activities].slice(0, maxActivities);
        return { ...prev, activities: newActivities };
      });
    },
    [maxActivities]
  );

  /**
   * Handle incoming review loop events
   */
  const handleEvent = useCallback(
    (event: ReviewLoopWebSocketEvent) => {
      if (!shouldProcessEvent(event.featureId)) {
        return;
      }

      logger.debug('Review loop event:', event);

      // Add to activity log
      addActivity(event);

      // Update state based on event type
      setState((prev) => {
        const newState = { ...prev };

        switch (event.type) {
          case 'review_loop_state_changed': {
            const newSessions = new Map(prev.sessions);
            newSessions.set(event.featureId, event.session);
            newState.sessions = newSessions;

            // Call callback
            callbacksRef.current?.onStateChanged?.(
              event.featureId,
              event.previousState,
              event.newState,
              event.session
            );
            break;
          }

          case 'review_loop_review_completed': {
            const newResults = new Map(prev.latestResults);
            newResults.set(event.featureId, event.result);
            newState.latestResults = newResults;

            callbacksRef.current?.onReviewCompleted?.(event.featureId, event.result);
            break;
          }

          case 'review_loop_refinement_started': {
            callbacksRef.current?.onRefinementStarted?.(
              event.featureId,
              event.iteration,
              event.issuesToAddress
            );
            break;
          }

          case 'review_loop_refinement_completed': {
            callbacksRef.current?.onRefinementCompleted?.(
              event.featureId,
              event.addressedIssueIds,
              event.unaddressedIssueIds
            );
            break;
          }

          case 'review_loop_pr_feedback_received': {
            const newFeedback = new Map(prev.latestFeedback);
            newFeedback.set(event.featureId, event.feedback);
            newState.latestFeedback = newFeedback;

            callbacksRef.current?.onPRFeedbackReceived?.(event.featureId, event.feedback);
            break;
          }

          case 'review_loop_ready_for_human': {
            const newReadySet = new Set(prev.readyForHumanReview);
            newReadySet.add(event.featureId);
            newState.readyForHumanReview = newReadySet;

            callbacksRef.current?.onReadyForHuman?.(event.featureId, event.prUrl, event.summary);
            break;
          }

          case 'review_loop_error': {
            const newErrors = new Map(prev.errors);
            newErrors.set(event.featureId, event.error);
            newState.errors = newErrors;

            callbacksRef.current?.onError?.(event.featureId, event.error, event.stage);
            break;
          }
        }

        return newState;
      });
    },
    [shouldProcessEvent, addActivity]
  );

  // Subscribe to WebSocket events
  useEffect(() => {
    const client = getHttpApiClient();
    const unsubscribe = client.reviewLoop.onEvent(handleEvent);

    logger.info('Subscribed to review loop events');

    return () => {
      logger.info('Unsubscribed from review loop events');
      unsubscribe();
    };
  }, [handleEvent]);

  /**
   * Check if a feature is currently in the review loop
   */
  const isFeatureInReviewLoop = useCallback(
    (featureId: string): boolean => {
      return state.sessions.has(featureId);
    },
    [state.sessions]
  );

  /**
   * Get the current session for a feature
   */
  const getFeatureSession = useCallback(
    (featureId: string): ReviewLoopSessionInfo | undefined => {
      return state.sessions.get(featureId);
    },
    [state.sessions]
  );

  /**
   * Get the latest review result for a feature
   */
  const getLatestResult = useCallback(
    (featureId: string): ReviewResultInfo | undefined => {
      return state.latestResults.get(featureId);
    },
    [state.latestResults]
  );

  /**
   * Get the latest PR feedback for a feature
   */
  const getLatestFeedback = useCallback(
    (featureId: string): PRFeedbackInfo | undefined => {
      return state.latestFeedback.get(featureId);
    },
    [state.latestFeedback]
  );

  /**
   * Check if a feature is ready for human review
   */
  const isReadyForHumanReview = useCallback(
    (featureId: string): boolean => {
      return state.readyForHumanReview.has(featureId);
    },
    [state.readyForHumanReview]
  );

  /**
   * Get the error message for a feature
   */
  const getFeatureError = useCallback(
    (featureId: string): string | undefined => {
      return state.errors.get(featureId);
    },
    [state.errors]
  );

  /**
   * Clear all activities
   */
  const clearActivities = useCallback(() => {
    setState((prev) => ({ ...prev, activities: [] }));
  }, []);

  /**
   * Clear error for a specific feature
   */
  const clearFeatureError = useCallback((featureId: string) => {
    setState((prev) => {
      const newErrors = new Map(prev.errors);
      newErrors.delete(featureId);
      return { ...prev, errors: newErrors };
    });
  }, []);

  /**
   * Mark a feature as no longer ready for human review
   */
  const acknowledgeReadyForHumanReview = useCallback((featureId: string) => {
    setState((prev) => {
      const newReadySet = new Set(prev.readyForHumanReview);
      newReadySet.delete(featureId);
      return { ...prev, readyForHumanReview: newReadySet };
    });
  }, []);

  return {
    /** Current state of all review loop events */
    state,
    /** Check if a feature is in the review loop */
    isFeatureInReviewLoop,
    /** Get the session info for a feature */
    getFeatureSession,
    /** Get the latest review result for a feature */
    getLatestResult,
    /** Get the latest PR feedback for a feature */
    getLatestFeedback,
    /** Check if a feature is ready for human review */
    isReadyForHumanReview,
    /** Get error message for a feature */
    getFeatureError,
    /** Clear all activity entries */
    clearActivities,
    /** Clear error for a specific feature */
    clearFeatureError,
    /** Acknowledge ready for human review notification */
    acknowledgeReadyForHumanReview,
  };
}
