import { describe, it, expect } from 'vitest';
import {
  SELF_REVIEWER_SYSTEM_PROMPT,
  SELF_REVIEWER_USER_PROMPT_TEMPLATE,
  SELF_REVIEWER_QUICK_PROMPT,
  SELF_REVIEW_EXAMPLE_OUTPUT,
  DEFAULT_SELF_REVIEWER_CONFIG,
  getSelfReviewerPrompt,
  generateIssueId,
} from '../src/self-reviewer.js';

describe('self-reviewer.ts', () => {
  describe('SELF_REVIEWER_SYSTEM_PROMPT', () => {
    it('should be defined and non-empty', () => {
      expect(SELF_REVIEWER_SYSTEM_PROMPT).toBeDefined();
      expect(typeof SELF_REVIEWER_SYSTEM_PROMPT).toBe('string');
      expect(SELF_REVIEWER_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('should define the reviewer role', () => {
      expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('senior code reviewer');
      expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Your Role');
    });

    describe('Review Categories', () => {
      it('should include all 7 review categories', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Security');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Architecture');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Logic');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Performance');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Testing');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Style');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Documentation');
      });

      it('should prioritize categories correctly (Security first)', () => {
        const securityIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 1. Security');
        const architectureIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 2. Architecture');
        const logicIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 3. Logic');
        const performanceIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 4. Performance');
        const testingIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 5. Testing');
        const styleIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 6. Style');
        const documentationIndex = SELF_REVIEWER_SYSTEM_PROMPT.indexOf('### 7. Documentation');

        expect(securityIndex).toBeLessThan(architectureIndex);
        expect(architectureIndex).toBeLessThan(logicIndex);
        expect(logicIndex).toBeLessThan(performanceIndex);
        expect(performanceIndex).toBeLessThan(testingIndex);
        expect(testingIndex).toBeLessThan(styleIndex);
        expect(styleIndex).toBeLessThan(documentationIndex);
      });
    });

    describe('Security Category', () => {
      it('should include key security review points', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Input Validation');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Authentication');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Authorization');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Secrets Exposure');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Injection');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('XSS');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('SQL injection');
      });

      it('should mention sensitive data handling', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Sensitive Data');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('PII');
      });
    });

    describe('Architecture Category', () => {
      it('should include key architecture review points', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Pattern Consistency');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Abstraction');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Separation of Concerns');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Coupling');
      });
    });

    describe('Logic Category', () => {
      it('should include key logic review points', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Edge Cases');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Error Handling');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Race Conditions');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Off-by-One');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Null');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Type Safety');
      });
    });

    describe('Performance Category', () => {
      it('should include key performance review points', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('N+1');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Memory');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Caching');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Algorithm');
      });
    });

    describe('Severity Levels', () => {
      it('should define all 5 severity levels', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('critical');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('high');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('medium');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('low');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('suggestion');
      });

      it('should explain severity level meanings', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('MUST be fixed');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('SHOULD be fixed');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('SHOULD be addressed');
      });
    });

    describe('Output Format', () => {
      it('should define JSON output structure', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('```json');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('verdict');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('issues');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('summary');
      });

      it('should define issue structure fields', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"id"');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"severity"');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"category"');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"file"');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"lineStart"');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"description"');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('"suggestedFix"');
      });
    });

    describe('Verdict Types', () => {
      it('should define all 3 verdict types', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('pass');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('needs_work');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('critical_issues');
      });

      it('should provide guidance for each verdict', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('No blocking issues');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('medium or high severity');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('critical security or correctness');
      });
    });

    describe('Important Notes', () => {
      it('should include key review guidelines', () => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Be Constructive');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Provide Context');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Suggest Fixes');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Avoid False Positives');
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain('Focus on Changes');
      });
    });
  });

  describe('SELF_REVIEWER_USER_PROMPT_TEMPLATE', () => {
    it('should be defined and non-empty', () => {
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toBeDefined();
      expect(typeof SELF_REVIEWER_USER_PROMPT_TEMPLATE).toBe('string');
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE.length).toBeGreaterThan(0);
    });

    it('should contain feature context placeholders', () => {
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('{{featureId}}');
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('{{featureTitle}}');
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('{{featureDescription}}');
    });

    it('should contain changed files template', () => {
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('{{#each changedFiles}}');
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('{{filename}}');
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('{{diff}}');
    });

    it('should include review instructions', () => {
      expect(SELF_REVIEWER_USER_PROMPT_TEMPLATE).toContain('Review Instructions');
    });
  });

  describe('SELF_REVIEWER_QUICK_PROMPT', () => {
    it('should be defined and shorter than full prompt', () => {
      expect(SELF_REVIEWER_QUICK_PROMPT).toBeDefined();
      expect(typeof SELF_REVIEWER_QUICK_PROMPT).toBe('string');
      expect(SELF_REVIEWER_QUICK_PROMPT.length).toBeLessThan(
        SELF_REVIEWER_SYSTEM_PROMPT.length
      );
    });

    it('should still include essential categories', () => {
      expect(SELF_REVIEWER_QUICK_PROMPT).toContain('Critical');
      expect(SELF_REVIEWER_QUICK_PROMPT).toContain('Important');
      expect(SELF_REVIEWER_QUICK_PROMPT).toContain('Minor');
    });

    it('should still define output format', () => {
      expect(SELF_REVIEWER_QUICK_PROMPT).toContain('verdict');
      expect(SELF_REVIEWER_QUICK_PROMPT).toContain('issues');
      expect(SELF_REVIEWER_QUICK_PROMPT).toContain('summary');
    });
  });

  describe('SELF_REVIEW_EXAMPLE_OUTPUT', () => {
    it('should have valid verdict', () => {
      expect(['pass', 'needs_work', 'critical_issues']).toContain(
        SELF_REVIEW_EXAMPLE_OUTPUT.verdict
      );
    });

    it('should have issues array with valid structure', () => {
      expect(Array.isArray(SELF_REVIEW_EXAMPLE_OUTPUT.issues)).toBe(true);
      expect(SELF_REVIEW_EXAMPLE_OUTPUT.issues.length).toBeGreaterThan(0);

      SELF_REVIEW_EXAMPLE_OUTPUT.issues.forEach((issue) => {
        expect(issue).toHaveProperty('id');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('category');
        expect(issue).toHaveProperty('description');
        expect(['critical', 'high', 'medium', 'low', 'suggestion']).toContain(
          issue.severity
        );
        expect([
          'security',
          'architecture',
          'logic',
          'style',
          'performance',
          'testing',
          'documentation',
        ]).toContain(issue.category);
      });
    });

    it('should have summary', () => {
      expect(typeof SELF_REVIEW_EXAMPLE_OUTPUT.summary).toBe('string');
      expect(SELF_REVIEW_EXAMPLE_OUTPUT.summary.length).toBeGreaterThan(0);
    });

    it('should include examples of different severities', () => {
      const severities = new Set(
        SELF_REVIEW_EXAMPLE_OUTPUT.issues.map((i) => i.severity)
      );
      expect(severities.size).toBeGreaterThanOrEqual(2);
    });

    it('should include examples of different categories', () => {
      const categories = new Set(
        SELF_REVIEW_EXAMPLE_OUTPUT.issues.map((i) => i.category)
      );
      expect(categories.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('DEFAULT_SELF_REVIEWER_CONFIG', () => {
    it('should have all required properties', () => {
      expect(DEFAULT_SELF_REVIEWER_CONFIG).toHaveProperty('useQuickPrompt');
      expect(DEFAULT_SELF_REVIEWER_CONFIG).toHaveProperty('quickPromptThreshold');
      expect(DEFAULT_SELF_REVIEWER_CONFIG).toHaveProperty('focusCategories');
      expect(DEFAULT_SELF_REVIEWER_CONFIG).toHaveProperty('minimumSeverity');
    });

    it('should have valid types', () => {
      expect(typeof DEFAULT_SELF_REVIEWER_CONFIG.useQuickPrompt).toBe('boolean');
      expect(typeof DEFAULT_SELF_REVIEWER_CONFIG.quickPromptThreshold).toBe(
        'number'
      );
      expect(Array.isArray(DEFAULT_SELF_REVIEWER_CONFIG.focusCategories)).toBe(
        true
      );
      expect(
        ['critical', 'high', 'medium', 'low', 'suggestion'].includes(
          DEFAULT_SELF_REVIEWER_CONFIG.minimumSeverity
        )
      ).toBe(true);
    });

    it('should have reasonable threshold value', () => {
      expect(DEFAULT_SELF_REVIEWER_CONFIG.quickPromptThreshold).toBeGreaterThan(0);
      expect(DEFAULT_SELF_REVIEWER_CONFIG.quickPromptThreshold).toBeLessThanOrEqual(
        500
      );
    });
  });

  describe('getSelfReviewerPrompt', () => {
    it('should return quick prompt for small changes', () => {
      const result = getSelfReviewerPrompt(50);
      expect(result).toBe(SELF_REVIEWER_QUICK_PROMPT);
    });

    it('should return full prompt for large changes', () => {
      const result = getSelfReviewerPrompt(200);
      expect(result).toBe(SELF_REVIEWER_SYSTEM_PROMPT);
    });

    it('should respect custom threshold', () => {
      const customConfig = {
        ...DEFAULT_SELF_REVIEWER_CONFIG,
        quickPromptThreshold: 50,
      };

      expect(getSelfReviewerPrompt(40, customConfig)).toBe(SELF_REVIEWER_QUICK_PROMPT);
      expect(getSelfReviewerPrompt(60, customConfig)).toBe(SELF_REVIEWER_SYSTEM_PROMPT);
    });

    it('should return full prompt when useQuickPrompt is false', () => {
      const customConfig = {
        ...DEFAULT_SELF_REVIEWER_CONFIG,
        useQuickPrompt: false,
      };

      expect(getSelfReviewerPrompt(10, customConfig)).toBe(SELF_REVIEWER_SYSTEM_PROMPT);
    });
  });

  describe('generateIssueId', () => {
    it('should generate correct prefixes for each category', () => {
      expect(generateIssueId('security', 1)).toBe('SEC-001');
      expect(generateIssueId('architecture', 2)).toBe('ARCH-002');
      expect(generateIssueId('logic', 3)).toBe('LOGIC-003');
      expect(generateIssueId('style', 4)).toBe('STYLE-004');
      expect(generateIssueId('performance', 5)).toBe('PERF-005');
      expect(generateIssueId('testing', 6)).toBe('TEST-006');
      expect(generateIssueId('documentation', 7)).toBe('DOC-007');
    });

    it('should pad numbers with zeros', () => {
      expect(generateIssueId('security', 1)).toContain('001');
      expect(generateIssueId('security', 99)).toContain('099');
      expect(generateIssueId('security', 999)).toContain('999');
    });

    it('should handle unknown categories', () => {
      expect(generateIssueId('unknown', 1)).toBe('ISSUE-001');
    });
  });

  describe('Prompt Integration Tests', () => {
    it('should mention all category names in severity guidance', () => {
      // Verify severity section references the categories
      expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain(
        '"category": "security" | "architecture" | "logic" | "style" | "performance" | "testing" | "documentation"'
      );
    });

    it('should have consistent severity definitions between prompts', () => {
      // Both full and quick prompts should use the same severity values
      ['critical', 'high', 'medium', 'low', 'suggestion'].forEach((severity) => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain(severity);
        expect(SELF_REVIEWER_QUICK_PROMPT).toContain(severity);
      });
    });

    it('should have consistent verdict values between prompts', () => {
      ['pass', 'needs_work', 'critical_issues'].forEach((verdict) => {
        expect(SELF_REVIEWER_SYSTEM_PROMPT).toContain(verdict);
        expect(SELF_REVIEWER_QUICK_PROMPT).toContain(verdict);
      });
    });
  });
});
