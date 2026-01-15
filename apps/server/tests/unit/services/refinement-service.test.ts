import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RefinementService, createRefinementService } from '@/services/refinement-service.js';
import type { EventEmitter } from '@/lib/events.js';
import type { ReviewIssue, ReviewResult, Feature, ReviewLoopConfig } from '@automaker/types';
import { DEFAULT_REVIEW_LOOP_CONFIG } from '@automaker/types';
import * as sdk from '@anthropic-ai/claude-agent-sdk';
import * as secureFs from '@/lib/secure-fs.js';
import * as utils from '@automaker/utils';

// Mock the dependencies
vi.mock('@anthropic-ai/claude-agent-sdk');
vi.mock('@/lib/secure-fs.js');
vi.mock('@automaker/utils', async (importOriginal) => {
  const original = await importOriginal<typeof utils>();
  return {
    ...original,
    loadContextFiles: vi.fn().mockResolvedValue({
      files: [],
      memoryFiles: [],
      formattedPrompt: '# Test Context',
    }),
  };
});

describe('RefinementService', () => {
  let mockEvents: EventEmitter;
  let service: RefinementService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };

    service = createRefinementService(mockEvents);

    // Mock secureFs methods
    vi.mocked(secureFs.mkdir).mockResolvedValue(undefined);
    vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
    vi.mocked(secureFs.readFile).mockRejectedValue(new Error('File not found'));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('factory function', () => {
    it('should create a RefinementService instance', () => {
      const instance = createRefinementService(mockEvents);
      expect(instance).toBeInstanceOf(RefinementService);
    });
  });

  describe('refineCode', () => {
    const mockFeature: Feature = {
      id: 'feat-123',
      title: 'Test Feature',
      description: 'A test feature description',
      category: 'test',
    };

    const mockIssues: ReviewIssue[] = [
      {
        id: 'issue-1',
        severity: 'high',
        category: 'security',
        file: 'src/auth.ts',
        lineStart: 10,
        description: 'SQL injection vulnerability',
        suggestedFix: 'Use parameterized queries',
      },
      {
        id: 'issue-2',
        severity: 'medium',
        category: 'logic',
        description: 'Missing null check',
      },
    ];

    const mockReviewResult: ReviewResult = {
      verdict: 'needs_work',
      issues: mockIssues,
      summary: 'Found security issues',
      iteration: 1,
      timestamp: new Date().toISOString(),
    };

    it('should successfully refine code and track addressed issues', async () => {
      // Mock SDK to return a substantial response (>500 chars) which triggers the
      // fallback logic in parseRefinementResponse that assumes all issues were addressed
      const substantialResponse = `## Fixes Applied

I have successfully addressed all the identified issues in this refinement iteration.

### issue-1: SQL Injection Vulnerability (Fixed)

The SQL injection vulnerability in src/auth.ts has been resolved by implementing parameterized queries.
I replaced the direct string concatenation with prepared statements using placeholder parameters.
This ensures that user input is properly escaped and cannot be used to manipulate the SQL query.

Before:
\`\`\`typescript
const query = "SELECT * FROM users WHERE id = " + userId;
\`\`\`

After:
\`\`\`typescript
const query = "SELECT * FROM users WHERE id = $1";
const result = await db.query(query, [userId]);
\`\`\`

### issue-2: Missing Null Check (Addressed)

Added proper null check before accessing the property to prevent potential runtime errors.
The code now validates that the object exists before attempting to access its properties.

## Summary
All issues have been fixed successfully. The codebase is now more secure and robust.`;

      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: substantialResponse,
                },
              ],
            },
          };
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Refinement completed successfully',
          };
        })()
      );

      const result = await service.refineCode({
        featureId: 'feat-123',
        worktreePath: '/test/worktree',
        reviewResult: mockReviewResult,
        feature: mockFeature,
      });

      // The parsing should detect issue-1 and issue-2 as addressed based on:
      // 1. Issue IDs mentioned with "Fixed" and "Addressed" keywords nearby
      // 2. Or fallback: substantial response (>500 chars) without "could not"
      expect(result.addressedIssueIds).toContain('issue-1');
      expect(result.addressedIssueIds).toContain('issue-2');
      expect(result.unaddressedIssueIds).toHaveLength(0);
      expect(result.notes).toBeTruthy();
    });

    it('should emit refinement started event', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Done',
          };
        })()
      );

      await service.refineCode({
        featureId: 'feat-123',
        worktreePath: '/test/worktree',
        reviewResult: mockReviewResult,
        feature: mockFeature,
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'review-loop:refinement-started',
        expect.objectContaining({
          type: 'review_loop_refinement_started',
          featureId: 'feat-123',
          iteration: 1,
        })
      );
    });

    it('should emit refinement completed event', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'All issues fixed. issue-1 addressed. issue-2 addressed.',
          };
        })()
      );

      await service.refineCode({
        featureId: 'feat-123',
        worktreePath: '/test/worktree',
        reviewResult: mockReviewResult,
        feature: mockFeature,
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'review-loop:refinement-completed',
        expect.objectContaining({
          type: 'review_loop_refinement_completed',
          featureId: 'feat-123',
        })
      );
    });

    it('should return empty arrays when no issues meet severity threshold', async () => {
      const lowSeverityIssues: ReviewIssue[] = [
        {
          id: 'issue-1',
          severity: 'suggestion',
          category: 'style',
          description: 'Consider renaming variable',
        },
      ];

      const lowSeverityReview: ReviewResult = {
        ...mockReviewResult,
        issues: lowSeverityIssues,
      };

      // Set severity threshold to medium, which excludes suggestions
      const strictConfig: ReviewLoopConfig = {
        ...DEFAULT_REVIEW_LOOP_CONFIG,
        severityThreshold: 'medium',
      };

      const result = await service.refineCode({
        featureId: 'feat-123',
        worktreePath: '/test/worktree',
        reviewResult: lowSeverityReview,
        feature: mockFeature,
        config: strictConfig,
        fixerConfig: {
          includeExamples: false,
          maxIssuesPerIteration: 10,
          suggestTests: true,
          severityThreshold: 'medium',
        },
      });

      expect(result.addressedIssueIds).toHaveLength(0);
      expect(result.unaddressedIssueIds).toContain('issue-1');
      expect(result.notes).toContain('severity threshold');
    });

    it('should limit issues per iteration based on config', async () => {
      const manyIssues: ReviewIssue[] = Array.from({ length: 15 }, (_, i) => ({
        id: `issue-${i + 1}`,
        severity: 'medium' as const,
        category: 'logic' as const,
        description: `Issue ${i + 1}`,
      }));

      const manyIssuesReview: ReviewResult = {
        ...mockReviewResult,
        issues: manyIssues,
      };

      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Fixed issues',
          };
        })()
      );

      await service.refineCode({
        featureId: 'feat-123',
        worktreePath: '/test/worktree',
        reviewResult: manyIssuesReview,
        feature: mockFeature,
        fixerConfig: {
          includeExamples: false,
          maxIssuesPerIteration: 5,
          suggestTests: true,
          severityThreshold: 'suggestion',
        },
      });

      // Check that only 5 issues were included in the refinement started event
      const refinementStartedCall = vi
        .mocked(mockEvents.emit)
        .mock.calls.find((call) => call[0] === 'review-loop:refinement-started');
      expect(refinementStartedCall).toBeDefined();
      const payload = refinementStartedCall![1] as { issuesToAddress: ReviewIssue[] };
      expect(payload.issuesToAddress).toHaveLength(5);
    });

    it('should pass correct options to Claude SDK', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Done',
          };
        })()
      );

      await service.refineCode({
        featureId: 'feat-123',
        worktreePath: '/test/worktree',
        reviewResult: mockReviewResult,
        feature: mockFeature,
        model: 'claude-opus-4-5-20251101',
      });

      expect(sdk.query).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Issue issue-1'),
          options: expect.objectContaining({
            model: 'claude-opus-4-5-20251101',
            cwd: '/test/worktree',
            maxTurns: 50,
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
          }),
        })
      );
    });

    it('should handle errors gracefully and throw', async () => {
      const testError = new Error('SDK execution failed');
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          throw testError;
        })()
      );

      await expect(
        service.refineCode({
          featureId: 'feat-123',
          worktreePath: '/test/worktree',
          reviewResult: mockReviewResult,
          feature: mockFeature,
        })
      ).rejects.toThrow('SDK execution failed');

      // Should have still stored the failed iteration
      const history = service.getRefinementHistory('feat-123');
      expect(history).toHaveLength(1);
      expect(history[0].notes).toContain('failed');
    });

    it('should use feature ID as title fallback when title is undefined', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Done',
          };
        })()
      );

      const featureWithoutTitle: Feature = {
        id: 'feat-no-title',
        category: 'test',
        description: 'Description only',
      };

      await service.refineCode({
        featureId: 'feat-no-title',
        worktreePath: '/test/worktree',
        reviewResult: mockReviewResult,
        feature: featureWithoutTitle,
      });

      // Verify it was called with feat-no-title as the title
      expect(sdk.query).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('feat-no-title'),
        })
      );
    });
  });

  describe('evaluateRefinement', () => {
    const issues: ReviewIssue[] = [
      {
        id: 'issue-1',
        severity: 'critical',
        category: 'security',
        description: 'Critical security issue',
      },
      {
        id: 'issue-2',
        severity: 'high',
        category: 'logic',
        description: 'High severity bug',
      },
      {
        id: 'issue-3',
        severity: 'low',
        category: 'style',
        description: 'Low severity style issue',
      },
    ];

    it('should return true when all blocking issues are addressed', () => {
      const addressedIds = ['issue-1', 'issue-2'];
      const result = service.evaluateRefinement(issues, addressedIds, 'medium');
      expect(result).toBe(true);
    });

    it('should return false when blocking issues remain', () => {
      const addressedIds = ['issue-2'];
      const result = service.evaluateRefinement(issues, addressedIds, 'medium');
      expect(result).toBe(false);
    });

    it('should consider severity threshold correctly', () => {
      // With high threshold, only critical and high count
      const addressedIds = ['issue-1', 'issue-2'];
      expect(service.evaluateRefinement(issues, addressedIds, 'high')).toBe(true);

      // Missing critical issue
      const partialAddressed = ['issue-2'];
      expect(service.evaluateRefinement(issues, partialAddressed, 'high')).toBe(false);
    });
  });

  describe('getRefinementHistory', () => {
    it('should return empty array for unknown feature', () => {
      const history = service.getRefinementHistory('unknown-feature');
      expect(history).toEqual([]);
    });

    it('should return history after refinement', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'Addressed all issues',
          };
        })()
      );

      await service.refineCode({
        featureId: 'feat-with-history',
        worktreePath: '/test/worktree',
        reviewResult: {
          verdict: 'needs_work',
          issues: [
            {
              id: 'issue-1',
              severity: 'high',
              category: 'logic',
              description: 'Test issue',
            },
          ],
          summary: 'Test',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
        feature: {
          id: 'feat-with-history',
          title: 'Test Feature',
          category: 'test',
          description: 'Test',
        },
      });

      const history = service.getRefinementHistory('feat-with-history');
      expect(history).toHaveLength(1);
      expect(history[0].iteration).toBe(1);
      expect(history[0].targetedIssues).toHaveLength(1);
    });
  });

  describe('clearRefinementHistory', () => {
    it('should clear history for a feature', async () => {
      vi.mocked(sdk.query).mockReturnValue(
        (async function* () {
          yield { type: 'result', subtype: 'success', result: 'Done' };
        })()
      );

      await service.refineCode({
        featureId: 'feat-to-clear',
        worktreePath: '/test/worktree',
        reviewResult: {
          verdict: 'needs_work',
          issues: [
            {
              id: 'issue-1',
              severity: 'high',
              category: 'logic',
              description: 'Test',
            },
          ],
          summary: 'Test',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
        feature: {
          id: 'feat-to-clear',
          title: 'Test',
          category: 'test',
          description: 'Test',
        },
      });

      expect(service.getRefinementHistory('feat-to-clear')).toHaveLength(1);

      service.clearRefinementHistory('feat-to-clear');

      expect(service.getRefinementHistory('feat-to-clear')).toHaveLength(0);
    });
  });

  describe('loadRefinementHistory', () => {
    it('should return empty array when no history file exists', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValue(new Error('File not found'));

      const history = await service.loadRefinementHistory('feat-123', '/test/project');
      expect(history).toEqual([]);
    });

    it('should load and return history from file', async () => {
      const savedHistory = [
        {
          iteration: 1,
          targetedIssues: [],
          addressedIssueIds: ['issue-1'],
          unaddressedIssueIds: [],
          newIssuesIntroduced: [],
          notes: 'First iteration',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ];

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(savedHistory));

      const history = await service.loadRefinementHistory('feat-123', '/test/project');
      expect(history).toHaveLength(1);
      expect(history[0].addressedIssueIds).toContain('issue-1');
    });
  });
});
