import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_FIXER_SYSTEM_PROMPT,
  FEEDBACK_FIXER_USER_PROMPT_TEMPLATE,
  PR_FEEDBACK_FIXER_SYSTEM_PROMPT,
  PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE,
  FEEDBACK_FIXER_SUMMARY_PROMPT,
  FEEDBACK_FIXER_EXAMPLES,
  DEFAULT_FEEDBACK_FIXER_CONFIG,
  buildFeedbackFixerSystemPrompt,
  buildFeedbackFixerUserPrompt,
  buildPRFeedbackFixerUserPrompt,
  filterIssuesBySeverity,
  groupIssuesByFile,
  hasBlockingIssues,
} from '../src/feedback-fixer.js';
import type { ReviewIssue } from '@automaker/types';

describe('feedback-fixer.ts', () => {
  describe('System Prompt Constants', () => {
    it('should export FEEDBACK_FIXER_SYSTEM_PROMPT', () => {
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toBeDefined();
      expect(typeof FEEDBACK_FIXER_SYSTEM_PROMPT).toBe('string');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Targeted Fixes Only');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Preserve Functionality');
    });

    it('should export PR_FEEDBACK_FIXER_SYSTEM_PROMPT', () => {
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toBeDefined();
      expect(typeof PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toBe('string');
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('human code reviewers');
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Understand Intent');
    });

    it('should export FEEDBACK_FIXER_SUMMARY_PROMPT', () => {
      expect(FEEDBACK_FIXER_SUMMARY_PROMPT).toBeDefined();
      expect(typeof FEEDBACK_FIXER_SUMMARY_PROMPT).toBe('string');
      expect(FEEDBACK_FIXER_SUMMARY_PROMPT).toContain('Fixes Applied');
      expect(FEEDBACK_FIXER_SUMMARY_PROMPT).toContain('Issues Not Addressed');
    });
  });

  describe('User Prompt Templates', () => {
    it('should export FEEDBACK_FIXER_USER_PROMPT_TEMPLATE with placeholders', () => {
      expect(FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toBeDefined();
      expect(typeof FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toBe('string');
      expect(FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toContain('{{featureId}}');
      expect(FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toContain('{{featureTitle}}');
      expect(FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toContain('{{#each issues}}');
    });

    it('should export PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE with placeholders', () => {
      expect(PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toBeDefined();
      expect(typeof PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toBe('string');
      expect(PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toContain('{{prNumber}}');
      expect(PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toContain('{{prTitle}}');
      expect(PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE).toContain('{{#each feedbackItems}}');
    });
  });

  describe('Examples Constants', () => {
    it('should export FEEDBACK_FIXER_EXAMPLES with valid structure', () => {
      expect(FEEDBACK_FIXER_EXAMPLES).toBeDefined();
      expect(Array.isArray(FEEDBACK_FIXER_EXAMPLES)).toBe(true);
      expect(FEEDBACK_FIXER_EXAMPLES.length).toBeGreaterThan(0);

      FEEDBACK_FIXER_EXAMPLES.forEach((example) => {
        expect(example).toHaveProperty('issue');
        expect(example).toHaveProperty('fixApplied');
        expect(example).toHaveProperty('explanation');
        expect(example.issue).toHaveProperty('id');
        expect(example.issue).toHaveProperty('severity');
        expect(example.issue).toHaveProperty('category');
        expect(example.issue).toHaveProperty('description');
      });
    });

    it('should have examples covering different severities', () => {
      const severities = new Set(FEEDBACK_FIXER_EXAMPLES.map((e) => e.issue.severity));
      // Should have at least 2 different severity levels
      expect(severities.size).toBeGreaterThanOrEqual(2);
    });

    it('should have examples covering different categories', () => {
      const categories = new Set(FEEDBACK_FIXER_EXAMPLES.map((e) => e.issue.category));
      // Should have at least 2 different categories
      expect(categories.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('DEFAULT_FEEDBACK_FIXER_CONFIG', () => {
    it('should export valid default configuration', () => {
      expect(DEFAULT_FEEDBACK_FIXER_CONFIG).toBeDefined();
      expect(typeof DEFAULT_FEEDBACK_FIXER_CONFIG.includeExamples).toBe('boolean');
      expect(typeof DEFAULT_FEEDBACK_FIXER_CONFIG.maxIssuesPerIteration).toBe('number');
      expect(typeof DEFAULT_FEEDBACK_FIXER_CONFIG.suggestTests).toBe('boolean');
      expect(DEFAULT_FEEDBACK_FIXER_CONFIG.severityThreshold).toBeDefined();
    });

    it('should have reasonable default values', () => {
      expect(DEFAULT_FEEDBACK_FIXER_CONFIG.maxIssuesPerIteration).toBeGreaterThan(0);
      expect(DEFAULT_FEEDBACK_FIXER_CONFIG.maxIssuesPerIteration).toBeLessThanOrEqual(20);
    });
  });

  describe('buildFeedbackFixerSystemPrompt', () => {
    it('should return base system prompt when examples not included', () => {
      const result = buildFeedbackFixerSystemPrompt(false);

      expect(result).toBe(FEEDBACK_FIXER_SYSTEM_PROMPT);
      expect(result).not.toContain('Example 1:');
    });

    it('should include examples when requested', () => {
      const result = buildFeedbackFixerSystemPrompt(true);

      expect(result).toContain(FEEDBACK_FIXER_SYSTEM_PROMPT);
      expect(result).toContain('Example 1:');
      expect(result).toContain('Examples');
    });

    it('should default to not including examples', () => {
      const result = buildFeedbackFixerSystemPrompt();

      expect(result).toBe(FEEDBACK_FIXER_SYSTEM_PROMPT);
    });
  });

  describe('buildFeedbackFixerUserPrompt', () => {
    const mockIssues: ReviewIssue[] = [
      {
        id: 'TEST-001',
        severity: 'high',
        category: 'logic',
        file: 'src/test.ts',
        lineStart: 10,
        lineEnd: 15,
        description: 'Test issue description',
        suggestedFix: 'Fix the issue',
      },
      {
        id: 'TEST-002',
        severity: 'critical',
        category: 'security',
        description: 'General security concern',
      },
    ];

    it('should build prompt with feature context', () => {
      const result = buildFeedbackFixerUserPrompt(
        'feature-123',
        'Test Feature',
        mockIssues,
        'This is a test feature'
      );

      expect(result).toContain('feature-123');
      expect(result).toContain('Test Feature');
      expect(result).toContain('This is a test feature');
    });

    it('should include all issues', () => {
      const result = buildFeedbackFixerUserPrompt('feature-123', 'Test Feature', mockIssues);

      expect(result).toContain('TEST-001');
      expect(result).toContain('TEST-002');
      expect(result).toContain('Test issue description');
      expect(result).toContain('General security concern');
    });

    it('should include file and line information when available', () => {
      const result = buildFeedbackFixerUserPrompt('feature-123', 'Test Feature', mockIssues);

      expect(result).toContain('src/test.ts');
      expect(result).toContain('10');
      expect(result).toContain('15');
    });

    it('should include suggested fixes when available', () => {
      const result = buildFeedbackFixerUserPrompt('feature-123', 'Test Feature', mockIssues);

      expect(result).toContain('Fix the issue');
    });

    it('should sort issues by severity (critical first)', () => {
      const result = buildFeedbackFixerUserPrompt('feature-123', 'Test Feature', mockIssues);

      // TEST-002 (critical) should appear before TEST-001 (high)
      const criticalIndex = result.indexOf('TEST-002');
      const highIndex = result.indexOf('TEST-001');
      expect(criticalIndex).toBeLessThan(highIndex);
    });

    it('should handle empty issues array', () => {
      const result = buildFeedbackFixerUserPrompt('feature-123', 'Test Feature', []);

      expect(result).toContain('feature-123');
      expect(result).toContain('Test Feature');
    });
  });

  describe('buildPRFeedbackFixerUserPrompt', () => {
    const mockFeedback = [
      {
        author: 'reviewer1',
        body: 'Please fix this issue',
        file: 'src/test.ts',
        line: 42,
      },
      {
        author: 'reviewer2',
        body: 'Why is this done this way?',
      },
    ];

    it('should build prompt with PR context', () => {
      const result = buildPRFeedbackFixerUserPrompt(
        123,
        'Test PR',
        'feature-456',
        'Test Feature',
        mockFeedback,
        'https://github.com/test/pr/123'
      );

      expect(result).toContain('#123');
      expect(result).toContain('Test PR');
      expect(result).toContain('feature-456');
      expect(result).toContain('Test Feature');
      expect(result).toContain('https://github.com/test/pr/123');
    });

    it('should include all feedback items', () => {
      const result = buildPRFeedbackFixerUserPrompt(
        123,
        'Test PR',
        'feature-456',
        'Test Feature',
        mockFeedback
      );

      expect(result).toContain('@reviewer1');
      expect(result).toContain('@reviewer2');
      expect(result).toContain('Please fix this issue');
      expect(result).toContain('Why is this done this way?');
    });

    it('should include file and line info when available', () => {
      const result = buildPRFeedbackFixerUserPrompt(
        123,
        'Test PR',
        'feature-456',
        'Test Feature',
        mockFeedback
      );

      expect(result).toContain('src/test.ts');
      expect(result).toContain('42');
    });

    it('should work without PR URL', () => {
      const result = buildPRFeedbackFixerUserPrompt(
        123,
        'Test PR',
        'feature-456',
        'Test Feature',
        mockFeedback
      );

      expect(result).toContain('#123');
      expect(result).not.toContain('undefined');
    });
  });

  describe('filterIssuesBySeverity', () => {
    const mockIssues: ReviewIssue[] = [
      { id: '1', severity: 'critical', category: 'security', description: 'Critical' },
      { id: '2', severity: 'high', category: 'logic', description: 'High' },
      { id: '3', severity: 'medium', category: 'style', description: 'Medium' },
      { id: '4', severity: 'low', category: 'documentation', description: 'Low' },
      { id: '5', severity: 'suggestion', category: 'performance', description: 'Suggestion' },
    ];

    it('should filter to critical only', () => {
      const result = filterIssuesBySeverity(mockIssues, 'critical');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('should filter to high and above', () => {
      const result = filterIssuesBySeverity(mockIssues, 'high');

      expect(result.length).toBe(2);
      expect(result.map((i) => i.id)).toContain('1');
      expect(result.map((i) => i.id)).toContain('2');
    });

    it('should filter to medium and above', () => {
      const result = filterIssuesBySeverity(mockIssues, 'medium');

      expect(result.length).toBe(3);
    });

    it('should filter to low and above', () => {
      const result = filterIssuesBySeverity(mockIssues, 'low');

      expect(result.length).toBe(4);
    });

    it('should include all issues with suggestion threshold', () => {
      const result = filterIssuesBySeverity(mockIssues, 'suggestion');

      expect(result.length).toBe(5);
    });

    it('should handle empty array', () => {
      const result = filterIssuesBySeverity([], 'medium');

      expect(result.length).toBe(0);
    });
  });

  describe('groupIssuesByFile', () => {
    const mockIssues: ReviewIssue[] = [
      { id: '1', severity: 'high', category: 'logic', file: 'src/a.ts', description: 'Issue 1' },
      { id: '2', severity: 'high', category: 'logic', file: 'src/a.ts', description: 'Issue 2' },
      { id: '3', severity: 'high', category: 'logic', file: 'src/b.ts', description: 'Issue 3' },
      { id: '4', severity: 'high', category: 'logic', description: 'General issue' },
    ];

    it('should group issues by file', () => {
      const result = groupIssuesByFile(mockIssues);

      expect(result.size).toBe(3);
      expect(result.get('src/a.ts')?.length).toBe(2);
      expect(result.get('src/b.ts')?.length).toBe(1);
    });

    it('should group issues without file under __general__', () => {
      const result = groupIssuesByFile(mockIssues);

      expect(result.get('__general__')?.length).toBe(1);
      expect(result.get('__general__')?.[0].id).toBe('4');
    });

    it('should handle empty array', () => {
      const result = groupIssuesByFile([]);

      expect(result.size).toBe(0);
    });
  });

  describe('hasBlockingIssues', () => {
    const mockIssues: ReviewIssue[] = [
      { id: '1', severity: 'critical', category: 'security', description: 'Critical' },
      { id: '2', severity: 'high', category: 'logic', description: 'High' },
      { id: '3', severity: 'medium', category: 'style', description: 'Medium' },
    ];

    it('should return true when critical issues are not addressed', () => {
      const result = hasBlockingIssues(mockIssues, ['2', '3']);

      expect(result).toBe(true);
    });

    it('should return true when high issues are not addressed', () => {
      const result = hasBlockingIssues(mockIssues, ['1', '3']);

      expect(result).toBe(true);
    });

    it('should return false when all blocking issues are addressed', () => {
      const result = hasBlockingIssues(mockIssues, ['1', '2']);

      expect(result).toBe(false);
    });

    it('should return false when all issues are addressed', () => {
      const result = hasBlockingIssues(mockIssues, ['1', '2', '3']);

      expect(result).toBe(false);
    });

    it('should handle empty addressed list', () => {
      const result = hasBlockingIssues(mockIssues, []);

      expect(result).toBe(true);
    });

    it('should handle issues with no blocking severity', () => {
      const lowIssues: ReviewIssue[] = [
        { id: '1', severity: 'medium', category: 'style', description: 'Medium' },
        { id: '2', severity: 'low', category: 'documentation', description: 'Low' },
      ];

      const result = hasBlockingIssues(lowIssues, []);

      expect(result).toBe(false);
    });
  });

  describe('Content Quality Tests', () => {
    it('should include severity handling guidelines in system prompt', () => {
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Critical');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('High');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Medium');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Low');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Suggestion');
    });

    it('should include category handling guidelines in system prompt', () => {
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Security');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Architecture');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Logic');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Style');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Performance');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Testing');
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Documentation');
    });

    it('should provide guidance for PR feedback types', () => {
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Direct Requests');
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Questions');
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Concerns');
      expect(PR_FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Suggestions');
    });

    it('should include output format guidance in system prompt', () => {
      expect(FEEDBACK_FIXER_SYSTEM_PROMPT).toContain('Output Format');
    });
  });

  describe('Integration Tests', () => {
    it('should work together: filterIssuesBySeverity + buildFeedbackFixerUserPrompt', () => {
      const allIssues: ReviewIssue[] = [
        { id: '1', severity: 'critical', category: 'security', description: 'Critical' },
        { id: '2', severity: 'low', category: 'style', description: 'Low' },
      ];

      // Filter to only high and above
      const filteredIssues = filterIssuesBySeverity(allIssues, 'high');
      expect(filteredIssues.length).toBe(1);

      // Build prompt with filtered issues
      const prompt = buildFeedbackFixerUserPrompt('feature', 'Test', filteredIssues);
      expect(prompt).toContain('Critical');
      expect(prompt).not.toContain('Low');
    });

    it('should work together: groupIssuesByFile for organized fixing', () => {
      const issues: ReviewIssue[] = [
        { id: '1', severity: 'high', category: 'logic', file: 'src/a.ts', description: 'Issue 1' },
        { id: '2', severity: 'high', category: 'logic', file: 'src/a.ts', description: 'Issue 2' },
      ];

      const grouped = groupIssuesByFile(issues);
      const fileIssues = grouped.get('src/a.ts') || [];

      // Can build prompt for specific file's issues
      const prompt = buildFeedbackFixerUserPrompt('feature', 'Test', fileIssues);
      expect(prompt).toContain('Issue 1');
      expect(prompt).toContain('Issue 2');
      expect(prompt).toContain('src/a.ts');
    });
  });
});
