/**
 * Self-Review Prompts Library
 *
 * Provides prompt templates for the self-review system that analyzes code changes
 * before PR creation. Uses code context to understand dependencies and relationships
 * between files.
 */

import type { ReviewIssue } from '@automaker/types';

// Re-define types from code-context.ts to avoid build dependency issues
// These are duplicated from @automaker/types for build compatibility

/**
 * A dependency identified from imports
 */
interface IdentifiedDependency {
  moduleSpecifier: string;
  dependencyType: 'local' | 'workspace' | 'external' | 'builtin';
  resolvedPath?: string;
  importedBy: string[];
  usedExports: string[];
}

/**
 * A related file that provides context for changes
 */
interface RelatedFile {
  path: string;
  relationship: string;
  relevanceScore: number;
  reason: string;
}

/**
 * Summary statistics for code context
 */
interface CodeContextSummary {
  filesAnalyzed: number;
  totalImports: number;
  localDependencies: number;
  externalDependencies: number;
  relatedFilesCount: number;
  parseErrors: number;
}

/**
 * Complete code context for review analysis
 */
export interface CodeContext {
  changedFiles: string[];
  dependencies: IdentifiedDependency[];
  relatedFiles: RelatedFile[];
  summary: CodeContextSummary;
}

/**
 * Result of formatting code context for review
 */
export interface FormattedCodeContext {
  text: string;
  estimatedTokens: number;
  wasTruncated: boolean;
}

/**
 * System prompt for self-review agent
 */
export const SELF_REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer performing a thorough self-review of code changes before they are submitted for human review. Your goal is to identify issues that should be addressed before creating a pull request.

## Review Focus Areas

### 1. Security (Critical Priority)
- SQL injection, XSS, CSRF vulnerabilities
- Hardcoded secrets or credentials
- Insecure authentication/authorization
- Input validation gaps
- Unsafe file operations

### 2. Logic & Correctness (High Priority)
- Off-by-one errors
- Null/undefined handling
- Race conditions
- Edge case handling
- Type safety issues

### 3. Architecture & Design (Medium Priority)
- Code duplication
- Separation of concerns
- Proper abstraction levels
- Adherence to existing patterns
- Module boundaries

### 4. Performance (Medium Priority)
- Unnecessary re-renders (React)
- N+1 queries
- Memory leaks
- Inefficient algorithms
- Missing memoization

### 5. Testing (Medium Priority)
- Missing test coverage
- Incomplete edge case testing
- Test quality issues

### 6. Documentation (Low Priority)
- Missing or outdated comments
- API documentation gaps
- README updates needed

### 7. Style & Conventions (Suggestion)
- Code style consistency
- Naming conventions
- File organization

## Output Format

Provide your review as a JSON object with the following structure:

\`\`\`json
{
  "verdict": "pass" | "needs_work" | "critical_issues",
  "summary": "Brief summary of findings",
  "issues": [
    {
      "id": "unique-issue-id",
      "severity": "critical" | "high" | "medium" | "low" | "suggestion",
      "category": "security" | "architecture" | "logic" | "style" | "performance" | "testing" | "documentation",
      "file": "path/to/file.ts",
      "lineStart": 42,
      "lineEnd": 45,
      "description": "Clear description of the issue",
      "suggestedFix": "How to fix this issue"
    }
  ]
}
\`\`\`

## Verdict Guidelines

- **pass**: No blocking issues found. Code is ready for human review.
- **needs_work**: Has issues that should be addressed before PR creation.
- **critical_issues**: Has critical issues (security, major bugs) that must be fixed.

## Important Notes

1. Be thorough but practical - not every minor issue needs to be flagged
2. Consider the context of changes - new code vs modifications
3. Reference specific lines when possible
4. Provide actionable suggestions for each issue
5. Use the code context provided to understand dependencies`;

/**
 * Build a self-review user prompt with code context
 */
export function buildSelfReviewPrompt(
  diff: string,
  codeContext?: FormattedCodeContext,
  featureTitle?: string,
  featureDescription?: string
): string {
  let prompt = '## Self-Review Request\n\n';

  // Add feature context if available
  if (featureTitle) {
    prompt += `### Feature Context\n`;
    prompt += `**Title:** ${featureTitle}\n`;
    if (featureDescription) {
      prompt += `**Description:** ${featureDescription}\n`;
    }
    prompt += '\n';
  }

  // Add code context if available
  if (codeContext) {
    prompt += `### Code Context\n\n`;
    prompt += codeContext.text;
    prompt += '\n\n';
  }

  // Add the diff
  prompt += `### Changes to Review\n\n`;
  prompt += '```diff\n';
  prompt += diff;
  prompt += '\n```\n\n';

  // Add review instructions
  prompt += `### Review Instructions\n\n`;
  prompt += `Please perform a thorough self-review of the changes above. Consider:\n\n`;
  prompt += `1. Are there any security vulnerabilities?\n`;
  prompt += `2. Is the logic correct and complete?\n`;
  prompt += `3. Are edge cases handled properly?\n`;
  prompt += `4. Does the code follow existing patterns and conventions?\n`;
  prompt += `5. Are there any performance concerns?\n`;
  prompt += `6. Is test coverage adequate?\n\n`;
  prompt += `Provide your review in the JSON format specified in the system prompt.`;

  return prompt;
}

/**
 * Build a self-review prompt with full code context
 */
export function buildSelfReviewPromptWithContext(
  diff: string,
  codeContext: CodeContext,
  maxContextTokens: number = 4000,
  featureTitle?: string,
  featureDescription?: string
): string {
  // Format the code context with token limits
  const formattedContext = formatCodeContextForReview(codeContext, maxContextTokens);

  return buildSelfReviewPrompt(diff, formattedContext, featureTitle, featureDescription);
}

/**
 * Format code context for inclusion in review prompts
 */
export function formatCodeContextForReview(
  context: CodeContext,
  maxTokens: number = 4000
): FormattedCodeContext {
  const sections: string[] = [];
  let estimatedTokens = 0;
  let wasTruncated = false;

  // Helper to estimate tokens
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

  // Add summary
  const summarySection = `**Files analyzed:** ${context.summary.filesAnalyzed}
**Total imports:** ${context.summary.totalImports}
**Local dependencies:** ${context.summary.localDependencies}
**External dependencies:** ${context.summary.externalDependencies}
**Related files:** ${context.summary.relatedFilesCount}`;

  sections.push(summarySection);
  estimatedTokens += estimateTokens(summarySection);

  // Add dependency information
  const localDeps = context.dependencies.filter((d: IdentifiedDependency) => d.dependencyType === 'local');
  if (localDeps.length > 0) {
    const depsSection = `\n#### Key Local Dependencies\n` +
      localDeps
        .slice(0, 10)
        .map((d: IdentifiedDependency) => `- \`${d.moduleSpecifier}\` → ${d.resolvedPath || 'unresolved'} (used by: ${d.importedBy.join(', ')})`)
        .join('\n');

    const depsTokens = estimateTokens(depsSection);
    if (estimatedTokens + depsTokens <= maxTokens) {
      sections.push(depsSection);
      estimatedTokens += depsTokens;
    } else {
      wasTruncated = true;
    }
  }

  // Add related files
  if (context.relatedFiles.length > 0) {
    const relatedSection = `\n#### Related Files\n` +
      context.relatedFiles
        .slice(0, 10)
        .map((r: RelatedFile) => `- \`${r.path}\` (${r.relationship}): ${r.reason}`)
        .join('\n');

    const relatedTokens = estimateTokens(relatedSection);
    if (estimatedTokens + relatedTokens <= maxTokens) {
      sections.push(relatedSection);
      estimatedTokens += relatedTokens;
    } else {
      wasTruncated = true;
    }
  }

  if (wasTruncated) {
    sections.push('\n_[Context truncated for brevity]_');
  }

  return {
    text: sections.join('\n'),
    estimatedTokens,
    wasTruncated,
  };
}

/**
 * Parse self-review response to extract issues
 */
export function parseSelfReviewResponse(response: string): {
  verdict: 'pass' | 'needs_work' | 'critical_issues';
  summary: string;
  issues: ReviewIssue[];
} {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : response;

  try {
    // Try to find JSON object in the string
    const jsonStartIndex = jsonStr.indexOf('{');
    const jsonEndIndex = jsonStr.lastIndexOf('}');

    if (jsonStartIndex === -1 || jsonEndIndex === -1) {
      throw new Error('No JSON object found in response');
    }

    const cleanedJson = jsonStr.substring(jsonStartIndex, jsonEndIndex + 1);
    const parsed = JSON.parse(cleanedJson);

    // Validate the structure
    const verdict = parsed.verdict as 'pass' | 'needs_work' | 'critical_issues';
    if (!['pass', 'needs_work', 'critical_issues'].includes(verdict)) {
      throw new Error(`Invalid verdict: ${verdict}`);
    }

    const issues: ReviewIssue[] = (parsed.issues || []).map((issue: Record<string, unknown>, index: number) => ({
      id: (issue.id as string) || `issue-${index + 1}`,
      severity: (issue.severity as ReviewIssue['severity']) || 'medium',
      category: (issue.category as ReviewIssue['category']) || 'logic',
      file: issue.file as string | undefined,
      lineStart: issue.lineStart as number | undefined,
      lineEnd: issue.lineEnd as number | undefined,
      description: (issue.description as string) || 'No description provided',
      suggestedFix: issue.suggestedFix as string | undefined,
    }));

    return {
      verdict,
      summary: (parsed.summary as string) || 'No summary provided',
      issues,
    };
  } catch (error) {
    // If parsing fails, return a default response indicating manual review needed
    return {
      verdict: 'needs_work',
      summary: 'Failed to parse self-review response. Manual review recommended.',
      issues: [
        {
          id: 'parse-error',
          severity: 'medium',
          category: 'logic',
          description: `Self-review response could not be parsed: ${(error as Error).message}`,
        },
      ],
    };
  }
}

/**
 * Configuration for self-review behavior
 */
export interface SelfReviewConfig {
  /** Maximum tokens for code context */
  maxContextTokens: number;
  /** Include test files in context */
  includeTestFiles: boolean;
  /** Include type definitions in context */
  includeTypeDefinitions: boolean;
  /** Categories to always flag regardless of severity */
  alwaysFlagCategories: ReviewIssue['category'][];
}

/**
 * Default self-review configuration
 */
export const DEFAULT_SELF_REVIEW_CONFIG: SelfReviewConfig = {
  maxContextTokens: 4000,
  includeTestFiles: true,
  includeTypeDefinitions: true,
  alwaysFlagCategories: ['security'],
};
