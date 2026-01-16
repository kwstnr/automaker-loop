/**
 * Code Context Types
 *
 * Type definitions for the code context builder service that analyzes
 * imports, dependencies, and related files to enrich self-review analysis.
 */

/**
 * Type of import statement found in source code
 */
export type ImportType =
  | 'esm-named' // import { foo } from 'bar'
  | 'esm-default' // import foo from 'bar'
  | 'esm-namespace' // import * as foo from 'bar'
  | 'esm-side-effect' // import 'bar'
  | 'commonjs-require' // const foo = require('bar')
  | 'dynamic-import'; // const foo = await import('bar')

/**
 * Type of module/package dependency
 */
export type DependencyType =
  | 'local' // Relative import from project
  | 'workspace' // Monorepo workspace package
  | 'external' // npm package
  | 'builtin'; // Node.js built-in module

/**
 * A single import statement found in a source file
 */
export interface ParsedImport {
  /** The import type */
  type: ImportType;
  /** Module specifier (e.g., './utils', '@automaker/types', 'fs') */
  moduleSpecifier: string;
  /** Named imports (e.g., ['foo', 'bar']) */
  namedImports?: string[];
  /** Default import name (e.g., 'React') */
  defaultImport?: string;
  /** Namespace import name (e.g., 'path' for import * as path) */
  namespaceImport?: string;
  /** Line number where import appears (1-based) */
  line: number;
  /** Whether this is a type-only import */
  isTypeOnly?: boolean;
}

/**
 * A dependency identified from imports
 */
export interface IdentifiedDependency {
  /** Module specifier */
  moduleSpecifier: string;
  /** Type of dependency */
  dependencyType: DependencyType;
  /** Resolved file path for local imports (if resolvable) */
  resolvedPath?: string;
  /** Files that import this dependency */
  importedBy: string[];
  /** Specific exports used from this dependency */
  usedExports: string[];
}

/**
 * Analysis of a single source file
 */
export interface FileImportAnalysis {
  /** Path to the analyzed file */
  filePath: string;
  /** All imports found in the file */
  imports: ParsedImport[];
  /** Exports declared by this file */
  exports: string[];
  /** Whether the file could be parsed successfully */
  parseSuccess: boolean;
  /** Parse error message if parsing failed */
  parseError?: string;
}

/**
 * A related file that provides context for changes
 */
export interface RelatedFile {
  /** Path to the related file */
  path: string;
  /** How this file relates to the changed files */
  relationship: RelatedFileRelationship;
  /** Relevance score (0-100, higher is more relevant) */
  relevanceScore: number;
  /** Brief description of why this file is relevant */
  reason: string;
}

/**
 * How a file relates to the changed files
 */
export type RelatedFileRelationship =
  | 'imports-changed' // This file imports a changed file
  | 'imported-by-changed' // This file is imported by a changed file
  | 'sibling' // In same directory as a changed file
  | 'test-file' // Test file for a changed file
  | 'type-definition' // Type definition for a changed file
  | 'shared-dependency'; // Shares dependencies with changed files

/**
 * Complete code context for review analysis
 */
export interface CodeContext {
  /** Changed files being reviewed */
  changedFiles: string[];
  /** Import analysis for each changed file */
  fileAnalyses: FileImportAnalysis[];
  /** All identified dependencies */
  dependencies: IdentifiedDependency[];
  /** Related files that provide additional context */
  relatedFiles: RelatedFile[];
  /** Summary statistics */
  summary: CodeContextSummary;
}

/**
 * Summary statistics for code context
 */
export interface CodeContextSummary {
  /** Total number of files analyzed */
  filesAnalyzed: number;
  /** Total number of imports found */
  totalImports: number;
  /** Number of local dependencies */
  localDependencies: number;
  /** Number of external dependencies */
  externalDependencies: number;
  /** Number of related files found */
  relatedFilesCount: number;
  /** Parse errors encountered */
  parseErrors: number;
}

/**
 * Options for building code context
 */
export interface CodeContextOptions {
  /** Maximum depth for dependency resolution (default: 2) */
  maxDepth?: number;
  /** Maximum number of related files to include (default: 20) */
  maxRelatedFiles?: number;
  /** Whether to include test files in analysis (default: true) */
  includeTestFiles?: boolean;
  /** Whether to include type definition files (default: true) */
  includeTypeDefinitions?: boolean;
  /** Minimum relevance score for related files (default: 30) */
  minRelevanceScore?: number;
  /** File patterns to exclude from analysis */
  excludePatterns?: string[];
}

/**
 * Default options for code context building
 */
export const DEFAULT_CODE_CONTEXT_OPTIONS: Required<CodeContextOptions> = {
  maxDepth: 2,
  maxRelatedFiles: 20,
  includeTestFiles: true,
  includeTypeDefinitions: true,
  minRelevanceScore: 30,
  excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
};

/**
 * Result of formatting code context for review
 */
export interface FormattedCodeContext {
  /** Formatted text ready for inclusion in review prompts */
  text: string;
  /** Token estimate for the formatted context */
  estimatedTokens: number;
  /** Whether context was truncated due to size */
  wasTruncated: boolean;
}
