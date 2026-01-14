/**
 * Feedback Fixer Prompts Library - AI-powered code refinement based on review feedback
 *
 * Provides prompt templates for the feedback-fixer agent that takes review issues
 * and applies targeted code refinements to address them while preserving functionality.
 *
 * The feedback-fixer agent is part of the Review Loop system and operates in two modes:
 * - Self-Review Mode: Addresses issues found during automatic self-review
 * - PR Feedback Mode: Addresses issues from human PR review comments
 */

import type { ReviewIssue, ReviewIssueSeverity } from '@automaker/types';

/**
 * System prompt for the feedback-fixer agent
 * Guides the agent to make targeted fixes while preserving functionality
 */
export const FEEDBACK_FIXER_SYSTEM_PROMPT = `You are an expert code reviewer and fixer. Your task is to address specific issues identified during code review and apply targeted fixes while preserving the existing functionality of the code.

## Core Principles

1. **Targeted Fixes Only**: Address ONLY the issues provided. Do not make unrelated changes or "improvements" that weren't requested.

2. **Preserve Functionality**: Your fixes must not break existing functionality. If a fix might affect other parts of the code, note this in your response.

3. **Minimal Changes**: Make the smallest changes necessary to address each issue. Avoid refactoring unless explicitly required.

4. **Maintain Style**: Match the existing code style, patterns, and conventions used in the codebase.

5. **Test Awareness**: If the codebase has tests, ensure your fixes don't break them. If appropriate, suggest or add tests for the fixed code.

## Issue Handling by Severity

- **Critical**: Must be fixed immediately. These are security vulnerabilities or correctness issues that could cause data loss or security breaches.
- **High**: Should be fixed. These are significant problems that affect reliability or maintainability.
- **Medium**: Should be addressed. These are moderate issues that improve code quality.
- **Low**: Nice to fix. These are minor issues that don't significantly impact the code.
- **Suggestion**: Optional improvements. Address these only if time permits and they don't complicate other fixes.

## Issue Handling by Category

- **Security**: Prioritize these fixes. Apply secure coding practices. Never introduce new vulnerabilities.
- **Architecture**: Consider the broader system impact. Ensure changes align with existing patterns.
- **Logic**: Verify the fix addresses the root cause, not just symptoms. Test edge cases.
- **Style**: Follow existing conventions. Be consistent with the codebase.
- **Performance**: Measure before and after if possible. Don't optimize prematurely.
- **Testing**: Ensure adequate coverage. Don't just make tests pass—make them meaningful.
- **Documentation**: Be clear and concise. Update related docs if code behavior changes.

## Output Format

For each issue you address:
1. Acknowledge the issue by its ID
2. Explain your fix approach briefly
3. Apply the fix
4. Note any side effects or related changes needed

If you cannot fix an issue (e.g., requires architectural changes beyond scope), explain why and suggest how it should be addressed.`;

/**
 * User prompt template for addressing review issues
 * Uses Handlebars-style template syntax consistent with other prompts
 */
export const FEEDBACK_FIXER_USER_PROMPT_TEMPLATE = `## Review Issues to Address

The following issues were identified during code review. Please address each one with targeted fixes.

### Feature Context
**Feature ID:** {{featureId}}
**Feature Title:** {{featureTitle}}
{{#if featureDescription}}
**Description:** {{featureDescription}}
{{/if}}

### Issues to Fix

{{#each issues}}
#### Issue {{id}} [{{severity}}] - {{category}}
{{#if file}}
**File:** {{file}}
{{#if lineStart}}**Lines:** {{lineStart}}{{#if lineEnd}}-{{lineEnd}}{{/if}}{{/if}}
{{/if}}
**Description:** {{description}}
{{#if suggestedFix}}
**Suggested Fix:** {{suggestedFix}}
{{/if}}

---
{{/each}}

### Instructions

1. Address each issue in order of severity (critical > high > medium > low > suggestion)
2. For each fix, briefly explain your approach before making changes
3. After all fixes, provide a summary of changes made
4. If any issues could not be addressed, explain why

**Important:** Focus on fixing the identified issues. Do not make unrelated changes or optimizations unless they are necessary to properly address an issue.`;

/**
 * System prompt specifically for addressing PR feedback from human reviewers
 * More conversational and considerate of reviewer intent
 */
export const PR_FEEDBACK_FIXER_SYSTEM_PROMPT = `You are an expert developer addressing feedback from human code reviewers on a pull request. Your task is to understand their concerns and apply appropriate fixes while maintaining a collaborative approach.

## Core Principles

1. **Understand Intent**: Human reviewers may express concerns in various ways. Look beyond the literal words to understand what they're really asking for.

2. **Respect Reviewer Expertise**: Reviewers often have context about the codebase that you might not have. When in doubt, err on the side of following their suggestions.

3. **Targeted Responses**: Address each piece of feedback specifically. Don't make assumptions about what else the reviewer might want.

4. **Preserve Functionality**: Your fixes must not break existing functionality or introduce new issues.

5. **Clear Communication**: For each change, explain what you did and why. This helps reviewers understand your approach.

## Handling Different Types of Feedback

### Direct Requests
"Please add error handling here" → Add appropriate error handling

### Questions
"Why is this done this way?" → Either explain the reasoning OR fix if there's no good reason

### Concerns
"This seems inefficient" → Evaluate and optimize if valid, or explain why it's acceptable

### Suggestions
"You might want to consider..." → Evaluate and implement if it improves the code

### Nitpicks
Style or formatting comments → Apply consistently across related code

## Response Format

For each piece of feedback:
1. Quote or reference the feedback
2. Explain your understanding of the concern
3. Describe your fix approach
4. Apply the fix
5. Note any related changes or considerations

## Important Notes

- If feedback conflicts with other feedback, note this and ask for clarification
- If a suggestion would require significant refactoring, explain the tradeoffs
- Be prepared to iterate—reviewers may have follow-up comments
- Maintain a respectful, professional tone in any comments or explanations`;

/**
 * User prompt template for addressing PR feedback
 */
export const PR_FEEDBACK_FIXER_USER_PROMPT_TEMPLATE = `## PR Feedback to Address

Human reviewers have provided feedback on the pull request. Please address each piece of feedback thoughtfully.

### PR Context
**PR Number:** #{{prNumber}}
**PR Title:** {{prTitle}}
{{#if prUrl}}
**PR URL:** {{prUrl}}
{{/if}}

### Feature Context
**Feature ID:** {{featureId}}
**Feature Title:** {{featureTitle}}

### Feedback Items

{{#each feedbackItems}}
#### Feedback from @{{author}}
{{#if file}}
**File:** {{file}}
{{#if line}}**Line:** {{line}}{{/if}}
{{/if}}
**Comment:**
> {{body}}

---
{{/each}}

### Instructions

1. Address each piece of feedback in order
2. For questions, provide explanations and/or code changes as appropriate
3. For suggestions, implement if beneficial or explain tradeoffs
4. Summarize all changes made at the end
5. Note any feedback that requires clarification or discussion

**Remember:** The goal is to address reviewer concerns while maintaining code quality. Some feedback may require discussion rather than immediate changes.`;

/**
 * Prompt for summarizing fixes made during a refinement iteration
 */
export const FEEDBACK_FIXER_SUMMARY_PROMPT = `Please provide a concise summary of all the fixes you made in this iteration.

Format your summary as:

## Fixes Applied

{{#each addressedIssues}}
- **{{id}}** ({{severity}}): [Brief description of fix]
{{/each}}

## Issues Not Addressed

{{#if unaddressedIssues}}
{{#each unaddressedIssues}}
- **{{id}}**: [Reason why not addressed]
{{/each}}
{{else}}
All issues were addressed.
{{/if}}

## Side Effects

[Note any changes that might affect other parts of the codebase]

## Testing Recommendations

[List any tests that should be run or added to verify the fixes]`;

/**
 * Example feedback-fixer interactions for few-shot learning (optional use)
 */
export interface FeedbackFixerExample {
  /** The issue being addressed */
  issue: {
    id: string;
    severity: ReviewIssueSeverity;
    category: string;
    file?: string;
    description: string;
    suggestedFix?: string;
  };
  /** The fix that was applied */
  fixApplied: string;
  /** Explanation of the fix approach */
  explanation: string;
}

/**
 * Few-shot examples for the feedback-fixer agent
 */
export const FEEDBACK_FIXER_EXAMPLES: FeedbackFixerExample[] = [
  {
    issue: {
      id: 'SEC-001',
      severity: 'critical',
      category: 'security',
      file: 'src/auth/login.ts',
      description: 'SQL injection vulnerability in user query',
      suggestedFix: 'Use parameterized queries instead of string concatenation',
    },
    fixApplied: `// Before:
const query = "SELECT * FROM users WHERE username = '" + username + "'";

// After:
const query = "SELECT * FROM users WHERE username = $1";
const result = await db.query(query, [username]);`,
    explanation:
      'Replaced string concatenation with parameterized query to prevent SQL injection. The $1 placeholder is safely substituted by the database driver, preventing malicious input from being executed as SQL.',
  },
  {
    issue: {
      id: 'LOGIC-002',
      severity: 'high',
      category: 'logic',
      file: 'src/utils/array.ts',
      description: 'Off-by-one error in array iteration causing last element to be skipped',
      suggestedFix:
        'Change < to <= in loop condition or use array.length instead of array.length - 1',
    },
    fixApplied: `// Before:
for (let i = 0; i < array.length - 1; i++) {
  process(array[i]);
}

// After:
for (let i = 0; i < array.length; i++) {
  process(array[i]);
}`,
    explanation:
      'Fixed the loop condition to iterate through all elements. The original code stopped one element early due to the incorrect length - 1 calculation.',
  },
  {
    issue: {
      id: 'PERF-003',
      severity: 'medium',
      category: 'performance',
      file: 'src/components/List.tsx',
      description: 'Component re-renders on every parent update due to missing memoization',
      suggestedFix: 'Wrap component with React.memo and memoize callback props',
    },
    fixApplied: `// Before:
function ListItem({ item, onClick }) {
  return <div onClick={() => onClick(item.id)}>{item.name}</div>;
}

// After:
const ListItem = React.memo(function ListItem({ item, onClick }) {
  const handleClick = useCallback(() => onClick(item.id), [onClick, item.id]);
  return <div onClick={handleClick}>{item.name}</div>;
});`,
    explanation:
      'Added React.memo to prevent unnecessary re-renders when props are unchanged. Also memoized the click handler with useCallback to maintain referential equality.',
  },
];

/**
 * Configuration for feedback-fixer behavior
 */
export interface FeedbackFixerConfig {
  /** Whether to include few-shot examples in the prompt */
  includeExamples: boolean;
  /** Maximum number of issues to address in a single iteration */
  maxIssuesPerIteration: number;
  /** Whether to automatically suggest tests for fixes */
  suggestTests: boolean;
  /** Severity threshold - only address issues at or above this severity */
  severityThreshold: ReviewIssueSeverity;
}

/**
 * Default feedback-fixer configuration
 */
export const DEFAULT_FEEDBACK_FIXER_CONFIG: FeedbackFixerConfig = {
  includeExamples: false,
  maxIssuesPerIteration: 10,
  suggestTests: true,
  severityThreshold: 'suggestion',
};

/**
 * Build the system prompt for feedback-fixer with optional examples
 */
export function buildFeedbackFixerSystemPrompt(includeExamples: boolean = false): string {
  if (!includeExamples) {
    return FEEDBACK_FIXER_SYSTEM_PROMPT;
  }

  const examplesSection = FEEDBACK_FIXER_EXAMPLES.map(
    (example, index) =>
      `### Example ${index + 1}: ${example.issue.category} issue (${example.issue.severity})

**Issue:** ${example.issue.description}
${example.issue.suggestedFix ? `**Suggested Fix:** ${example.issue.suggestedFix}` : ''}

**Approach:** ${example.explanation}

**Fix Applied:**
\`\`\`
${example.fixApplied}
\`\`\``
  ).join('\n\n');

  return `${FEEDBACK_FIXER_SYSTEM_PROMPT}

## Examples

Here are examples of how to address different types of issues:

${examplesSection}`;
}

/**
 * Build the user prompt for addressing review issues
 */
export function buildFeedbackFixerUserPrompt(
  featureId: string,
  featureTitle: string,
  issues: ReviewIssue[],
  featureDescription?: string
): string {
  // Sort issues by severity (critical first)
  const severityOrder: Record<ReviewIssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    suggestion: 4,
  };

  const sortedIssues = [...issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  const issueBlocks = sortedIssues
    .map((issue) => {
      let block = `#### Issue ${issue.id} [${issue.severity}] - ${issue.category}\n`;
      if (issue.file) {
        block += `**File:** ${issue.file}\n`;
        if (issue.lineStart) {
          block += `**Lines:** ${issue.lineStart}${issue.lineEnd ? `-${issue.lineEnd}` : ''}\n`;
        }
      }
      block += `**Description:** ${issue.description}\n`;
      if (issue.suggestedFix) {
        block += `**Suggested Fix:** ${issue.suggestedFix}\n`;
      }
      return block;
    })
    .join('\n---\n\n');

  let prompt = `## Review Issues to Address

The following issues were identified during code review. Please address each one with targeted fixes.

### Feature Context
**Feature ID:** ${featureId}
**Feature Title:** ${featureTitle}
`;

  if (featureDescription) {
    prompt += `**Description:** ${featureDescription}\n`;
  }

  prompt += `
### Issues to Fix

${issueBlocks}

### Instructions

1. Address each issue in order of severity (critical > high > medium > low > suggestion)
2. For each fix, briefly explain your approach before making changes
3. After all fixes, provide a summary of changes made
4. If any issues could not be addressed, explain why

**Important:** Focus on fixing the identified issues. Do not make unrelated changes or optimizations unless they are necessary to properly address an issue.`;

  return prompt;
}

/**
 * Build the user prompt for addressing PR feedback
 */
export function buildPRFeedbackFixerUserPrompt(
  prNumber: number,
  prTitle: string,
  featureId: string,
  featureTitle: string,
  feedbackItems: Array<{
    author: string;
    body: string;
    file?: string;
    line?: number;
  }>,
  prUrl?: string
): string {
  const feedbackBlocks = feedbackItems
    .map((item) => {
      let block = `#### Feedback from @${item.author}\n`;
      if (item.file) {
        block += `**File:** ${item.file}\n`;
        if (item.line) {
          block += `**Line:** ${item.line}\n`;
        }
      }
      block += `**Comment:**\n> ${item.body}\n`;
      return block;
    })
    .join('\n---\n\n');

  let prompt = `## PR Feedback to Address

Human reviewers have provided feedback on the pull request. Please address each piece of feedback thoughtfully.

### PR Context
**PR Number:** #${prNumber}
**PR Title:** ${prTitle}
`;

  if (prUrl) {
    prompt += `**PR URL:** ${prUrl}\n`;
  }

  prompt += `
### Feature Context
**Feature ID:** ${featureId}
**Feature Title:** ${featureTitle}

### Feedback Items

${feedbackBlocks}

### Instructions

1. Address each piece of feedback in order
2. For questions, provide explanations and/or code changes as appropriate
3. For suggestions, implement if beneficial or explain tradeoffs
4. Summarize all changes made at the end
5. Note any feedback that requires clarification or discussion

**Remember:** The goal is to address reviewer concerns while maintaining code quality. Some feedback may require discussion rather than immediate changes.`;

  return prompt;
}

/**
 * Filter issues based on severity threshold
 */
export function filterIssuesBySeverity(
  issues: ReviewIssue[],
  threshold: ReviewIssueSeverity
): ReviewIssue[] {
  const severityOrder: Record<ReviewIssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    suggestion: 4,
  };

  const thresholdValue = severityOrder[threshold];
  return issues.filter((issue) => severityOrder[issue.severity] <= thresholdValue);
}

/**
 * Group issues by file for organized fixing
 */
export function groupIssuesByFile(issues: ReviewIssue[]): Map<string, ReviewIssue[]> {
  const grouped = new Map<string, ReviewIssue[]>();

  for (const issue of issues) {
    const file = issue.file || '__general__';
    const existing = grouped.get(file) || [];
    existing.push(issue);
    grouped.set(file, existing);
  }

  return grouped;
}

/**
 * Check if all critical and high severity issues have been addressed
 */
export function hasBlockingIssues(issues: ReviewIssue[], addressedIssueIds: string[]): boolean {
  const blockingIssues = issues.filter(
    (issue) =>
      (issue.severity === 'critical' || issue.severity === 'high') &&
      !addressedIssueIds.includes(issue.id)
  );

  return blockingIssues.length > 0;
}
