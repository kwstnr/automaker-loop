/**
 * Code Context Builder Service
 *
 * Service that builds relevant code context for review by analyzing imports,
 * dependencies, and related files. This enriches the self-review analysis
 * with necessary context about how files relate to each other.
 */

import path from 'path';
import { createLogger } from '@automaker/utils';
import type {
  ImportType,
  DependencyType,
  ParsedImport,
  IdentifiedDependency,
  FileImportAnalysis,
  RelatedFile,
  RelatedFileRelationship,
  CodeContext,
  CodeContextSummary,
  CodeContextOptions,
  FormattedCodeContext,
} from '@automaker/types';
import { DEFAULT_CODE_CONTEXT_OPTIONS } from '@automaker/types';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('CodeContextBuilder');

// ============================================================================
// Import Parsing
// ============================================================================

/**
 * Regular expressions for parsing different import types
 */
const IMPORT_PATTERNS = {
  // ESM named import: import { foo, bar } from 'module'
  esmNamed: /^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/,
  // ESM default import: import foo from 'module'
  esmDefault: /^import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/,
  // ESM namespace import: import * as foo from 'module'
  esmNamespace: /^import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/,
  // ESM side-effect import: import 'module'
  esmSideEffect: /^import\s*['"]([^'"]+)['"]/,
  // ESM combined: import foo, { bar } from 'module'
  esmCombined: /^import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/,
  // CommonJS require: const foo = require('module')
  commonjsRequire: /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  // Dynamic import: import('module')
  dynamicImport: /import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  // Type-only imports: import type { foo } from 'module'
  typeImport: /^import\s+type\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/,
};

/**
 * Export patterns for parsing exports
 */
const EXPORT_PATTERNS = {
  // Named export: export { foo, bar }
  named: /export\s*\{([^}]+)\}/g,
  // Default export: export default
  defaultExport: /export\s+default\s+(?:(?:function|class|const|let|var)\s+)?(\w+)?/g,
  // Direct export: export const/function/class foo
  direct: /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
  // Re-export: export { foo } from 'module'
  reExport: /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,
  // Export all: export * from 'module'
  exportAll: /export\s*\*\s*from\s*['"]([^'"]+)['"]/g,
};

/**
 * Node.js built-in modules
 */
const BUILTIN_MODULES = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
  'node:assert',
  'node:buffer',
  'node:child_process',
  'node:cluster',
  'node:console',
  'node:constants',
  'node:crypto',
  'node:dgram',
  'node:dns',
  'node:domain',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:http2',
  'node:https',
  'node:inspector',
  'node:module',
  'node:net',
  'node:os',
  'node:path',
  'node:perf_hooks',
  'node:process',
  'node:punycode',
  'node:querystring',
  'node:readline',
  'node:repl',
  'node:stream',
  'node:string_decoder',
  'node:sys',
  'node:timers',
  'node:tls',
  'node:trace_events',
  'node:tty',
  'node:url',
  'node:util',
  'node:v8',
  'node:vm',
  'node:wasi',
  'node:worker_threads',
  'node:zlib',
]);

/**
 * Parse imports from a source file's content
 */
function parseImports(content: string, filePath: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('/*')) {
      continue;
    }

    // Try each import pattern
    let match: RegExpMatchArray | null;

    // Type-only import
    match = line.match(IMPORT_PATTERNS.typeImport);
    if (match) {
      const namedImports = match[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
      imports.push({
        type: 'esm-named',
        moduleSpecifier: match[2],
        namedImports,
        line: lineNum,
        isTypeOnly: true,
      });
      continue;
    }

    // ESM combined import
    match = line.match(IMPORT_PATTERNS.esmCombined);
    if (match) {
      const namedImports = match[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
      imports.push({
        type: 'esm-named',
        moduleSpecifier: match[3],
        defaultImport: match[1],
        namedImports,
        line: lineNum,
      });
      continue;
    }

    // ESM namespace import
    match = line.match(IMPORT_PATTERNS.esmNamespace);
    if (match) {
      imports.push({
        type: 'esm-namespace',
        moduleSpecifier: match[2],
        namespaceImport: match[1],
        line: lineNum,
      });
      continue;
    }

    // ESM named import
    match = line.match(IMPORT_PATTERNS.esmNamed);
    if (match) {
      const namedImports = match[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
      imports.push({
        type: 'esm-named',
        moduleSpecifier: match[2],
        namedImports,
        line: lineNum,
      });
      continue;
    }

    // ESM default import
    match = line.match(IMPORT_PATTERNS.esmDefault);
    if (match) {
      imports.push({
        type: 'esm-default',
        moduleSpecifier: match[2],
        defaultImport: match[1],
        line: lineNum,
      });
      continue;
    }

    // ESM side-effect import
    match = line.match(IMPORT_PATTERNS.esmSideEffect);
    if (match) {
      imports.push({
        type: 'esm-side-effect',
        moduleSpecifier: match[1],
        line: lineNum,
      });
      continue;
    }

    // CommonJS require
    match = line.match(IMPORT_PATTERNS.commonjsRequire);
    if (match) {
      const namedImports = match[1]
        ? match[1].split(',').map((s) => s.trim().split(/\s*:\s*/)[0].trim())
        : undefined;
      const defaultImport = match[2] || undefined;
      imports.push({
        type: 'commonjs-require',
        moduleSpecifier: match[3],
        namedImports,
        defaultImport,
        line: lineNum,
      });
      continue;
    }

    // Dynamic import
    match = line.match(IMPORT_PATTERNS.dynamicImport);
    if (match) {
      imports.push({
        type: 'dynamic-import',
        moduleSpecifier: match[1],
        line: lineNum,
      });
      continue;
    }
  }

  return imports;
}

/**
 * Parse exports from a source file's content
 */
function parseExports(content: string): string[] {
  const exports: string[] = [];

  // Reset lastIndex for global patterns
  EXPORT_PATTERNS.named.lastIndex = 0;
  EXPORT_PATTERNS.defaultExport.lastIndex = 0;
  EXPORT_PATTERNS.direct.lastIndex = 0;

  // Named exports
  let match: RegExpExecArray | null;
  while ((match = EXPORT_PATTERNS.named.exec(content)) !== null) {
    const names = match[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
    exports.push(...names);
  }

  // Default export
  EXPORT_PATTERNS.defaultExport.lastIndex = 0;
  while ((match = EXPORT_PATTERNS.defaultExport.exec(content)) !== null) {
    if (match[1]) {
      exports.push(match[1]);
    }
    exports.push('default');
  }

  // Direct exports
  EXPORT_PATTERNS.direct.lastIndex = 0;
  while ((match = EXPORT_PATTERNS.direct.exec(content)) !== null) {
    exports.push(match[1]);
  }

  return [...new Set(exports)];
}

/**
 * Determine the type of a dependency from its module specifier
 */
function getDependencyType(moduleSpecifier: string): DependencyType {
  // Built-in modules
  if (BUILTIN_MODULES.has(moduleSpecifier)) {
    return 'builtin';
  }

  // Relative imports are local
  if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
    return 'local';
  }

  // Workspace packages (typically scoped packages in monorepos)
  if (moduleSpecifier.startsWith('@automaker/')) {
    return 'workspace';
  }

  // Everything else is external
  return 'external';
}

/**
 * Resolve a local import to an absolute path
 */
async function resolveLocalImport(
  moduleSpecifier: string,
  fromFile: string,
  projectPath: string
): Promise<string | undefined> {
  const fromDir = path.dirname(fromFile);
  const basePath = path.resolve(fromDir, moduleSpecifier);

  // Try common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', ''];

  for (const ext of extensions) {
    const fullPath = basePath + ext;
    try {
      const stat = await secureFs.stat(fullPath);
      if (stat.isFile()) {
        return path.relative(projectPath, fullPath);
      }
    } catch {
      // File doesn't exist, try next extension
    }
  }

  // Try index files
  for (const ext of extensions) {
    const indexPath = path.join(basePath, `index${ext}`);
    try {
      const stat = await secureFs.stat(indexPath);
      if (stat.isFile()) {
        return path.relative(projectPath, indexPath);
      }
    } catch {
      // File doesn't exist, try next extension
    }
  }

  return undefined;
}

// ============================================================================
// File Analysis
// ============================================================================

/**
 * Analyze imports and exports in a single file
 */
async function analyzeFile(
  filePath: string,
  projectPath: string
): Promise<FileImportAnalysis> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectPath, filePath);

  try {
    const content = (await secureFs.readFile(fullPath, 'utf-8')) as string;
    const imports = parseImports(content, filePath);
    const exports = parseExports(content);

    return {
      filePath: path.relative(projectPath, fullPath),
      imports,
      exports,
      parseSuccess: true,
    };
  } catch (error) {
    logger.warn(`Failed to analyze file ${filePath}:`, error);
    return {
      filePath: path.relative(projectPath, fullPath),
      imports: [],
      exports: [],
      parseSuccess: false,
      parseError: (error as Error).message,
    };
  }
}

/**
 * Check if a file path matches any exclude pattern
 */
function matchesExcludePattern(filePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    // Convert glob pattern to regex
    // Use placeholder for ** to avoid double conversion
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '\u0000DOUBLESTAR\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000DOUBLESTAR\u0000/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    if (regex.test(filePath)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Related Files Discovery
// ============================================================================

/**
 * Find test files related to changed files
 */
async function findTestFiles(
  changedFiles: string[],
  projectPath: string
): Promise<RelatedFile[]> {
  const relatedFiles: RelatedFile[] = [];

  for (const changedFile of changedFiles) {
    const baseName = path.basename(changedFile, path.extname(changedFile));
    const dirName = path.dirname(changedFile);

    // Common test file patterns
    const testPatterns = [
      path.join(dirName, `${baseName}.test.ts`),
      path.join(dirName, `${baseName}.test.tsx`),
      path.join(dirName, `${baseName}.spec.ts`),
      path.join(dirName, `${baseName}.spec.tsx`),
      path.join(dirName, '__tests__', `${baseName}.test.ts`),
      path.join(dirName, '__tests__', `${baseName}.test.tsx`),
      path.join('tests', 'unit', dirName, `${baseName}.test.ts`),
      path.join(dirName.replace(/^src/, 'tests/unit'), `${baseName}.test.ts`),
    ];

    for (const testPath of testPatterns) {
      try {
        const fullPath = path.join(projectPath, testPath);
        await secureFs.stat(fullPath);
        relatedFiles.push({
          path: testPath,
          relationship: 'test-file',
          relevanceScore: 90,
          reason: `Test file for ${changedFile}`,
        });
      } catch {
        // Test file doesn't exist
      }
    }
  }

  return relatedFiles;
}

/**
 * Find type definition files related to changed files
 */
async function findTypeDefinitions(
  changedFiles: string[],
  projectPath: string
): Promise<RelatedFile[]> {
  const relatedFiles: RelatedFile[] = [];

  for (const changedFile of changedFiles) {
    const baseName = path.basename(changedFile, path.extname(changedFile));
    const dirName = path.dirname(changedFile);

    // Type definition patterns
    const typePatterns = [
      path.join(dirName, `${baseName}.d.ts`),
      path.join(dirName, 'types.ts'),
      path.join(dirName, 'types', `${baseName}.ts`),
      path.join(dirName, 'types', 'index.ts'),
    ];

    for (const typePath of typePatterns) {
      try {
        const fullPath = path.join(projectPath, typePath);
        await secureFs.stat(fullPath);
        if (!changedFiles.includes(typePath)) {
          relatedFiles.push({
            path: typePath,
            relationship: 'type-definition',
            relevanceScore: 85,
            reason: `Type definitions for ${changedFile}`,
          });
        }
      } catch {
        // Type file doesn't exist
      }
    }
  }

  return relatedFiles;
}

/**
 * Find sibling files in the same directory
 */
async function findSiblingFiles(
  changedFiles: string[],
  projectPath: string,
  maxSiblings: number = 5
): Promise<RelatedFile[]> {
  const relatedFiles: RelatedFile[] = [];
  const processedDirs = new Set<string>();

  for (const changedFile of changedFiles) {
    const dirName = path.dirname(changedFile);

    // Skip if we've already processed this directory
    if (processedDirs.has(dirName)) continue;
    processedDirs.add(dirName);

    try {
      const fullDir = path.join(projectPath, dirName);
      const files = (await secureFs.readdir(fullDir)) as string[];

      let siblingCount = 0;
      for (const file of files) {
        if (siblingCount >= maxSiblings) break;

        const siblingPath = path.join(dirName, file);

        // Skip if it's one of the changed files
        if (changedFiles.includes(siblingPath)) continue;

        // Only include TypeScript/JavaScript files
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;

        // Skip test files and type definitions (handled separately)
        if (/\.(test|spec|d)\.(ts|tsx|js|jsx)$/.test(file)) continue;

        try {
          const fullPath = path.join(fullDir, file);
          const stat = await secureFs.stat(fullPath);
          if (stat.isFile()) {
            relatedFiles.push({
              path: siblingPath,
              relationship: 'sibling',
              relevanceScore: 50,
              reason: `Sibling file in same directory as ${changedFile}`,
            });
            siblingCount++;
          }
        } catch {
          // Skip if we can't stat the file
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  return relatedFiles;
}

// ============================================================================
// Code Context Builder
// ============================================================================

/**
 * Input for building code context
 */
export interface BuildCodeContextInput {
  /** List of changed files to analyze */
  changedFiles: string[];
  /** Project root path */
  projectPath: string;
  /** Options for context building */
  options?: CodeContextOptions;
}

/**
 * Build complete code context for the given changed files
 */
export async function buildCodeContext(input: BuildCodeContextInput): Promise<CodeContext> {
  const { changedFiles, projectPath, options = {} } = input;
  const mergedOptions = { ...DEFAULT_CODE_CONTEXT_OPTIONS, ...options };

  logger.info(`Building code context for ${changedFiles.length} changed files`);

  // Filter out excluded files
  const filesToAnalyze = changedFiles.filter(
    (f) => !matchesExcludePattern(f, mergedOptions.excludePatterns)
  );

  // Analyze each changed file
  const fileAnalyses: FileImportAnalysis[] = [];
  for (const file of filesToAnalyze) {
    const analysis = await analyzeFile(file, projectPath);
    fileAnalyses.push(analysis);
  }

  // Build dependency map
  const dependencyMap = new Map<string, IdentifiedDependency>();

  for (const analysis of fileAnalyses) {
    for (const imp of analysis.imports) {
      const depType = getDependencyType(imp.moduleSpecifier);

      // Resolve local imports
      let resolvedPath: string | undefined;
      if (depType === 'local') {
        resolvedPath = await resolveLocalImport(
          imp.moduleSpecifier,
          path.join(projectPath, analysis.filePath),
          projectPath
        );
      }

      const key = imp.moduleSpecifier;
      const existing = dependencyMap.get(key);

      if (existing) {
        existing.importedBy.push(analysis.filePath);
        if (imp.namedImports) {
          existing.usedExports.push(...imp.namedImports);
        }
        if (imp.defaultImport) {
          existing.usedExports.push('default');
        }
      } else {
        dependencyMap.set(key, {
          moduleSpecifier: imp.moduleSpecifier,
          dependencyType: depType,
          resolvedPath,
          importedBy: [analysis.filePath],
          usedExports: [
            ...(imp.namedImports || []),
            ...(imp.defaultImport ? ['default'] : []),
            ...(imp.namespaceImport ? ['*'] : []),
          ],
        });
      }
    }
  }

  // Deduplicate used exports
  for (const dep of dependencyMap.values()) {
    dep.usedExports = [...new Set(dep.usedExports)];
  }

  const dependencies = Array.from(dependencyMap.values());

  // Find related files
  const relatedFiles: RelatedFile[] = [];

  // Find files that import changed files (reverse dependencies)
  const localDeps = dependencies.filter((d) => d.dependencyType === 'local' && d.resolvedPath);
  for (const dep of localDeps) {
    if (dep.resolvedPath && !filesToAnalyze.includes(dep.resolvedPath)) {
      relatedFiles.push({
        path: dep.resolvedPath,
        relationship: 'imported-by-changed',
        relevanceScore: 80,
        reason: `Imported by ${dep.importedBy.join(', ')}`,
      });
    }
  }

  // Find test files
  if (mergedOptions.includeTestFiles) {
    const testFiles = await findTestFiles(filesToAnalyze, projectPath);
    relatedFiles.push(...testFiles);
  }

  // Find type definitions
  if (mergedOptions.includeTypeDefinitions) {
    const typeFiles = await findTypeDefinitions(filesToAnalyze, projectPath);
    relatedFiles.push(...typeFiles);
  }

  // Find sibling files
  const siblingFiles = await findSiblingFiles(filesToAnalyze, projectPath);
  relatedFiles.push(...siblingFiles);

  // Filter by minimum relevance score and limit
  const filteredRelatedFiles = relatedFiles
    .filter((f) => f.relevanceScore >= mergedOptions.minRelevanceScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, mergedOptions.maxRelatedFiles);

  // Remove duplicates
  const uniqueRelatedFiles = filteredRelatedFiles.filter(
    (f, i, arr) => arr.findIndex((x) => x.path === f.path) === i
  );

  // Build summary
  const summary: CodeContextSummary = {
    filesAnalyzed: fileAnalyses.length,
    totalImports: fileAnalyses.reduce((sum, a) => sum + a.imports.length, 0),
    localDependencies: dependencies.filter((d) => d.dependencyType === 'local').length,
    externalDependencies: dependencies.filter((d) => d.dependencyType === 'external').length,
    relatedFilesCount: uniqueRelatedFiles.length,
    parseErrors: fileAnalyses.filter((a) => !a.parseSuccess).length,
  };

  logger.info(
    `Built code context: ${summary.filesAnalyzed} files, ${summary.totalImports} imports, ${summary.relatedFilesCount} related files`
  );

  return {
    changedFiles: filesToAnalyze,
    fileAnalyses,
    dependencies,
    relatedFiles: uniqueRelatedFiles,
    summary,
  };
}

/**
 * Format code context for inclusion in review prompts
 */
export function formatCodeContext(
  context: CodeContext,
  maxTokens: number = 4000
): FormattedCodeContext {
  const sections: string[] = [];
  let estimatedTokens = 0;
  let wasTruncated = false;

  // Helper to estimate tokens (rough approximation: 1 token ≈ 4 characters)
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

  // Add summary
  const summarySection = `## Code Context Summary
- Files analyzed: ${context.summary.filesAnalyzed}
- Total imports: ${context.summary.totalImports}
- Local dependencies: ${context.summary.localDependencies}
- External dependencies: ${context.summary.externalDependencies}
- Related files: ${context.summary.relatedFilesCount}
${context.summary.parseErrors > 0 ? `- Parse errors: ${context.summary.parseErrors}` : ''}`;

  sections.push(summarySection);
  estimatedTokens += estimateTokens(summarySection);

  // Add changed files analysis
  if (context.fileAnalyses.length > 0) {
    const changedFilesSection = `\n## Changed Files Analysis\n`;
    sections.push(changedFilesSection);
    estimatedTokens += estimateTokens(changedFilesSection);

    for (const analysis of context.fileAnalyses) {
      if (estimatedTokens >= maxTokens) {
        wasTruncated = true;
        break;
      }

      const fileSection = `### ${analysis.filePath}
- Imports: ${analysis.imports.length}
- Exports: ${analysis.exports.join(', ') || 'none'}
${!analysis.parseSuccess ? `- Parse error: ${analysis.parseError}` : ''}`;

      const sectionTokens = estimateTokens(fileSection);
      if (estimatedTokens + sectionTokens > maxTokens) {
        wasTruncated = true;
        break;
      }

      sections.push(fileSection);
      estimatedTokens += sectionTokens;
    }
  }

  // Add key dependencies
  const localDeps = context.dependencies.filter((d) => d.dependencyType === 'local');
  if (localDeps.length > 0 && estimatedTokens < maxTokens) {
    const depsHeader = `\n## Key Local Dependencies\n`;
    sections.push(depsHeader);
    estimatedTokens += estimateTokens(depsHeader);

    for (const dep of localDeps.slice(0, 10)) {
      if (estimatedTokens >= maxTokens) {
        wasTruncated = true;
        break;
      }

      const depLine = `- \`${dep.moduleSpecifier}\`${dep.resolvedPath ? ` -> ${dep.resolvedPath}` : ''} (used by: ${dep.importedBy.join(', ')})`;
      const lineTokens = estimateTokens(depLine);

      if (estimatedTokens + lineTokens > maxTokens) {
        wasTruncated = true;
        break;
      }

      sections.push(depLine);
      estimatedTokens += lineTokens;
    }
  }

  // Add related files
  if (context.relatedFiles.length > 0 && estimatedTokens < maxTokens) {
    const relatedHeader = `\n## Related Files\n`;
    sections.push(relatedHeader);
    estimatedTokens += estimateTokens(relatedHeader);

    for (const related of context.relatedFiles) {
      if (estimatedTokens >= maxTokens) {
        wasTruncated = true;
        break;
      }

      const relatedLine = `- \`${related.path}\` (${related.relationship}): ${related.reason}`;
      const lineTokens = estimateTokens(relatedLine);

      if (estimatedTokens + lineTokens > maxTokens) {
        wasTruncated = true;
        break;
      }

      sections.push(relatedLine);
      estimatedTokens += lineTokens;
    }
  }

  if (wasTruncated) {
    sections.push('\n_[Context truncated due to size limits]_');
  }

  return {
    text: sections.join('\n'),
    estimatedTokens,
    wasTruncated,
  };
}

/**
 * Get context for files that import a specific file
 */
export async function findFilesImporting(
  targetFile: string,
  projectPath: string,
  searchPaths: string[] = ['src', 'lib', 'apps']
): Promise<string[]> {
  const importingFiles: string[] = [];
  const targetBaseName = path.basename(targetFile, path.extname(targetFile));

  for (const searchPath of searchPaths) {
    const fullSearchPath = path.join(projectPath, searchPath);

    try {
      await secureFs.stat(fullSearchPath);
    } catch {
      continue;
    }

    // Recursively search for files
    const filesToCheck = await findAllSourceFiles(fullSearchPath, projectPath);

    for (const file of filesToCheck) {
      if (file === targetFile) continue;

      const analysis = await analyzeFile(file, projectPath);

      for (const imp of analysis.imports) {
        // Check if this import might reference the target file
        if (
          imp.moduleSpecifier.includes(targetBaseName) ||
          (imp.moduleSpecifier.startsWith('.') &&
            (await couldImportFile(imp.moduleSpecifier, file, targetFile, projectPath)))
        ) {
          importingFiles.push(file);
          break;
        }
      }
    }
  }

  return importingFiles;
}

/**
 * Find all source files in a directory recursively
 */
async function findAllSourceFiles(dir: string, projectPath: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = (await secureFs.readdir(dir)) as string[];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);

      // Skip node_modules and other common excluded directories
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build' || entry === '.git') {
        continue;
      }

      try {
        const stat = await secureFs.stat(fullPath);

        if (stat.isDirectory()) {
          const subFiles = await findAllSourceFiles(fullPath, projectPath);
          files.push(...subFiles);
        } else if (stat.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
          files.push(path.relative(projectPath, fullPath));
        }
      } catch {
        // Skip files we can't access
      }
    }
  } catch {
    // Directory can't be read
  }

  return files;
}

/**
 * Check if an import could reference a target file
 */
async function couldImportFile(
  moduleSpecifier: string,
  fromFile: string,
  targetFile: string,
  projectPath: string
): Promise<boolean> {
  const resolvedPath = await resolveLocalImport(
    moduleSpecifier,
    path.join(projectPath, fromFile),
    projectPath
  );

  if (!resolvedPath) return false;

  // Normalize paths for comparison
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedTarget = path.normalize(targetFile);

  return normalizedResolved === normalizedTarget;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * CodeContextBuilder class for stateful context building
 */
export class CodeContextBuilder {
  private projectPath: string;
  private options: Required<CodeContextOptions>;
  private cache: Map<string, FileImportAnalysis> = new Map();

  constructor(projectPath: string, options: CodeContextOptions = {}) {
    this.projectPath = projectPath;
    this.options = { ...DEFAULT_CODE_CONTEXT_OPTIONS, ...options };
  }

  /**
   * Build code context for changed files
   */
  async build(changedFiles: string[]): Promise<CodeContext> {
    return buildCodeContext({
      changedFiles,
      projectPath: this.projectPath,
      options: this.options,
    });
  }

  /**
   * Analyze a single file (with caching)
   */
  async analyzeFile(filePath: string): Promise<FileImportAnalysis> {
    const cached = this.cache.get(filePath);
    if (cached) return cached;

    const analysis = await analyzeFile(filePath, this.projectPath);
    this.cache.set(filePath, analysis);
    return analysis;
  }

  /**
   * Clear the analysis cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Format context for review prompts
   */
  format(context: CodeContext, maxTokens?: number): FormattedCodeContext {
    return formatCodeContext(context, maxTokens);
  }
}

/**
 * Factory function to create a CodeContextBuilder instance
 */
export function createCodeContextBuilder(
  projectPath: string,
  options?: CodeContextOptions
): CodeContextBuilder {
  return new CodeContextBuilder(projectPath, options);
}
