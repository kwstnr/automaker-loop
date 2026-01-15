/**
 * Diff Analyzer - Parses and analyzes git diffs to extract structured information
 *
 * Provides utilities for parsing unified diff format to extract:
 * - Changed files with their status (added, modified, deleted, renamed)
 * - Line ranges for each change hunk
 * - Code context for changed lines
 *
 * This structured output is designed for use with the self-review service.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('DiffAnalyzer');

// ============================================================================
// Types
// ============================================================================

/**
 * Type of change for a file in the diff
 */
export type DiffFileChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'binary';

/**
 * Type of change for a line in the diff
 */
export type DiffLineChangeType = 'added' | 'removed' | 'context';

/**
 * A single line in a diff hunk
 */
export interface DiffLine {
  /** Type of change for this line */
  type: DiffLineChangeType;
  /** Line number in the old file (null for added lines) */
  oldLineNumber: number | null;
  /** Line number in the new file (null for removed lines) */
  newLineNumber: number | null;
  /** The actual content of the line (without the +/- prefix) */
  content: string;
}

/**
 * A hunk represents a contiguous section of changes in a file
 */
export interface DiffHunk {
  /** Starting line in the old file */
  oldStart: number;
  /** Number of lines in old file for this hunk */
  oldCount: number;
  /** Starting line in the new file */
  newStart: number;
  /** Number of lines in new file for this hunk */
  newCount: number;
  /** Optional header text (e.g., function name) */
  header?: string;
  /** Lines in this hunk */
  lines: DiffLine[];
}

/**
 * A changed file in the diff
 */
export interface DiffFile {
  /** Path to the file (new path for renamed files) */
  path: string;
  /** Original path (for renamed files, otherwise same as path) */
  oldPath: string;
  /** Type of change */
  changeType: DiffFileChangeType;
  /** Hunks of changes in this file */
  hunks: DiffHunk[];
  /** Whether this is a binary file */
  isBinary: boolean;
}

/**
 * Summary statistics for a diff
 */
export interface DiffSummary {
  /** Total number of files changed */
  filesChanged: number;
  /** Number of files added */
  filesAdded: number;
  /** Number of files modified */
  filesModified: number;
  /** Number of files deleted */
  filesDeleted: number;
  /** Number of files renamed */
  filesRenamed: number;
  /** Total lines added across all files */
  linesAdded: number;
  /** Total lines removed across all files */
  linesRemoved: number;
}

/**
 * The complete analyzed diff result
 */
export interface AnalyzedDiff {
  /** List of changed files with their details */
  files: DiffFile[];
  /** Summary statistics */
  summary: DiffSummary;
  /** The raw diff string */
  rawDiff: string;
}

/**
 * Options for code context extraction
 */
export interface CodeContextOptions {
  /** Number of context lines before each change */
  linesBefore?: number;
  /** Number of context lines after each change */
  linesAfter?: number;
  /** Maximum length for file content (prevents memory issues with large files) */
  maxFileLength?: number;
}

/**
 * Code context for a specific file's changes
 */
export interface FileCodeContext {
  /** Path to the file */
  path: string;
  /** Ranges of changes with surrounding context */
  ranges: CodeContextRange[];
}

/**
 * A range of code with context around changes
 */
export interface CodeContextRange {
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based) */
  endLine: number;
  /** The code content for this range */
  content: string;
  /** Lines that were added in this range */
  addedLines: number[];
  /** Lines that were removed (these are from the old file) */
  removedLines: number[];
}

// ============================================================================
// Parser Implementation
// ============================================================================

/**
 * Regular expressions for parsing unified diff format
 */
const DIFF_FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const DIFF_OLD_FILE = /^--- (?:a\/)?(.+)$/;
const DIFF_NEW_FILE = /^\+\+\+ (?:b\/)?(.+)$/;
const DIFF_HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const DIFF_NEW_FILE_MODE = /^new file mode \d+$/;
const DIFF_DELETED_FILE_MODE = /^deleted file mode \d+$/;
const DIFF_RENAME_FROM = /^rename from (.+)$/;
const DIFF_RENAME_TO = /^rename to (.+)$/;
const DIFF_BINARY_FILE = /^Binary files? .* (?:added|changed|deleted|differ)$/;
const DIFF_SIMILARITY = /^similarity index \d+%$/;

/**
 * Parse a unified diff string into structured data
 *
 * @param diffContent - The unified diff string to parse
 * @returns Analyzed diff with files, hunks, and summary statistics
 */
export function parseDiff(diffContent: string): AnalyzedDiff {
  const files: DiffFile[] = [];
  const lines = diffContent.split('\n');
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  let renameFrom = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for new file header
    const fileHeaderMatch = line.match(DIFF_FILE_HEADER);
    if (fileHeaderMatch) {
      // Save previous file if exists
      if (currentFile) {
        if (currentHunk && currentHunk.lines.length > 0) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }

      // Start new file
      const oldPath = fileHeaderMatch[1];
      const newPath = fileHeaderMatch[2];
      currentFile = {
        path: newPath,
        oldPath: oldPath,
        changeType: 'modified',
        hunks: [],
        isBinary: false,
      };
      currentHunk = null;
      renameFrom = '';
      continue;
    }

    if (!currentFile) continue;

    // Check for new file mode
    if (DIFF_NEW_FILE_MODE.test(line)) {
      currentFile.changeType = 'added';
      continue;
    }

    // Check for deleted file mode
    if (DIFF_DELETED_FILE_MODE.test(line)) {
      currentFile.changeType = 'deleted';
      continue;
    }

    // Check for rename
    const renameFromMatch = line.match(DIFF_RENAME_FROM);
    if (renameFromMatch) {
      renameFrom = renameFromMatch[1];
      continue;
    }

    const renameToMatch = line.match(DIFF_RENAME_TO);
    if (renameToMatch) {
      currentFile.changeType = 'renamed';
      currentFile.oldPath = renameFrom;
      currentFile.path = renameToMatch[1];
      continue;
    }

    // Check for similarity index (part of rename)
    if (DIFF_SIMILARITY.test(line)) {
      continue;
    }

    // Check for binary file
    if (DIFF_BINARY_FILE.test(line)) {
      currentFile.isBinary = true;
      currentFile.changeType = 'binary';
      continue;
    }

    // Check for old file path (--- line)
    const oldFileMatch = line.match(DIFF_OLD_FILE);
    if (oldFileMatch) {
      if (oldFileMatch[1] === '/dev/null') {
        currentFile.changeType = 'added';
      }
      continue;
    }

    // Check for new file path (+++ line)
    const newFileMatch = line.match(DIFF_NEW_FILE);
    if (newFileMatch) {
      if (newFileMatch[1] === '/dev/null') {
        currentFile.changeType = 'deleted';
      }
      continue;
    }

    // Check for hunk header
    const hunkMatch = line.match(DIFF_HUNK_HEADER);
    if (hunkMatch) {
      // Save previous hunk if exists
      if (currentHunk && currentHunk.lines.length > 0) {
        currentFile.hunks.push(currentHunk);
      }

      oldLineNum = parseInt(hunkMatch[1], 10);
      const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      newLineNum = parseInt(hunkMatch[3], 10);
      const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;
      const header = hunkMatch[5]?.trim();

      currentHunk = {
        oldStart: oldLineNum,
        oldCount,
        newStart: newLineNum,
        newCount,
        header: header || undefined,
        lines: [],
      };
      continue;
    }

    // Parse diff content lines
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'added',
          oldLineNumber: null,
          newLineNumber: newLineNum,
          content: line.substring(1),
        });
        newLineNum++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'removed',
          oldLineNumber: oldLineNum,
          newLineNumber: null,
          content: line.substring(1),
        });
        oldLineNum++;
      } else if (line.startsWith(' ') || line === '') {
        // Context line or empty line
        currentHunk.lines.push({
          type: 'context',
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum,
          content: line.startsWith(' ') ? line.substring(1) : line,
        });
        oldLineNum++;
        newLineNum++;
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" - skip
        continue;
      }
    }
  }

  // Don't forget the last file
  if (currentFile) {
    if (currentHunk && currentHunk.lines.length > 0) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  // Calculate summary
  const summary = calculateSummary(files);

  return {
    files,
    summary,
    rawDiff: diffContent,
  };
}

/**
 * Calculate summary statistics from parsed files
 */
function calculateSummary(files: DiffFile[]): DiffSummary {
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'added') linesAdded++;
        if (line.type === 'removed') linesRemoved++;
      }
    }
  }

  return {
    filesChanged: files.length,
    filesAdded: files.filter((f) => f.changeType === 'added').length,
    filesModified: files.filter((f) => f.changeType === 'modified').length,
    filesDeleted: files.filter((f) => f.changeType === 'deleted').length,
    filesRenamed: files.filter((f) => f.changeType === 'renamed').length,
    linesAdded,
    linesRemoved,
  };
}

// ============================================================================
// Context Extraction
// ============================================================================

/**
 * Extract code context for changed lines from an analyzed diff
 *
 * This provides the surrounding code context for each change, which is useful
 * for self-review to understand the context of changes.
 *
 * @param analyzedDiff - The parsed diff
 * @param options - Options for context extraction
 * @returns Array of file contexts with code ranges
 */
export function extractCodeContext(
  analyzedDiff: AnalyzedDiff,
  options: CodeContextOptions = {}
): FileCodeContext[] {
  const { linesBefore = 3, linesAfter = 3 } = options;
  const contexts: FileCodeContext[] = [];

  for (const file of analyzedDiff.files) {
    if (file.isBinary) continue;

    const ranges: CodeContextRange[] = [];

    for (const hunk of file.hunks) {
      // Build the content string from hunk lines
      const contentLines: string[] = [];
      const addedLines: number[] = [];
      const removedLines: number[] = [];

      // Calculate actual start/end based on context
      const contextStart = Math.max(1, hunk.newStart - linesBefore);
      const contextEnd = hunk.newStart + hunk.newCount + linesAfter;

      for (const line of hunk.lines) {
        if (line.type === 'added' && line.newLineNumber !== null) {
          addedLines.push(line.newLineNumber);
          contentLines.push(`+ ${line.content}`);
        } else if (line.type === 'removed' && line.oldLineNumber !== null) {
          removedLines.push(line.oldLineNumber);
          contentLines.push(`- ${line.content}`);
        } else {
          contentLines.push(`  ${line.content}`);
        }
      }

      ranges.push({
        startLine: contextStart,
        endLine: contextEnd,
        content: contentLines.join('\n'),
        addedLines,
        removedLines,
      });
    }

    if (ranges.length > 0) {
      contexts.push({
        path: file.path,
        ranges,
      });
    }
  }

  return contexts;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all files that match a specific change type
 *
 * @param analyzedDiff - The parsed diff
 * @param changeType - The type of change to filter by
 * @returns Array of file paths matching the change type
 */
export function getFilesByChangeType(
  analyzedDiff: AnalyzedDiff,
  changeType: DiffFileChangeType
): string[] {
  return analyzedDiff.files.filter((f) => f.changeType === changeType).map((f) => f.path);
}

/**
 * Get changed line numbers for a specific file
 *
 * @param analyzedDiff - The parsed diff
 * @param filePath - Path to the file
 * @returns Object with arrays of added and removed line numbers
 */
export function getChangedLines(
  analyzedDiff: AnalyzedDiff,
  filePath: string
): { added: number[]; removed: number[] } {
  const file = analyzedDiff.files.find((f) => f.path === filePath);
  if (!file) {
    return { added: [], removed: [] };
  }

  const added: number[] = [];
  const removed: number[] = [];

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'added' && line.newLineNumber !== null) {
        added.push(line.newLineNumber);
      } else if (line.type === 'removed' && line.oldLineNumber !== null) {
        removed.push(line.oldLineNumber);
      }
    }
  }

  return { added, removed };
}

/**
 * Check if a specific line was changed in a file
 *
 * @param analyzedDiff - The parsed diff
 * @param filePath - Path to the file
 * @param lineNumber - Line number to check (1-based)
 * @returns The type of change or null if line wasn't changed
 */
export function getLineChangeType(
  analyzedDiff: AnalyzedDiff,
  filePath: string,
  lineNumber: number
): DiffLineChangeType | null {
  const file = analyzedDiff.files.find((f) => f.path === filePath);
  if (!file) return null;

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'added' && line.newLineNumber === lineNumber) {
        return 'added';
      }
      if (line.type === 'removed' && line.oldLineNumber === lineNumber) {
        return 'removed';
      }
    }
  }

  return null;
}

/**
 * Get a formatted summary string for logging or display
 *
 * @param summary - The diff summary
 * @returns Formatted summary string
 */
export function formatDiffSummary(summary: DiffSummary): string {
  const parts: string[] = [];

  if (summary.filesAdded > 0) {
    parts.push(`${summary.filesAdded} file(s) added`);
  }
  if (summary.filesModified > 0) {
    parts.push(`${summary.filesModified} file(s) modified`);
  }
  if (summary.filesDeleted > 0) {
    parts.push(`${summary.filesDeleted} file(s) deleted`);
  }
  if (summary.filesRenamed > 0) {
    parts.push(`${summary.filesRenamed} file(s) renamed`);
  }

  const lineChanges = `+${summary.linesAdded}/-${summary.linesRemoved} lines`;

  return parts.length > 0 ? `${parts.join(', ')} (${lineChanges})` : 'No changes';
}

/**
 * Filter the analyzed diff to only include specific file patterns
 *
 * @param analyzedDiff - The parsed diff
 * @param patterns - Array of glob-like patterns (supports * wildcard)
 * @returns New AnalyzedDiff with only matching files
 */
export function filterDiffByPatterns(analyzedDiff: AnalyzedDiff, patterns: string[]): AnalyzedDiff {
  const matchFile = (filePath: string): boolean => {
    for (const pattern of patterns) {
      // Convert glob pattern to regex
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(filePath)) {
        return true;
      }
    }
    return false;
  };

  const filteredFiles = analyzedDiff.files.filter((f) => matchFile(f.path));
  const summary = calculateSummary(filteredFiles);

  return {
    files: filteredFiles,
    summary,
    rawDiff: analyzedDiff.rawDiff,
  };
}

/**
 * Convert analyzed diff to a format suitable for AI review prompts
 *
 * @param analyzedDiff - The parsed diff
 * @returns Formatted string for inclusion in AI prompts
 */
export function formatDiffForReview(analyzedDiff: AnalyzedDiff): string {
  const sections: string[] = [];

  sections.push('## Diff Summary');
  sections.push(formatDiffSummary(analyzedDiff.summary));
  sections.push('');

  for (const file of analyzedDiff.files) {
    sections.push(`### ${file.path}`);
    sections.push(`Change type: ${file.changeType}`);

    if (file.isBinary) {
      sections.push('(Binary file)');
    } else {
      for (const hunk of file.hunks) {
        const hunkHeader = hunk.header ? ` ${hunk.header}` : '';
        sections.push(
          `\n@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunkHeader}`
        );

        for (const line of hunk.lines) {
          const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          sections.push(`${prefix}${line.content}`);
        }
      }
    }
    sections.push('');
  }

  return sections.join('\n');
}

export { logger };
