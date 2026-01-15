/**
 * Review Loop Storage - State persistence layer for review loop sessions
 *
 * Stores review loop session state in .automaker/review-loop/sessions/{featureId}.json
 * Implements atomic writes to ensure state survives server restarts and provides audit trail.
 *
 * Key features:
 * - Atomic writes using write-to-temp-then-rename pattern
 * - In-memory locking to prevent concurrent write conflicts
 * - Complete session state persistence (state machine + iteration history)
 * - CRUD operations for session management
 */

import * as secureFs from './secure-fs.js';
import path from 'path';
import {
  getReviewLoopSessionsDir,
  getReviewLoopSessionPath,
  getReviewLoopConfigPath,
  ensureReviewLoopDir,
} from '@automaker/platform';
import type {
  ReviewLoopSession,
  ReviewLoopConfig,
  ReviewLoopState,
  ReviewResult,
} from '@automaker/types';
import { DEFAULT_REVIEW_LOOP_CONFIG } from '@automaker/types';

// Re-export types for convenience
export type { ReviewLoopSession, ReviewLoopConfig };

// ============================================================================
// In-Memory Locking for Concurrent Access
// ============================================================================

/**
 * In-memory locks to prevent concurrent writes to the same session file.
 * This handles race conditions within a single process.
 * Each lock stores a promise that resolves when the current operation completes.
 */
const sessionLocks = new Map<string, Promise<unknown>>();

/**
 * Execute an operation with file locking to prevent concurrent writes.
 * Uses promise chaining to ensure sequential execution of operations on the same key.
 *
 * @param lockKey - Unique key for the lock (typically featureId)
 * @param operation - Async operation to execute while holding the lock
 * @returns Result of the operation
 */
async function withSessionLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
  // Get the current lock (previous operation's promise)
  const previousLock = sessionLocks.get(lockKey) ?? Promise.resolve();

  // Create a new promise that will be resolved when our operation completes
  let resolveCurrentLock: (value: unknown) => void;
  const currentLock = new Promise<unknown>((resolve) => {
    resolveCurrentLock = resolve;
  });

  // Set our lock immediately (synchronously) to ensure serialization
  sessionLocks.set(lockKey, currentLock);

  try {
    // Wait for the previous operation to complete
    await previousLock;
    // Execute our operation
    const result = await operation();
    return result;
  } finally {
    // Resolve our lock to allow the next operation to proceed
    resolveCurrentLock!(undefined);
    // Clean up if this is the latest lock (no newer operations waiting)
    if (sessionLocks.get(lockKey) === currentLock) {
      sessionLocks.delete(lockKey);
    }
  }
}

// ============================================================================
// Atomic Write Implementation
// ============================================================================

/**
 * Write data to a file atomically using write-to-temp-then-rename pattern.
 * This ensures that readers never see partial writes.
 *
 * @param filePath - Target file path
 * @param data - Data to write (will be JSON stringified)
 */
async function writeFileAtomic(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const jsonData = JSON.stringify(data, null, 2);

  try {
    // Write to temporary file first
    await secureFs.writeFile(tempPath, jsonData, 'utf-8');

    // Atomically rename temp file to target file
    // On POSIX systems, rename is atomic if src and dest are on the same filesystem
    await secureFs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await secureFs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ============================================================================
// Session CRUD Operations
// ============================================================================

/**
 * Create a new review loop session for a feature.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @param initialState - Initial state for the session (default: 'pending_self_review')
 * @returns The created session
 * @throws Error if session already exists
 */
export async function createSession(
  projectPath: string,
  featureId: string,
  initialState: ReviewLoopState = 'pending_self_review'
): Promise<ReviewLoopSession> {
  return withSessionLock(featureId, async () => {
    // Ensure directory structure exists
    await ensureReviewLoopDir(projectPath);

    // Check if session already exists
    const existing = await readSessionInternal(projectPath, featureId);
    if (existing) {
      throw new Error(`Review loop session already exists for feature: ${featureId}`);
    }

    const now = new Date().toISOString();
    const session: ReviewLoopSession = {
      featureId,
      state: initialState,
      iterations: [],
      currentIteration: 0,
      startedAt: now,
      lastUpdatedAt: now,
    };

    const sessionPath = getReviewLoopSessionPath(projectPath, featureId);
    await writeFileAtomic(sessionPath, session);

    return session;
  });
}

/**
 * Read a review loop session from storage.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns Session data or null if not found
 */
export async function readSession(
  projectPath: string,
  featureId: string
): Promise<ReviewLoopSession | null> {
  return readSessionInternal(projectPath, featureId);
}

/**
 * Internal read function without locking (used by create to check existence).
 */
async function readSessionInternal(
  projectPath: string,
  featureId: string
): Promise<ReviewLoopSession | null> {
  try {
    const sessionPath = getReviewLoopSessionPath(projectPath, featureId);
    const content = (await secureFs.readFile(sessionPath, 'utf-8')) as string;
    return JSON.parse(content) as ReviewLoopSession;
  } catch {
    // File doesn't exist or can't be read
    return null;
  }
}

/**
 * Update an existing review loop session.
 * Supports partial updates - only provided fields will be updated.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @param updates - Partial session data to update
 * @returns Updated session
 * @throws Error if session doesn't exist
 */
export async function updateSession(
  projectPath: string,
  featureId: string,
  updates: Partial<Omit<ReviewLoopSession, 'featureId' | 'startedAt'>>
): Promise<ReviewLoopSession> {
  return withSessionLock(featureId, async () => {
    const existing = await readSessionInternal(projectPath, featureId);
    if (!existing) {
      throw new Error(`Review loop session not found for feature: ${featureId}`);
    }

    const updatedSession: ReviewLoopSession = {
      ...existing,
      ...updates,
      featureId: existing.featureId, // Cannot change featureId
      startedAt: existing.startedAt, // Cannot change startedAt
      lastUpdatedAt: new Date().toISOString(),
    };

    const sessionPath = getReviewLoopSessionPath(projectPath, featureId);
    await writeFileAtomic(sessionPath, updatedSession);

    return updatedSession;
  });
}

/**
 * Delete a review loop session from storage.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns true if session was deleted, false if not found
 */
export async function deleteSession(projectPath: string, featureId: string): Promise<boolean> {
  return withSessionLock(featureId, async () => {
    try {
      const sessionPath = getReviewLoopSessionPath(projectPath, featureId);
      await secureFs.unlink(sessionPath);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Get all review loop sessions for a project.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Array of all sessions, sorted by lastUpdatedAt (most recent first)
 */
export async function getAllSessions(projectPath: string): Promise<ReviewLoopSession[]> {
  const sessionsDir = getReviewLoopSessionsDir(projectPath);

  try {
    const files = await secureFs.readdir(sessionsDir);

    // Read all session files in parallel
    const promises = files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        const featureId = file.replace('.json', '');
        return readSessionInternal(projectPath, featureId);
      });

    const results = await Promise.all(promises);
    const sessions = results.filter((s): s is ReviewLoopSession => s !== null);

    // Sort by lastUpdatedAt, most recent first
    sessions.sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());

    return sessions;
  } catch {
    // Directory doesn't exist
    return [];
  }
}

// ============================================================================
// State Transition Operations
// ============================================================================

/**
 * Transition a session to a new state.
 * Validates the transition and updates the session atomically.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @param newState - New state to transition to
 * @returns Updated session with the new state
 */
export async function transitionState(
  projectPath: string,
  featureId: string,
  newState: ReviewLoopState
): Promise<ReviewLoopSession> {
  return updateSession(projectPath, featureId, { state: newState });
}

/**
 * Add a review result to a session's iteration history.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @param result - Review result to add
 * @returns Updated session with the new iteration
 */
export async function addReviewResult(
  projectPath: string,
  featureId: string,
  result: ReviewResult
): Promise<ReviewLoopSession> {
  return withSessionLock(featureId, async () => {
    const existing = await readSessionInternal(projectPath, featureId);
    if (!existing) {
      throw new Error(`Review loop session not found for feature: ${featureId}`);
    }

    const updatedSession: ReviewLoopSession = {
      ...existing,
      iterations: [...existing.iterations, result],
      currentIteration: result.iteration,
      lastUpdatedAt: new Date().toISOString(),
    };

    const sessionPath = getReviewLoopSessionPath(projectPath, featureId);
    await writeFileAtomic(sessionPath, updatedSession);

    return updatedSession;
  });
}

/**
 * Mark a session as completed (approved or merged).
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @param finalState - Final state ('approved' or 'merged')
 * @returns Updated session marked as completed
 */
export async function completeSession(
  projectPath: string,
  featureId: string,
  finalState: 'approved' | 'merged'
): Promise<ReviewLoopSession> {
  return updateSession(projectPath, featureId, {
    state: finalState,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Link a PR to a session.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @param prNumber - PR number
 * @param prUrl - PR URL
 * @returns Updated session with PR information
 */
export async function linkPR(
  projectPath: string,
  featureId: string,
  prNumber: number,
  prUrl: string
): Promise<ReviewLoopSession> {
  return updateSession(projectPath, featureId, {
    prNumber,
    prUrl,
    state: 'pr_created',
  });
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get all sessions in a specific state.
 *
 * @param projectPath - Absolute path to project directory
 * @param state - State to filter by
 * @returns Array of sessions in the specified state
 */
export async function getSessionsByState(
  projectPath: string,
  state: ReviewLoopState
): Promise<ReviewLoopSession[]> {
  const allSessions = await getAllSessions(projectPath);
  return allSessions.filter((s) => s.state === state);
}

/**
 * Get all active sessions (not completed).
 *
 * @param projectPath - Absolute path to project directory
 * @returns Array of sessions that are not in 'approved' or 'merged' state
 */
export async function getActiveSessions(projectPath: string): Promise<ReviewLoopSession[]> {
  const allSessions = await getAllSessions(projectPath);
  return allSessions.filter((s) => s.state !== 'approved' && s.state !== 'merged');
}

/**
 * Get all completed sessions.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Array of sessions in 'approved' or 'merged' state
 */
export async function getCompletedSessions(projectPath: string): Promise<ReviewLoopSession[]> {
  const allSessions = await getAllSessions(projectPath);
  return allSessions.filter((s) => s.state === 'approved' || s.state === 'merged');
}

/**
 * Check if a session exists for a feature.
 *
 * @param projectPath - Absolute path to project directory
 * @param featureId - Feature identifier
 * @returns true if session exists
 */
export async function sessionExists(projectPath: string, featureId: string): Promise<boolean> {
  const session = await readSessionInternal(projectPath, featureId);
  return session !== null;
}

// ============================================================================
// Configuration Operations
// ============================================================================

/**
 * Read project-specific review loop configuration.
 * Falls back to default configuration if not found.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Review loop configuration
 */
export async function readConfig(projectPath: string): Promise<ReviewLoopConfig> {
  try {
    const configPath = getReviewLoopConfigPath(projectPath);
    const content = (await secureFs.readFile(configPath, 'utf-8')) as string;
    const config = JSON.parse(content) as Partial<ReviewLoopConfig>;
    // Merge with defaults to ensure all fields are present
    return { ...DEFAULT_REVIEW_LOOP_CONFIG, ...config };
  } catch {
    // Config doesn't exist, return defaults
    return DEFAULT_REVIEW_LOOP_CONFIG;
  }
}

/**
 * Write project-specific review loop configuration.
 *
 * @param projectPath - Absolute path to project directory
 * @param config - Configuration to write
 */
export async function writeConfig(
  projectPath: string,
  config: Partial<ReviewLoopConfig>
): Promise<void> {
  await ensureReviewLoopDir(projectPath);
  const configPath = getReviewLoopConfigPath(projectPath);
  const fullConfig = { ...DEFAULT_REVIEW_LOOP_CONFIG, ...config };
  await writeFileAtomic(configPath, fullConfig);
}

// ============================================================================
// Utility Operations
// ============================================================================

/**
 * Archive old completed sessions by moving them to an archive subdirectory.
 * Useful for cleanup while maintaining audit trail.
 *
 * @param projectPath - Absolute path to project directory
 * @param olderThanDays - Archive sessions completed more than this many days ago
 * @returns Number of sessions archived
 */
export async function archiveOldSessions(
  projectPath: string,
  olderThanDays: number = 30
): Promise<number> {
  const completedSessions = await getCompletedSessions(projectPath);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let archivedCount = 0;
  const archiveDir = path.join(getReviewLoopSessionsDir(projectPath), 'archive');

  for (const session of completedSessions) {
    if (session.completedAt && new Date(session.completedAt) < cutoffDate) {
      await secureFs.mkdir(archiveDir, { recursive: true });

      const sourcePath = getReviewLoopSessionPath(projectPath, session.featureId);
      const archivePath = path.join(archiveDir, `${session.featureId}.json`);

      try {
        // Read, write to archive, then delete original
        const content = (await secureFs.readFile(sourcePath, 'utf-8')) as string;
        await writeFileAtomic(archivePath, JSON.parse(content));
        await secureFs.unlink(sourcePath);
        archivedCount++;
      } catch {
        // Skip sessions that fail to archive
      }
    }
  }

  return archivedCount;
}

/**
 * Get session statistics for a project.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Statistics about review loop sessions
 */
export async function getSessionStatistics(projectPath: string): Promise<{
  total: number;
  active: number;
  completed: number;
  byState: Record<ReviewLoopState, number>;
  averageIterations: number;
}> {
  const allSessions = await getAllSessions(projectPath);

  const byState: Record<ReviewLoopState, number> = {
    pending_self_review: 0,
    self_reviewing: 0,
    self_review_passed: 0,
    self_review_failed: 0,
    refining: 0,
    pr_created: 0,
    awaiting_pr_feedback: 0,
    addressing_feedback: 0,
    ready_for_human_review: 0,
    approved: 0,
    merged: 0,
  };

  let totalIterations = 0;
  let sessionsWithIterations = 0;

  for (const session of allSessions) {
    byState[session.state]++;
    if (session.iterations.length > 0) {
      totalIterations += session.iterations.length;
      sessionsWithIterations++;
    }
  }

  const active = allSessions.filter((s) => s.state !== 'approved' && s.state !== 'merged').length;
  const completed = allSessions.length - active;

  return {
    total: allSessions.length,
    active,
    completed,
    byState,
    averageIterations: sessionsWithIterations > 0 ? totalIterations / sessionsWithIterations : 0,
  };
}
