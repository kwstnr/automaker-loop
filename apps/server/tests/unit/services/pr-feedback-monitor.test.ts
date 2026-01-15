import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventEmitter } from '@/lib/events.js';

// Use vi.hoisted for ALL mocks that need to be available during module initialization
const { mockExecAsync, mockIsGhCliAvailable } = vi.hoisted(() => {
  return {
    mockExecAsync: vi.fn(),
    mockIsGhCliAvailable: vi.fn().mockResolvedValue(true),
  };
});

// Mock the common utilities
vi.mock('@/routes/worktree/common.js', () => ({
  execEnv: { ...process.env },
  isGhCliAvailable: mockIsGhCliAvailable,
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocking
import {
  PRFeedbackMonitor,
  createPRFeedbackMonitor,
  getPRFeedbackMonitor,
} from '@/services/pr-feedback-monitor.js';

// Helper to create mock PR data
function createMockPRData(overrides: Record<string, unknown> = {}) {
  return {
    number: 123,
    title: 'Test PR',
    state: 'open',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    comments: [],
    reviews: [],
    statusCheckRollup: [],
    ...overrides,
  };
}

describe('PRFeedbackMonitor', () => {
  let monitor: PRFeedbackMonitor;
  let mockEvents: EventEmitter;
  let emittedEvents: Array<{ type: string; payload: unknown }>;

  beforeEach(() => {
    emittedEvents = [];
    mockEvents = {
      emit: vi.fn((type: string, payload: unknown) => {
        emittedEvents.push({ type, payload });
      }),
      subscribe: vi.fn(() => () => {}),
    };
    monitor = new PRFeedbackMonitor(mockEvents);

    // Reset mocks
    mockExecAsync.mockReset();
    mockIsGhCliAvailable.mockReset();
    mockIsGhCliAvailable.mockResolvedValue(true);

    // Default mock implementation
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(createMockPRData()),
      stderr: '',
    });
  });

  afterEach(async () => {
    // Clean up any running monitors
    await monitor.stopAll();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const monitor = new PRFeedbackMonitor(mockEvents);
      expect(monitor).toBeInstanceOf(PRFeedbackMonitor);
    });

    it('should create with custom config', () => {
      const monitor = new PRFeedbackMonitor(mockEvents, {
        pollIntervalMs: 60000,
        maxConcurrentPRs: 5,
      });
      expect(monitor).toBeInstanceOf(PRFeedbackMonitor);
    });
  });

  describe('startMonitoring', () => {
    it('should emit error when gh CLI is not available', async () => {
      mockIsGhCliAvailable.mockResolvedValueOnce(false);

      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'pr_monitor_error',
        expect.objectContaining({
          type: 'pr_monitor_error',
          featureId: 'feature-1',
          error: 'GitHub CLI (gh) is not available',
        })
      );
    });

    it('should emit error when max concurrent PRs is reached', async () => {
      // Create monitor with max 1 concurrent PR
      const limitedMonitor = new PRFeedbackMonitor(mockEvents, {
        maxConcurrentPRs: 1,
      });

      // Start first monitor
      await limitedMonitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch-1',
      });

      // Try to start second monitor (should fail)
      await limitedMonitor.startMonitoring({
        featureId: 'feature-2',
        projectPath: '/mock/project',
        prNumber: 456,
        prUrl: 'https://github.com/owner/repo/pull/456',
        branch: 'feature-branch-2',
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'pr_monitor_error',
        expect.objectContaining({
          type: 'pr_monitor_error',
          featureId: 'feature-2',
          error: expect.stringContaining('Maximum concurrent PR monitors'),
        })
      );

      await limitedMonitor.stopAll();
    });

    it('should not start monitoring for already monitored feature', async () => {
      // Start monitoring
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      // Try to start again for same feature
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      // Should only emit one started event
      const startedEvents = emittedEvents.filter((e) => e.type === 'pr_monitor_started');
      expect(startedEvents.length).toBe(1);
    });

    it('should emit started event when monitoring starts successfully', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'pr_monitor_started',
        expect.objectContaining({
          type: 'pr_monitor_started',
          featureId: 'feature-1',
          prNumber: 123,
          prUrl: 'https://github.com/owner/repo/pull/123',
        })
      );
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and emit stopped event', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      await monitor.stopMonitoring('feature-1', 'completed');

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'pr_monitor_stopped',
        expect.objectContaining({
          type: 'pr_monitor_stopped',
          featureId: 'feature-1',
          prNumber: 123,
          reason: 'completed',
        })
      );
    });

    it('should handle stopping non-existent monitor', async () => {
      await monitor.stopMonitoring('non-existent');
      // Should not throw, just log warning
      expect(true).toBe(true);
    });
  });

  describe('pauseMonitoring and resumeMonitoring', () => {
    it('should pause and resume monitoring', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      monitor.pauseMonitoring('feature-1');
      const state = monitor.getMonitoredPR('feature-1');
      expect(state?.status).toBe('paused');

      monitor.resumeMonitoring('feature-1');
      const resumedState = monitor.getMonitoredPR('feature-1');
      expect(resumedState?.status).toBe('active');
    });
  });

  describe('getMonitoredPR and getAllMonitoredPRs', () => {
    it('should return undefined for non-existent feature', () => {
      const state = monitor.getMonitoredPR('non-existent');
      expect(state).toBeUndefined();
    });

    it('should return monitored PR state', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      const state = monitor.getMonitoredPR('feature-1');
      expect(state).toBeDefined();
      expect(state?.featureId).toBe('feature-1');
      expect(state?.prNumber).toBe(123);
    });

    it('should return all monitored PRs', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch-1',
      });

      await monitor.startMonitoring({
        featureId: 'feature-2',
        projectPath: '/mock/project',
        prNumber: 456,
        prUrl: 'https://github.com/owner/repo/pull/456',
        branch: 'feature-branch-2',
      });

      const allPRs = monitor.getAllMonitoredPRs();
      expect(allPRs.length).toBe(2);
    });
  });

  describe('isMonitoring', () => {
    it('should return false for non-monitored feature', () => {
      expect(monitor.isMonitoring('non-existent')).toBe(false);
    });

    it('should return true for monitored feature', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch',
      });

      expect(monitor.isMonitoring('feature-1')).toBe(true);
    });
  });

  describe('stopAll', () => {
    it('should stop all monitors', async () => {
      await monitor.startMonitoring({
        featureId: 'feature-1',
        projectPath: '/mock/project',
        prNumber: 123,
        prUrl: 'https://github.com/owner/repo/pull/123',
        branch: 'feature-branch-1',
      });

      await monitor.startMonitoring({
        featureId: 'feature-2',
        projectPath: '/mock/project',
        prNumber: 456,
        prUrl: 'https://github.com/owner/repo/pull/456',
        branch: 'feature-branch-2',
      });

      await monitor.stopAll();

      expect(monitor.getAllMonitoredPRs().length).toBe(0);
    });
  });

  describe('singleton helpers', () => {
    it('should create and get monitor instance', () => {
      const instance = createPRFeedbackMonitor(mockEvents);
      expect(instance).toBeInstanceOf(PRFeedbackMonitor);
      expect(getPRFeedbackMonitor()).toBe(instance);
    });
  });
});

describe('PR feedback parsing', () => {
  let monitor: PRFeedbackMonitor;
  let mockEvents: EventEmitter;

  beforeEach(() => {
    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    monitor = new PRFeedbackMonitor(mockEvents);

    // Reset mocks
    mockExecAsync.mockReset();
    mockIsGhCliAvailable.mockReset();
    mockIsGhCliAvailable.mockResolvedValue(true);
  });

  afterEach(async () => {
    await monitor.stopAll();
    vi.clearAllMocks();
  });

  it('should parse PR feedback with comments', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(
        createMockPRData({
          comments: [
            {
              id: 1,
              author: { login: 'user1', is_bot: false },
              body: 'LGTM!',
              createdAt: '2024-01-01T00:00:00Z',
            },
            {
              id: 2,
              author: { login: 'bot[bot]', is_bot: true },
              body: 'Automated comment',
              createdAt: '2024-01-01T01:00:00Z',
            },
          ],
        })
      ),
      stderr: '',
    });

    await monitor.startMonitoring({
      featureId: 'feature-1',
      projectPath: '/mock/project',
      prNumber: 123,
      prUrl: 'https://github.com/owner/repo/pull/123',
      branch: 'feature-branch',
    });

    const state = monitor.getMonitoredPR('feature-1');
    expect(state?.lastCommentCount).toBe(2);
  });

  it('should parse PR feedback with reviews', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(
        createMockPRData({
          reviews: [
            {
              id: 1,
              author: { login: 'reviewer1' },
              state: 'APPROVED',
              body: 'Looks good!',
              submittedAt: '2024-01-01T00:00:00Z',
              comments: { nodes: [] },
            },
            {
              id: 2,
              author: { login: 'reviewer2' },
              state: 'CHANGES_REQUESTED',
              body: 'Please fix these issues',
              submittedAt: '2024-01-01T01:00:00Z',
              comments: { nodes: [] },
            },
          ],
        })
      ),
      stderr: '',
    });

    await monitor.startMonitoring({
      featureId: 'feature-1',
      projectPath: '/mock/project',
      prNumber: 123,
      prUrl: 'https://github.com/owner/repo/pull/123',
      branch: 'feature-branch',
    });

    const state = monitor.getMonitoredPR('feature-1');
    expect(state?.lastReviewCount).toBe(2);
    expect(state?.requestedChanges).toBe(true);
  });

  it('should determine checks status correctly', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(
        createMockPRData({
          statusCheckRollup: [
            { context: 'ci/test', state: 'SUCCESS', conclusion: 'success' },
            { context: 'ci/lint', state: 'SUCCESS', conclusion: 'success' },
          ],
        })
      ),
      stderr: '',
    });

    await monitor.startMonitoring({
      featureId: 'feature-1',
      projectPath: '/mock/project',
      prNumber: 123,
      prUrl: 'https://github.com/owner/repo/pull/123',
      branch: 'feature-branch',
    });

    const state = monitor.getMonitoredPR('feature-1');
    expect(state?.checksStatus).toBe('passing');
  });

  it('should detect failing checks', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(
        createMockPRData({
          mergeable: 'BLOCKED',
          mergeStateStatus: 'BLOCKED',
          statusCheckRollup: [
            { context: 'ci/test', state: 'FAILURE', conclusion: 'failure' },
            { context: 'ci/lint', state: 'SUCCESS', conclusion: 'success' },
          ],
        })
      ),
      stderr: '',
    });

    await monitor.startMonitoring({
      featureId: 'feature-1',
      projectPath: '/mock/project',
      prNumber: 123,
      prUrl: 'https://github.com/owner/repo/pull/123',
      branch: 'feature-branch',
    });

    const state = monitor.getMonitoredPR('feature-1');
    expect(state?.checksStatus).toBe('failing');
  });

  it('should detect pending checks', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(
        createMockPRData({
          statusCheckRollup: [
            { context: 'ci/test', state: 'PENDING', conclusion: null },
            { context: 'ci/lint', state: 'SUCCESS', conclusion: 'success' },
          ],
        })
      ),
      stderr: '',
    });

    await monitor.startMonitoring({
      featureId: 'feature-1',
      projectPath: '/mock/project',
      prNumber: 123,
      prUrl: 'https://github.com/owner/repo/pull/123',
      branch: 'feature-branch',
    });

    const state = monitor.getMonitoredPR('feature-1');
    expect(state?.checksStatus).toBe('pending');
  });

  it('should detect mergeable state', async () => {
    mockExecAsync.mockResolvedValue({
      stdout: JSON.stringify(
        createMockPRData({
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'CLEAN',
        })
      ),
      stderr: '',
    });

    await monitor.startMonitoring({
      featureId: 'feature-1',
      projectPath: '/mock/project',
      prNumber: 123,
      prUrl: 'https://github.com/owner/repo/pull/123',
      branch: 'feature-branch',
    });

    const state = monitor.getMonitoredPR('feature-1');
    expect(state?.mergeable).toBe(true);
  });
});
