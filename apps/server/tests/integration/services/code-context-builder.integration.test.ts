/**
 * Integration Test for CodeContextBuilder Service
 *
 * This test verifies that the CodeContextBuilder service can correctly analyze
 * real TypeScript files, parse imports/exports, and build code context.
 * Uses actual file system operations to test real-world scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import {
  buildCodeContext,
  formatCodeContext,
  createCodeContextBuilder,
} from '@/services/code-context-builder.js';

describe('CodeContextBuilder Integration Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-context-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should analyze a TypeScript file with various import types', async () => {
    // Create a test file with different import types
    const testFile = path.join(tempDir, 'test-file.ts');
    const testContent = `
import { createLogger } from '@automaker/utils';
import path from 'path';
import * as fs from 'fs';
import type { Feature } from '@automaker/types';
import './styles.css';

export function myFunction() {
  return 'hello';
}

export const myConst = 42;
export default class MyClass {}
`;
    await fs.writeFile(testFile, testContent);

    // Build code context
    const context = await buildCodeContext({
      changedFiles: ['test-file.ts'],
      projectPath: tempDir,
    });

    // Verify file analysis
    expect(context.changedFiles).toHaveLength(1);
    expect(context.fileAnalyses).toHaveLength(1);

    const analysis = context.fileAnalyses[0];
    expect(analysis.parseSuccess).toBe(true);

    // Should have parsed multiple imports
    expect(analysis.imports.length).toBeGreaterThanOrEqual(5);

    // Check for specific import types
    const namedImport = analysis.imports.find(i => i.moduleSpecifier === '@automaker/utils');
    expect(namedImport).toBeDefined();
    expect(namedImport?.type).toBe('esm-named');
    expect(namedImport?.namedImports).toContain('createLogger');

    const defaultImport = analysis.imports.find(i => i.moduleSpecifier === 'path');
    expect(defaultImport).toBeDefined();
    expect(defaultImport?.type).toBe('esm-default');

    const namespaceImport = analysis.imports.find(i => i.moduleSpecifier === 'fs');
    expect(namespaceImport).toBeDefined();
    expect(namespaceImport?.type).toBe('esm-namespace');

    // Check exports
    expect(analysis.exports).toContain('myFunction');
    expect(analysis.exports).toContain('myConst');

    // Check dependencies classification
    const workspaceDep = context.dependencies.find(d => d.moduleSpecifier === '@automaker/utils');
    expect(workspaceDep?.dependencyType).toBe('workspace');

    const builtinDep = context.dependencies.find(d => d.moduleSpecifier === 'path');
    expect(builtinDep?.dependencyType).toBe('builtin');
  });

  it('should analyze multiple related files', async () => {
    // Create main file
    const mainFile = path.join(tempDir, 'main.ts');
    await fs.writeFile(mainFile, `
import { helper } from './utils';
import { config } from './config';

export function main() {
  return helper(config);
}
`);

    // Create utils file
    const utilsFile = path.join(tempDir, 'utils.ts');
    await fs.writeFile(utilsFile, `
export function helper(value: string) {
  return value.toUpperCase();
}
`);

    // Create config file
    const configFile = path.join(tempDir, 'config.ts');
    await fs.writeFile(configFile, `
export const config = 'test-config';
`);

    // Build context for all files
    const context = await buildCodeContext({
      changedFiles: ['main.ts', 'utils.ts', 'config.ts'],
      projectPath: tempDir,
    });

    expect(context.fileAnalyses).toHaveLength(3);
    expect(context.summary.filesAnalyzed).toBe(3);

    // Main file should have 2 local dependencies
    const localDeps = context.dependencies.filter(d => d.dependencyType === 'local');
    expect(localDeps.length).toBe(2);
  });

  it('should format code context for review', async () => {
    // Create a simple test file
    const testFile = path.join(tempDir, 'simple.ts');
    await fs.writeFile(testFile, `
import { foo } from 'external-lib';
export const bar = 1;
`);

    const context = await buildCodeContext({
      changedFiles: ['simple.ts'],
      projectPath: tempDir,
    });

    const formatted = formatCodeContext(context);

    // Check formatted output contains expected sections
    expect(formatted.text).toContain('Code Context Summary');
    expect(formatted.text).toContain('Files analyzed:');
    expect(formatted.text).toContain('Changed Files Analysis');
    expect(formatted.estimatedTokens).toBeGreaterThan(0);
    expect(typeof formatted.wasTruncated).toBe('boolean');
  });

  it('should respect exclude patterns', async () => {
    // Create files in different directories
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.mkdir(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'dist'));

    await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'export const x = 1;');
    await fs.writeFile(path.join(tempDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}');
    await fs.writeFile(path.join(tempDir, 'dist', 'bundle.js'), 'var x = 1;');

    const context = await buildCodeContext({
      changedFiles: [
        'src/app.ts',
        'node_modules/pkg/index.js',
        'dist/bundle.js',
      ],
      projectPath: tempDir,
      options: {
        excludePatterns: ['node_modules/**', 'dist/**'],
      },
    });

    // Only src/app.ts should be analyzed
    expect(context.changedFiles).toContain('src/app.ts');
    expect(context.changedFiles).not.toContain('node_modules/pkg/index.js');
    expect(context.changedFiles).not.toContain('dist/bundle.js');
  });

  it('should handle files that cannot be read gracefully', async () => {
    // Try to analyze a non-existent file
    const context = await buildCodeContext({
      changedFiles: ['nonexistent.ts'],
      projectPath: tempDir,
    });

    expect(context.fileAnalyses).toHaveLength(1);
    expect(context.fileAnalyses[0].parseSuccess).toBe(false);
    expect(context.fileAnalyses[0].parseError).toBeDefined();
    expect(context.summary.parseErrors).toBe(1);
  });

  it('should use CodeContextBuilder class with caching', async () => {
    const testFile = path.join(tempDir, 'cached.ts');
    await fs.writeFile(testFile, 'export const x = 1;');

    const builder = createCodeContextBuilder(tempDir);

    // First analysis
    const analysis1 = await builder.analyzeFile('cached.ts');
    expect(analysis1.parseSuccess).toBe(true);

    // Second analysis should be cached (same object)
    const analysis2 = await builder.analyzeFile('cached.ts');
    expect(analysis2).toBe(analysis1);

    // Clear cache and analyze again
    builder.clearCache();
    const analysis3 = await builder.analyzeFile('cached.ts');
    expect(analysis3.parseSuccess).toBe(true);
    // After cache clear, it should be a new object
    expect(analysis3).not.toBe(analysis1);
  });

  it('should find test files as related files', async () => {
    // Create a source file and its test
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(
      path.join(tempDir, 'src', 'myService.ts'),
      'export class MyService {}'
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'myService.test.ts'),
      'import { MyService } from "./myService"; test("works", () => {});'
    );

    const context = await buildCodeContext({
      changedFiles: ['src/myService.ts'],
      projectPath: tempDir,
      options: {
        includeTestFiles: true,
      },
    });

    // Should find the test file as related
    const testRelated = context.relatedFiles.find(
      r => r.path.includes('myService.test.ts')
    );
    expect(testRelated).toBeDefined();
    expect(testRelated?.relationship).toBe('test-file');
  });

  it('should find sibling files in same directory', async () => {
    // Create multiple files in same directory
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src', 'main.ts'), 'export const main = 1;');
    await fs.writeFile(path.join(tempDir, 'src', 'helper.ts'), 'export const helper = 2;');
    await fs.writeFile(path.join(tempDir, 'src', 'utils.ts'), 'export const utils = 3;');

    const context = await buildCodeContext({
      changedFiles: ['src/main.ts'],
      projectPath: tempDir,
    });

    // Should find sibling files
    const siblings = context.relatedFiles.filter(r => r.relationship === 'sibling');
    expect(siblings.length).toBeGreaterThanOrEqual(1);
  });

  it('should build context for real codebase files', async () => {
    // Use actual project files to test real-world scenario
    const projectPath = path.resolve(__dirname, '../../../../..');

    // Analyze the code-context-builder.ts file itself
    const context = await buildCodeContext({
      changedFiles: ['apps/server/src/services/code-context-builder.ts'],
      projectPath,
      options: {
        maxRelatedFiles: 5,
        includeTestFiles: false,
        includeTypeDefinitions: false,
      },
    });

    // Should successfully analyze the file
    expect(context.fileAnalyses).toHaveLength(1);
    expect(context.fileAnalyses[0].parseSuccess).toBe(true);

    // Should find imports
    expect(context.fileAnalyses[0].imports.length).toBeGreaterThan(0);

    // Should have multiple dependencies
    expect(context.dependencies.length).toBeGreaterThan(0);

    // Summary should be accurate
    expect(context.summary.filesAnalyzed).toBe(1);
    expect(context.summary.totalImports).toBeGreaterThan(0);
  });
});
