/**
 * @automaker/git-utils
 * Git operations utilities for AutoMaker
 */

// Export types and constants
export { BINARY_EXTENSIONS, GIT_STATUS_MAP, type FileStatus } from './types.js';

// Export status utilities
export { isGitRepo, parseGitStatus } from './status.js';

// Export diff utilities
export {
  generateSyntheticDiffForNewFile,
  appendUntrackedFileDiffs,
  listAllFilesInDirectory,
  generateDiffsForNonGitDirectory,
  getGitRepositoryDiffs,
} from './diff.js';

// Export diff analyzer utilities
export {
  // Types
  type DiffFileChangeType,
  type DiffLineChangeType,
  type DiffLine,
  type DiffHunk,
  type DiffFile,
  type DiffSummary,
  type AnalyzedDiff,
  type CodeContextOptions,
  type FileCodeContext,
  type CodeContextRange,
  // Functions
  parseDiff,
  extractCodeContext,
  getFilesByChangeType,
  getChangedLines,
  getLineChangeType,
  formatDiffSummary,
  filterDiffByPatterns,
  formatDiffForReview,
} from './diff-analyzer.js';
