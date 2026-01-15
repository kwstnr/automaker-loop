/**
 * Quality Gate Evaluator Service
 *
 * Evaluates code against quality thresholds to determine if PR creation should be blocked.
 * Checks issue severity counts, category requirements, test coverage, complexity, and duplication.
 */

import { createLogger } from '@automaker/utils';
import type {
  ReviewIssue,
  ReviewIssueSeverity,
  ReviewIssueCategory,
  QualityGateThresholds,
  QualityGateCheckResult,
  QualityGateEvaluationResult,
  QualityGateEvaluationInput,
  IssueSeverityCounts,
  IssueCategoryCounts,
} from '@automaker/types';
import { DEFAULT_QUALITY_GATE_THRESHOLDS } from '@automaker/types';

const logger = createLogger('QualityGateEvaluator');

/**
 * Severity levels in order from most to least severe
 */
const SEVERITY_ORDER: ReviewIssueSeverity[] = ['critical', 'high', 'medium', 'low', 'suggestion'];

/**
 * All issue categories
 */
const ALL_CATEGORIES: ReviewIssueCategory[] = [
  'security',
  'architecture',
  'logic',
  'style',
  'performance',
  'testing',
  'documentation',
];

/**
 * Check if a severity level is at or above a threshold
 *
 * @param severity - The severity to check
 * @param threshold - The threshold severity
 * @returns true if severity is at or above threshold (more severe or equal)
 */
export function isSeverityAtOrAbove(
  severity: ReviewIssueSeverity,
  threshold: ReviewIssueSeverity
): boolean {
  const severityIndex = SEVERITY_ORDER.indexOf(severity);
  const thresholdIndex = SEVERITY_ORDER.indexOf(threshold);
  return severityIndex <= thresholdIndex;
}

/**
 * Count issues by severity level
 *
 * @param issues - Array of review issues
 * @returns Object with counts for each severity level
 */
export function countIssuesBySeverity(issues: ReviewIssue[]): IssueSeverityCounts {
  const counts: IssueSeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    suggestion: 0,
  };

  for (const issue of issues) {
    counts[issue.severity]++;
  }

  return counts;
}

/**
 * Count issues by category
 *
 * @param issues - Array of review issues
 * @returns Object with counts for each category
 */
export function countIssuesByCategory(issues: ReviewIssue[]): IssueCategoryCounts {
  const counts: IssueCategoryCounts = {
    security: 0,
    architecture: 0,
    logic: 0,
    style: 0,
    performance: 0,
    testing: 0,
    documentation: 0,
  };

  for (const issue of issues) {
    counts[issue.category]++;
  }

  return counts;
}

/**
 * Count issues at or above a severity threshold
 *
 * @param issues - Array of review issues
 * @param threshold - Severity threshold
 * @returns Count of issues at or above the threshold
 */
export function countIssuesAtOrAboveSeverity(
  issues: ReviewIssue[],
  threshold: ReviewIssueSeverity
): number {
  return issues.filter((issue) => isSeverityAtOrAbove(issue.severity, threshold)).length;
}

/**
 * Get issues in a specific category
 *
 * @param issues - Array of review issues
 * @param category - Category to filter by
 * @returns Array of issues in the specified category
 */
export function getIssuesInCategory(
  issues: ReviewIssue[],
  category: ReviewIssueCategory
): ReviewIssue[] {
  return issues.filter((issue) => issue.category === category);
}

/**
 * Check severity threshold requirement
 *
 * @param issues - Array of review issues
 * @param severityThreshold - Severity threshold from config
 * @returns Check result
 */
function checkSeverityThreshold(
  issues: ReviewIssue[],
  severityThreshold: ReviewIssueSeverity
): QualityGateCheckResult {
  const blockingIssuesCount = countIssuesAtOrAboveSeverity(issues, severityThreshold);
  const blockingIssues = issues.filter((issue) =>
    isSeverityAtOrAbove(issue.severity, severityThreshold)
  );

  if (blockingIssuesCount === 0) {
    return {
      name: 'Severity Threshold',
      status: 'passed',
      message: `No issues at or above '${severityThreshold}' severity`,
      currentValue: 0,
      threshold: 0,
    };
  }

  return {
    name: 'Severity Threshold',
    status: 'failed',
    message: `Found ${blockingIssuesCount} issue(s) at or above '${severityThreshold}' severity`,
    currentValue: blockingIssuesCount,
    threshold: 0,
    details: blockingIssues
      .slice(0, 5)
      .map((issue) => `[${issue.severity}] ${issue.description.substring(0, 100)}`),
  };
}

/**
 * Check required categories (must have zero issues)
 *
 * @param issues - Array of review issues
 * @param requiredCategories - Categories that must have zero issues
 * @returns Check result
 */
function checkRequiredCategories(
  issues: ReviewIssue[],
  requiredCategories: ReviewIssueCategory[]
): QualityGateCheckResult {
  if (requiredCategories.length === 0) {
    return {
      name: 'Required Categories',
      status: 'skipped',
      message: 'No required categories configured',
    };
  }

  const failedCategories: { category: ReviewIssueCategory; count: number }[] = [];
  const details: string[] = [];

  for (const category of requiredCategories) {
    const categoryIssues = getIssuesInCategory(issues, category);
    if (categoryIssues.length > 0) {
      failedCategories.push({ category, count: categoryIssues.length });
      for (const issue of categoryIssues.slice(0, 3)) {
        details.push(`[${category}] ${issue.description.substring(0, 80)}`);
      }
    }
  }

  if (failedCategories.length === 0) {
    return {
      name: 'Required Categories',
      status: 'passed',
      message: `All required categories (${requiredCategories.join(', ')}) have zero issues`,
    };
  }

  const failedSummary = failedCategories.map((f) => `${f.category}: ${f.count}`).join(', ');

  return {
    name: 'Required Categories',
    status: 'failed',
    message: `Issues found in required categories: ${failedSummary}`,
    details,
  };
}

/**
 * Check test coverage threshold
 *
 * @param testCoverage - Current test coverage percentage (0-100)
 * @param minTestCoverage - Minimum required coverage
 * @returns Check result
 */
function checkTestCoverage(
  testCoverage: number | undefined,
  minTestCoverage: number
): QualityGateCheckResult {
  if (testCoverage === undefined) {
    return {
      name: 'Test Coverage',
      status: 'skipped',
      message: 'Test coverage data not available',
    };
  }

  if (testCoverage >= minTestCoverage) {
    return {
      name: 'Test Coverage',
      status: 'passed',
      message: `Test coverage ${testCoverage.toFixed(1)}% meets minimum ${minTestCoverage}%`,
      currentValue: testCoverage,
      threshold: minTestCoverage,
    };
  }

  return {
    name: 'Test Coverage',
    status: 'failed',
    message: `Test coverage ${testCoverage.toFixed(1)}% is below minimum ${minTestCoverage}%`,
    currentValue: testCoverage,
    threshold: minTestCoverage,
  };
}

/**
 * Check cyclomatic complexity threshold
 *
 * @param complexityByFunction - Map of function names to complexity values
 * @param maxComplexity - Maximum allowed complexity per function
 * @returns Check result
 */
function checkComplexity(
  complexityByFunction: Record<string, number> | undefined,
  maxComplexity: number
): QualityGateCheckResult {
  if (!complexityByFunction || Object.keys(complexityByFunction).length === 0) {
    return {
      name: 'Code Complexity',
      status: 'skipped',
      message: 'Complexity data not available',
    };
  }

  const violations: { name: string; complexity: number }[] = [];
  let maxFound = 0;

  for (const [funcName, complexity] of Object.entries(complexityByFunction)) {
    if (complexity > maxComplexity) {
      violations.push({ name: funcName, complexity });
    }
    maxFound = Math.max(maxFound, complexity);
  }

  if (violations.length === 0) {
    return {
      name: 'Code Complexity',
      status: 'passed',
      message: `All functions have complexity ≤ ${maxComplexity} (max found: ${maxFound})`,
      currentValue: maxFound,
      threshold: maxComplexity,
    };
  }

  violations.sort((a, b) => b.complexity - a.complexity);

  return {
    name: 'Code Complexity',
    status: 'failed',
    message: `${violations.length} function(s) exceed complexity limit of ${maxComplexity}`,
    currentValue: violations[0].complexity,
    threshold: maxComplexity,
    details: violations.slice(0, 5).map((v) => `${v.name}: complexity ${v.complexity}`),
  };
}

/**
 * Check code duplication threshold
 *
 * @param duplicationPercentage - Current duplication percentage (0-100)
 * @param maxDuplication - Maximum allowed duplication
 * @returns Check result
 */
function checkDuplication(
  duplicationPercentage: number | undefined,
  maxDuplication: number
): QualityGateCheckResult {
  if (duplicationPercentage === undefined) {
    return {
      name: 'Code Duplication',
      status: 'skipped',
      message: 'Duplication data not available',
    };
  }

  if (duplicationPercentage <= maxDuplication) {
    return {
      name: 'Code Duplication',
      status: 'passed',
      message: `Code duplication ${duplicationPercentage.toFixed(1)}% is within limit of ${maxDuplication}%`,
      currentValue: duplicationPercentage,
      threshold: maxDuplication,
    };
  }

  return {
    name: 'Code Duplication',
    status: 'failed',
    message: `Code duplication ${duplicationPercentage.toFixed(1)}% exceeds limit of ${maxDuplication}%`,
    currentValue: duplicationPercentage,
    threshold: maxDuplication,
  };
}

/**
 * Generate a human-readable summary of the evaluation
 *
 * @param verdict - Overall verdict
 * @param checks - All check results
 * @param severityCounts - Issue counts by severity
 * @returns Summary string
 */
function generateSummary(
  verdict: 'passed' | 'failed' | 'warning',
  checks: QualityGateCheckResult[],
  severityCounts: IssueSeverityCounts
): string {
  const failedChecks = checks.filter((c) => c.status === 'failed');
  const passedChecks = checks.filter((c) => c.status === 'passed');
  const skippedChecks = checks.filter((c) => c.status === 'skipped');

  const totalIssues =
    severityCounts.critical +
    severityCounts.high +
    severityCounts.medium +
    severityCounts.low +
    severityCounts.suggestion;

  let summary = '';

  if (verdict === 'passed') {
    summary = `Quality gate passed. ${passedChecks.length} check(s) passed`;
    if (skippedChecks.length > 0) {
      summary += `, ${skippedChecks.length} skipped`;
    }
    summary += '.';
    if (totalIssues > 0) {
      summary += ` ${totalIssues} non-blocking issue(s) found.`;
    }
  } else if (verdict === 'failed') {
    summary = `Quality gate failed. ${failedChecks.length} check(s) failed: ${failedChecks.map((c) => c.name).join(', ')}.`;
    if (severityCounts.critical > 0) {
      summary += ` ${severityCounts.critical} critical issue(s).`;
    }
    if (severityCounts.high > 0) {
      summary += ` ${severityCounts.high} high severity issue(s).`;
    }
  } else {
    summary = `Quality gate passed with warnings. ${passedChecks.length} check(s) passed, ${skippedChecks.length} skipped.`;
  }

  return summary;
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

/**
 * Evaluate code quality against configured thresholds
 *
 * This is the main entry point for quality gate evaluation. It checks:
 * 1. Issue severity threshold - ensures no issues at or above the configured severity
 * 2. Required categories - ensures zero issues in specified categories (e.g., security)
 * 3. Test coverage - ensures coverage meets minimum threshold
 * 4. Code complexity - ensures no functions exceed complexity limit
 * 5. Code duplication - ensures duplication percentage is within limit
 *
 * @param input - Evaluation input containing issues, thresholds, and optional metrics
 * @returns Complete evaluation result with verdict, checks, and counts
 */
export function evaluateQualityGate(
  input: QualityGateEvaluationInput
): QualityGateEvaluationResult {
  const {
    issues,
    thresholds,
    severityThreshold,
    testCoverage,
    complexityByFunction,
    duplicationPercentage,
  } = input;

  logger.info(
    `Evaluating quality gate: ${issues.length} issues, severity threshold: ${severityThreshold}`
  );

  // Count issues by severity and category
  const severityCounts = countIssuesBySeverity(issues);
  const categoryCounts = countIssuesByCategory(issues);

  // Run all checks
  const checks: QualityGateCheckResult[] = [];

  // Check 1: Severity threshold
  checks.push(checkSeverityThreshold(issues, severityThreshold));

  // Check 2: Required categories
  checks.push(checkRequiredCategories(issues, thresholds.requiredCategories));

  // Check 3: Test coverage
  checks.push(checkTestCoverage(testCoverage, thresholds.minTestCoverage));

  // Check 4: Code complexity
  checks.push(checkComplexity(complexityByFunction, thresholds.maxComplexity));

  // Check 5: Code duplication
  checks.push(checkDuplication(duplicationPercentage, thresholds.maxDuplication));

  // Determine verdict
  const failedChecks = checks.filter((c) => c.status === 'failed');
  const passedChecks = checks.filter((c) => c.status === 'passed');

  let verdict: 'passed' | 'failed' | 'warning';
  let shouldBlockPR: boolean;

  if (failedChecks.length > 0) {
    verdict = 'failed';
    shouldBlockPR = true;
    logger.warn(`Quality gate failed: ${failedChecks.map((c) => c.name).join(', ')}`);
  } else if (passedChecks.length === 0) {
    // All checks were skipped
    verdict = 'warning';
    shouldBlockPR = false;
    logger.info('Quality gate passed with all checks skipped');
  } else {
    verdict = 'passed';
    shouldBlockPR = false;
    logger.info('Quality gate passed');
  }

  const summary = generateSummary(verdict, checks, severityCounts);

  return {
    verdict,
    shouldBlockPR,
    summary,
    checks,
    severityCounts,
    categoryCounts,
    totalIssues: issues.length,
    evaluatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if issues would pass quality gate with default thresholds
 *
 * @param issues - Array of review issues
 * @param severityThreshold - Severity threshold (default: 'medium')
 * @returns true if quality gate would pass
 */
export function wouldPassQualityGate(
  issues: ReviewIssue[],
  severityThreshold: ReviewIssueSeverity = 'medium'
): boolean {
  const result = evaluateQualityGate({
    issues,
    thresholds: DEFAULT_QUALITY_GATE_THRESHOLDS,
    severityThreshold,
  });
  return !result.shouldBlockPR;
}

/**
 * Get a quick summary of issue counts
 *
 * @param issues - Array of review issues
 * @returns Object with severity and category counts
 */
export function getIssueSummary(issues: ReviewIssue[]): {
  severityCounts: IssueSeverityCounts;
  categoryCounts: IssueCategoryCounts;
  total: number;
} {
  return {
    severityCounts: countIssuesBySeverity(issues),
    categoryCounts: countIssuesByCategory(issues),
    total: issues.length,
  };
}

/**
 * Filter issues to only those that would block PR creation
 *
 * @param issues - Array of review issues
 * @param severityThreshold - Severity threshold
 * @param requiredCategories - Categories that must have zero issues
 * @returns Array of blocking issues
 */
export function getBlockingIssues(
  issues: ReviewIssue[],
  severityThreshold: ReviewIssueSeverity,
  requiredCategories: ReviewIssueCategory[] = ['security']
): ReviewIssue[] {
  return issues.filter((issue) => {
    // Check if at or above severity threshold
    if (isSeverityAtOrAbove(issue.severity, severityThreshold)) {
      return true;
    }
    // Check if in a required category (any issue in required category blocks)
    if (requiredCategories.includes(issue.category)) {
      return true;
    }
    return false;
  });
}
