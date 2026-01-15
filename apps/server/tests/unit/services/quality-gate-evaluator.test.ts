import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateQualityGate,
  wouldPassQualityGate,
  getIssueSummary,
  getBlockingIssues,
  isSeverityAtOrAbove,
  countIssuesBySeverity,
  countIssuesByCategory,
  countIssuesAtOrAboveSeverity,
  getIssuesInCategory,
} from '@/services/quality-gate-evaluator.js';
import type {
  ReviewIssue,
  QualityGateThresholds,
  QualityGateEvaluationInput,
  ReviewIssueSeverity,
  ReviewIssueCategory,
} from '@automaker/types';
import { DEFAULT_QUALITY_GATE_THRESHOLDS } from '@automaker/types';

// Helper to create test issues
function createIssue(
  severity: ReviewIssueSeverity,
  category: ReviewIssueCategory,
  description = 'Test issue'
): ReviewIssue {
  return {
    id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    severity,
    category,
    description,
  };
}

describe('quality-gate-evaluator.ts', () => {
  describe('isSeverityAtOrAbove', () => {
    it('should return true when severity equals threshold', () => {
      expect(isSeverityAtOrAbove('critical', 'critical')).toBe(true);
      expect(isSeverityAtOrAbove('high', 'high')).toBe(true);
      expect(isSeverityAtOrAbove('medium', 'medium')).toBe(true);
      expect(isSeverityAtOrAbove('low', 'low')).toBe(true);
      expect(isSeverityAtOrAbove('suggestion', 'suggestion')).toBe(true);
    });

    it('should return true when severity is more severe than threshold', () => {
      expect(isSeverityAtOrAbove('critical', 'high')).toBe(true);
      expect(isSeverityAtOrAbove('critical', 'medium')).toBe(true);
      expect(isSeverityAtOrAbove('high', 'medium')).toBe(true);
      expect(isSeverityAtOrAbove('medium', 'low')).toBe(true);
      expect(isSeverityAtOrAbove('low', 'suggestion')).toBe(true);
    });

    it('should return false when severity is less severe than threshold', () => {
      expect(isSeverityAtOrAbove('high', 'critical')).toBe(false);
      expect(isSeverityAtOrAbove('medium', 'critical')).toBe(false);
      expect(isSeverityAtOrAbove('medium', 'high')).toBe(false);
      expect(isSeverityAtOrAbove('low', 'medium')).toBe(false);
      expect(isSeverityAtOrAbove('suggestion', 'low')).toBe(false);
    });
  });

  describe('countIssuesBySeverity', () => {
    it('should return all zeros for empty array', () => {
      const counts = countIssuesBySeverity([]);
      expect(counts).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        suggestion: 0,
      });
    });

    it('should count issues correctly by severity', () => {
      const issues: ReviewIssue[] = [
        createIssue('critical', 'security'),
        createIssue('critical', 'logic'),
        createIssue('high', 'architecture'),
        createIssue('medium', 'style'),
        createIssue('medium', 'performance'),
        createIssue('medium', 'testing'),
        createIssue('low', 'documentation'),
        createIssue('suggestion', 'style'),
      ];

      const counts = countIssuesBySeverity(issues);
      expect(counts).toEqual({
        critical: 2,
        high: 1,
        medium: 3,
        low: 1,
        suggestion: 1,
      });
    });
  });

  describe('countIssuesByCategory', () => {
    it('should return all zeros for empty array', () => {
      const counts = countIssuesByCategory([]);
      expect(counts).toEqual({
        security: 0,
        architecture: 0,
        logic: 0,
        style: 0,
        performance: 0,
        testing: 0,
        documentation: 0,
      });
    });

    it('should count issues correctly by category', () => {
      const issues: ReviewIssue[] = [
        createIssue('critical', 'security'),
        createIssue('high', 'security'),
        createIssue('medium', 'architecture'),
        createIssue('low', 'style'),
        createIssue('suggestion', 'style'),
        createIssue('medium', 'performance'),
      ];

      const counts = countIssuesByCategory(issues);
      expect(counts).toEqual({
        security: 2,
        architecture: 1,
        logic: 0,
        style: 2,
        performance: 1,
        testing: 0,
        documentation: 0,
      });
    });
  });

  describe('countIssuesAtOrAboveSeverity', () => {
    it('should return 0 for empty array', () => {
      expect(countIssuesAtOrAboveSeverity([], 'medium')).toBe(0);
    });

    it('should count issues at or above threshold', () => {
      const issues: ReviewIssue[] = [
        createIssue('critical', 'security'),
        createIssue('high', 'logic'),
        createIssue('medium', 'style'),
        createIssue('low', 'documentation'),
        createIssue('suggestion', 'style'),
      ];

      expect(countIssuesAtOrAboveSeverity(issues, 'critical')).toBe(1);
      expect(countIssuesAtOrAboveSeverity(issues, 'high')).toBe(2);
      expect(countIssuesAtOrAboveSeverity(issues, 'medium')).toBe(3);
      expect(countIssuesAtOrAboveSeverity(issues, 'low')).toBe(4);
      expect(countIssuesAtOrAboveSeverity(issues, 'suggestion')).toBe(5);
    });
  });

  describe('getIssuesInCategory', () => {
    it('should return empty array for no matching issues', () => {
      const issues: ReviewIssue[] = [
        createIssue('critical', 'security'),
        createIssue('high', 'logic'),
      ];
      expect(getIssuesInCategory(issues, 'style')).toEqual([]);
    });

    it('should return only issues in the specified category', () => {
      const securityIssue1 = createIssue('critical', 'security');
      const securityIssue2 = createIssue('high', 'security');
      const logicIssue = createIssue('medium', 'logic');

      const issues: ReviewIssue[] = [securityIssue1, logicIssue, securityIssue2];

      const result = getIssuesInCategory(issues, 'security');
      expect(result).toHaveLength(2);
      expect(result).toContain(securityIssue1);
      expect(result).toContain(securityIssue2);
    });
  });

  describe('evaluateQualityGate', () => {
    describe('severity threshold check', () => {
      it('should pass when no issues at or above severity threshold', () => {
        const input: QualityGateEvaluationInput = {
          issues: [createIssue('low', 'style'), createIssue('suggestion', 'documentation')],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'medium',
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('passed');
        expect(result.shouldBlockPR).toBe(false);
        const severityCheck = result.checks.find((c) => c.name === 'Severity Threshold');
        expect(severityCheck?.status).toBe('passed');
      });

      it('should fail when issues at or above severity threshold exist', () => {
        const input: QualityGateEvaluationInput = {
          issues: [createIssue('critical', 'security'), createIssue('low', 'style')],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'medium',
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('failed');
        expect(result.shouldBlockPR).toBe(true);
        const severityCheck = result.checks.find((c) => c.name === 'Severity Threshold');
        expect(severityCheck?.status).toBe('failed');
      });

      it('should fail with medium issues when threshold is medium', () => {
        const input: QualityGateEvaluationInput = {
          issues: [createIssue('medium', 'logic')],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'medium',
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('failed');
        expect(result.shouldBlockPR).toBe(true);
      });
    });

    describe('required categories check', () => {
      it('should pass when no issues in required categories', () => {
        const input: QualityGateEvaluationInput = {
          issues: [createIssue('low', 'style'), createIssue('suggestion', 'documentation')],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            requiredCategories: ['security'],
          },
          severityThreshold: 'critical', // Set high to isolate this test
        };

        const result = evaluateQualityGate(input);
        const categoryCheck = result.checks.find((c) => c.name === 'Required Categories');
        expect(categoryCheck?.status).toBe('passed');
      });

      it('should fail when issues exist in required categories', () => {
        const input: QualityGateEvaluationInput = {
          issues: [createIssue('low', 'security')], // Even low severity in security fails
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            requiredCategories: ['security'],
          },
          severityThreshold: 'critical', // Set high to isolate this test
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('failed');
        const categoryCheck = result.checks.find((c) => c.name === 'Required Categories');
        expect(categoryCheck?.status).toBe('failed');
      });

      it('should skip when no required categories configured', () => {
        const input: QualityGateEvaluationInput = {
          issues: [createIssue('low', 'security')],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            requiredCategories: [],
          },
          severityThreshold: 'critical',
        };

        const result = evaluateQualityGate(input);
        const categoryCheck = result.checks.find((c) => c.name === 'Required Categories');
        expect(categoryCheck?.status).toBe('skipped');
      });
    });

    describe('test coverage check', () => {
      it('should pass when coverage meets threshold', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            minTestCoverage: 80,
          },
          severityThreshold: 'critical',
          testCoverage: 85,
        };

        const result = evaluateQualityGate(input);
        const coverageCheck = result.checks.find((c) => c.name === 'Test Coverage');
        expect(coverageCheck?.status).toBe('passed');
        expect(coverageCheck?.currentValue).toBe(85);
      });

      it('should fail when coverage is below threshold', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            minTestCoverage: 80,
          },
          severityThreshold: 'critical',
          testCoverage: 60,
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('failed');
        const coverageCheck = result.checks.find((c) => c.name === 'Test Coverage');
        expect(coverageCheck?.status).toBe('failed');
      });

      it('should skip when coverage data is not provided', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'critical',
        };

        const result = evaluateQualityGate(input);
        const coverageCheck = result.checks.find((c) => c.name === 'Test Coverage');
        expect(coverageCheck?.status).toBe('skipped');
      });
    });

    describe('complexity check', () => {
      it('should pass when all functions are within complexity limit', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            maxComplexity: 10,
          },
          severityThreshold: 'critical',
          complexityByFunction: {
            funcA: 5,
            funcB: 8,
            funcC: 10,
          },
        };

        const result = evaluateQualityGate(input);
        const complexityCheck = result.checks.find((c) => c.name === 'Code Complexity');
        expect(complexityCheck?.status).toBe('passed');
      });

      it('should fail when functions exceed complexity limit', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            maxComplexity: 10,
          },
          severityThreshold: 'critical',
          complexityByFunction: {
            funcA: 5,
            complexFunction: 15,
            anotherComplexOne: 12,
          },
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('failed');
        const complexityCheck = result.checks.find((c) => c.name === 'Code Complexity');
        expect(complexityCheck?.status).toBe('failed');
        expect(complexityCheck?.details).toContain('complexFunction: complexity 15');
      });

      it('should skip when complexity data is not provided', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'critical',
        };

        const result = evaluateQualityGate(input);
        const complexityCheck = result.checks.find((c) => c.name === 'Code Complexity');
        expect(complexityCheck?.status).toBe('skipped');
      });
    });

    describe('duplication check', () => {
      it('should pass when duplication is within limit', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            maxDuplication: 5,
          },
          severityThreshold: 'critical',
          duplicationPercentage: 3,
        };

        const result = evaluateQualityGate(input);
        const duplicationCheck = result.checks.find((c) => c.name === 'Code Duplication');
        expect(duplicationCheck?.status).toBe('passed');
      });

      it('should fail when duplication exceeds limit', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            maxDuplication: 5,
          },
          severityThreshold: 'critical',
          duplicationPercentage: 8,
        };

        const result = evaluateQualityGate(input);
        expect(result.verdict).toBe('failed');
        const duplicationCheck = result.checks.find((c) => c.name === 'Code Duplication');
        expect(duplicationCheck?.status).toBe('failed');
      });

      it('should skip when duplication data is not provided', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'critical',
        };

        const result = evaluateQualityGate(input);
        const duplicationCheck = result.checks.find((c) => c.name === 'Code Duplication');
        expect(duplicationCheck?.status).toBe('skipped');
      });
    });

    describe('overall verdict', () => {
      it('should return warning when all checks are skipped', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: {
            ...DEFAULT_QUALITY_GATE_THRESHOLDS,
            requiredCategories: [],
          },
          severityThreshold: 'critical',
        };

        const result = evaluateQualityGate(input);
        // Severity threshold check will pass (no issues)
        // But coverage, complexity, duplication are skipped
        expect(result.shouldBlockPR).toBe(false);
      });

      it('should include severity and category counts in result', () => {
        const input: QualityGateEvaluationInput = {
          issues: [
            createIssue('critical', 'security'),
            createIssue('high', 'logic'),
            createIssue('medium', 'style'),
            createIssue('low', 'style'),
          ],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'critical',
        };

        const result = evaluateQualityGate(input);
        expect(result.severityCounts.critical).toBe(1);
        expect(result.severityCounts.high).toBe(1);
        expect(result.severityCounts.medium).toBe(1);
        expect(result.severityCounts.low).toBe(1);
        expect(result.categoryCounts.security).toBe(1);
        expect(result.categoryCounts.logic).toBe(1);
        expect(result.categoryCounts.style).toBe(2);
        expect(result.totalIssues).toBe(4);
      });

      it('should include timestamp in result', () => {
        const input: QualityGateEvaluationInput = {
          issues: [],
          thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
          severityThreshold: 'critical',
        };

        const before = new Date().toISOString();
        const result = evaluateQualityGate(input);
        const after = new Date().toISOString();

        expect(result.evaluatedAt).toBeDefined();
        expect(result.evaluatedAt >= before).toBe(true);
        expect(result.evaluatedAt <= after).toBe(true);
      });
    });
  });

  describe('wouldPassQualityGate', () => {
    it('should return true for no issues', () => {
      expect(wouldPassQualityGate([])).toBe(true);
    });

    it('should return true for only low/suggestion issues with medium threshold', () => {
      const issues: ReviewIssue[] = [
        createIssue('low', 'style'),
        createIssue('suggestion', 'documentation'),
      ];
      expect(wouldPassQualityGate(issues, 'medium')).toBe(true);
    });

    it('should return false for issues at or above threshold', () => {
      const issues: ReviewIssue[] = [createIssue('medium', 'logic')];
      expect(wouldPassQualityGate(issues, 'medium')).toBe(false);
    });

    it('should return false for security issues (default required category)', () => {
      const issues: ReviewIssue[] = [createIssue('suggestion', 'security')];
      expect(wouldPassQualityGate(issues, 'critical')).toBe(false);
    });
  });

  describe('getIssueSummary', () => {
    it('should return summary with correct counts', () => {
      const issues: ReviewIssue[] = [
        createIssue('critical', 'security'),
        createIssue('high', 'logic'),
        createIssue('medium', 'style'),
      ];

      const summary = getIssueSummary(issues);
      expect(summary.total).toBe(3);
      expect(summary.severityCounts.critical).toBe(1);
      expect(summary.severityCounts.high).toBe(1);
      expect(summary.severityCounts.medium).toBe(1);
      expect(summary.categoryCounts.security).toBe(1);
      expect(summary.categoryCounts.logic).toBe(1);
      expect(summary.categoryCounts.style).toBe(1);
    });
  });

  describe('getBlockingIssues', () => {
    it('should return issues at or above severity threshold', () => {
      const criticalIssue = createIssue('critical', 'logic');
      const highIssue = createIssue('high', 'architecture');
      const lowIssue = createIssue('low', 'style');

      const issues = [criticalIssue, highIssue, lowIssue];
      const blocking = getBlockingIssues(issues, 'high');

      expect(blocking).toHaveLength(2);
      expect(blocking).toContain(criticalIssue);
      expect(blocking).toContain(highIssue);
    });

    it('should return issues in required categories regardless of severity', () => {
      const securityIssue = createIssue('suggestion', 'security'); // Low severity but required category
      const styleIssue = createIssue('critical', 'style'); // High severity but not required

      const issues = [securityIssue, styleIssue];
      // Using 'critical' threshold so only critical issues from severity + any from required categories
      const blocking = getBlockingIssues(issues, 'critical', ['security']);

      expect(blocking).toHaveLength(2); // Both block: critical style, and any security
      expect(blocking).toContain(securityIssue);
      expect(blocking).toContain(styleIssue);
    });

    it('should return empty array when no blocking issues', () => {
      const issues: ReviewIssue[] = [
        createIssue('low', 'style'),
        createIssue('suggestion', 'documentation'),
      ];

      const blocking = getBlockingIssues(issues, 'medium', []);
      expect(blocking).toEqual([]);
    });
  });
});
