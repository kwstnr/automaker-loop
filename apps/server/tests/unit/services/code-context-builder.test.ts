import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCodeContext,
  formatCodeContext,
  createCodeContextBuilder,
  CodeContextBuilder,
} from '@/services/code-context-builder.js';
import type { CodeContext, CodeContextOptions } from '@automaker/types';
import { DEFAULT_CODE_CONTEXT_OPTIONS } from '@automaker/types';
import * as secureFs from '@/lib/secure-fs.js';

// Mock secureFs
vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
}));

const mockReadFile = vi.mocked(secureFs.readFile);
const mockStat = vi.mocked(secureFs.stat);
const mockReaddir = vi.mocked(secureFs.readdir);

describe('code-context-builder.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildCodeContext', () => {
    it('should analyze a simple TypeScript file with ESM imports', async () => {
      const fileContent = `
import { createLogger } from '@automaker/utils';
import path from 'path';
import * as fs from 'fs';
import type { Feature } from '@automaker/types';
import './styles.css';

export function myFunction() {
  return 'hello';
}

export const myConst = 42;
`;

      mockReadFile.mockResolvedValue(fileContent);
      mockStat.mockRejectedValue(new Error('Not found')); // No related files found

      const result = await buildCodeContext({
        changedFiles: ['src/services/my-service.ts'],
        projectPath: '/project',
      });

      expect(result.changedFiles).toEqual(['src/services/my-service.ts']);
      expect(result.fileAnalyses).toHaveLength(1);

      const analysis = result.fileAnalyses[0];
      expect(analysis.parseSuccess).toBe(true);
      expect(analysis.imports).toHaveLength(5);

      // Check named import
      const namedImport = analysis.imports.find(
        (i) => i.moduleSpecifier === '@automaker/utils'
      );
      expect(namedImport).toBeDefined();
      expect(namedImport?.type).toBe('esm-named');
      expect(namedImport?.namedImports).toContain('createLogger');

      // Check default import
      const defaultImport = analysis.imports.find(
        (i) => i.moduleSpecifier === 'path'
      );
      expect(defaultImport).toBeDefined();
      expect(defaultImport?.type).toBe('esm-default');
      expect(defaultImport?.defaultImport).toBe('path');

      // Check namespace import
      const namespaceImport = analysis.imports.find(
        (i) => i.moduleSpecifier === 'fs'
      );
      expect(namespaceImport).toBeDefined();
      expect(namespaceImport?.type).toBe('esm-namespace');
      expect(namespaceImport?.namespaceImport).toBe('fs');

      // Check type-only import
      const typeImport = analysis.imports.find(
        (i) => i.moduleSpecifier === '@automaker/types'
      );
      expect(typeImport).toBeDefined();
      expect(typeImport?.isTypeOnly).toBe(true);

      // Check side-effect import
      const sideEffectImport = analysis.imports.find(
        (i) => i.moduleSpecifier === './styles.css'
      );
      expect(sideEffectImport).toBeDefined();
      expect(sideEffectImport?.type).toBe('esm-side-effect');

      // Check exports
      expect(analysis.exports).toContain('myFunction');
      expect(analysis.exports).toContain('myConst');
    });

    it('should handle CommonJS require statements', async () => {
      const fileContent = `
const express = require('express');
const { Router } = require('express');
const path = require('path');
`;

      mockReadFile.mockResolvedValue(fileContent);
      mockStat.mockRejectedValue(new Error('Not found'));

      const result = await buildCodeContext({
        changedFiles: ['src/app.js'],
        projectPath: '/project',
      });

      const analysis = result.fileAnalyses[0];
      expect(analysis.imports).toHaveLength(3);

      const defaultRequire = analysis.imports.find(
        (i) => i.defaultImport === 'express'
      );
      expect(defaultRequire).toBeDefined();
      expect(defaultRequire?.type).toBe('commonjs-require');

      const namedRequire = analysis.imports.find(
        (i) => i.namedImports?.includes('Router')
      );
      expect(namedRequire).toBeDefined();
    });

    it('should correctly identify dependency types', async () => {
      const fileContent = `
import { foo } from './local-module';
import { bar } from '@automaker/types';
import { baz } from 'lodash';
import fs from 'fs';
import path from 'node:path';
`;

      mockReadFile.mockResolvedValue(fileContent);
      mockStat.mockRejectedValue(new Error('Not found'));

      const result = await buildCodeContext({
        changedFiles: ['src/index.ts'],
        projectPath: '/project',
      });

      expect(result.dependencies).toHaveLength(5);

      const localDep = result.dependencies.find(
        (d) => d.moduleSpecifier === './local-module'
      );
      expect(localDep?.dependencyType).toBe('local');

      const workspaceDep = result.dependencies.find(
        (d) => d.moduleSpecifier === '@automaker/types'
      );
      expect(workspaceDep?.dependencyType).toBe('workspace');

      const externalDep = result.dependencies.find(
        (d) => d.moduleSpecifier === 'lodash'
      );
      expect(externalDep?.dependencyType).toBe('external');

      const builtinDep = result.dependencies.find(
        (d) => d.moduleSpecifier === 'fs'
      );
      expect(builtinDep?.dependencyType).toBe('builtin');

      const nodeBuiltinDep = result.dependencies.find(
        (d) => d.moduleSpecifier === 'node:path'
      );
      expect(nodeBuiltinDep?.dependencyType).toBe('builtin');
    });

    it('should aggregate dependencies from multiple files', async () => {
      mockReadFile
        .mockResolvedValueOnce(`import { foo } from '@automaker/utils';`)
        .mockResolvedValueOnce(`import { foo, bar } from '@automaker/utils';`);
      mockStat.mockRejectedValue(new Error('Not found'));

      const result = await buildCodeContext({
        changedFiles: ['src/file1.ts', 'src/file2.ts'],
        projectPath: '/project',
      });

      expect(result.fileAnalyses).toHaveLength(2);

      const utilsDep = result.dependencies.find(
        (d) => d.moduleSpecifier === '@automaker/utils'
      );
      expect(utilsDep).toBeDefined();
      expect(utilsDep?.importedBy).toHaveLength(2);
      expect(utilsDep?.usedExports).toContain('foo');
      expect(utilsDep?.usedExports).toContain('bar');
    });

    it('should handle files with parse errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockStat.mockRejectedValue(new Error('Not found'));

      const result = await buildCodeContext({
        changedFiles: ['src/nonexistent.ts'],
        projectPath: '/project',
      });

      expect(result.fileAnalyses).toHaveLength(1);
      expect(result.fileAnalyses[0].parseSuccess).toBe(false);
      expect(result.fileAnalyses[0].parseError).toBe('File not found');
      expect(result.summary.parseErrors).toBe(1);
    });

    it('should build accurate summary statistics', async () => {
      const fileContent = `
import { a, b } from './local';
import c from 'external';
import * as d from 'node:fs';
`;

      mockReadFile.mockResolvedValue(fileContent);
      mockStat.mockRejectedValue(new Error('Not found'));

      const result = await buildCodeContext({
        changedFiles: ['src/index.ts'],
        projectPath: '/project',
      });

      expect(result.summary.filesAnalyzed).toBe(1);
      expect(result.summary.totalImports).toBe(3);
      expect(result.summary.localDependencies).toBe(1);
      expect(result.summary.externalDependencies).toBe(1);
      expect(result.summary.parseErrors).toBe(0);
    });

    it('should respect exclude patterns', async () => {
      mockReadFile.mockResolvedValue('const x = 1;');
      mockStat.mockRejectedValue(new Error('Not found'));

      const result = await buildCodeContext({
        changedFiles: [
          'src/index.ts',
          'node_modules/lodash/index.js',
          'dist/bundle.js',
        ],
        projectPath: '/project',
        options: {
          excludePatterns: ['node_modules/**', 'dist/**'],
        },
      });

      // Only src/index.ts should be included (others excluded)
      expect(result.changedFiles).toContain('src/index.ts');
      expect(result.changedFiles).not.toContain('node_modules/lodash/index.js');
      expect(result.changedFiles).not.toContain('dist/bundle.js');
    });
  });

  describe('formatCodeContext', () => {
    const createMockContext = (): CodeContext => ({
      changedFiles: ['src/index.ts', 'src/utils.ts'],
      fileAnalyses: [
        {
          filePath: 'src/index.ts',
          imports: [
            {
              type: 'esm-named',
              moduleSpecifier: '@automaker/utils',
              namedImports: ['createLogger'],
              line: 1,
            },
          ],
          exports: ['main', 'init'],
          parseSuccess: true,
        },
        {
          filePath: 'src/utils.ts',
          imports: [],
          exports: ['helper'],
          parseSuccess: true,
        },
      ],
      dependencies: [
        {
          moduleSpecifier: '@automaker/utils',
          dependencyType: 'workspace',
          importedBy: ['src/index.ts'],
          usedExports: ['createLogger'],
        },
        {
          moduleSpecifier: './helpers',
          dependencyType: 'local',
          resolvedPath: 'src/helpers.ts',
          importedBy: ['src/index.ts'],
          usedExports: ['format'],
        },
      ],
      relatedFiles: [
        {
          path: 'src/index.test.ts',
          relationship: 'test-file',
          relevanceScore: 90,
          reason: 'Test file for src/index.ts',
        },
      ],
      summary: {
        filesAnalyzed: 2,
        totalImports: 1,
        localDependencies: 1,
        externalDependencies: 0,
        relatedFilesCount: 1,
        parseErrors: 0,
      },
    });

    it('should format context with all sections', () => {
      const context = createMockContext();
      const formatted = formatCodeContext(context);

      expect(formatted.text).toContain('## Code Context Summary');
      expect(formatted.text).toContain('Files analyzed: 2');
      expect(formatted.text).toContain('## Changed Files Analysis');
      expect(formatted.text).toContain('src/index.ts');
      expect(formatted.text).toContain('## Key Local Dependencies');
      expect(formatted.text).toContain('./helpers');
      expect(formatted.text).toContain('## Related Files');
      expect(formatted.text).toContain('src/index.test.ts');
      expect(formatted.wasTruncated).toBe(false);
    });

    it('should truncate when exceeding max tokens', () => {
      const context = createMockContext();
      // Very small token limit to force truncation
      const formatted = formatCodeContext(context, 100);

      expect(formatted.wasTruncated).toBe(true);
      expect(formatted.text).toContain('[Context truncated due to size limits]');
    });

    it('should include parse errors in output when present', () => {
      const context = createMockContext();
      context.fileAnalyses[1].parseSuccess = false;
      context.fileAnalyses[1].parseError = 'Syntax error';
      context.summary.parseErrors = 1;

      const formatted = formatCodeContext(context);

      expect(formatted.text).toContain('Parse errors: 1');
      expect(formatted.text).toContain('Parse error: Syntax error');
    });

    it('should estimate tokens reasonably', () => {
      const context = createMockContext();
      const formatted = formatCodeContext(context);

      // Token estimate should be roughly text length / 4
      const expectedTokens = Math.ceil(formatted.text.length / 4);
      expect(formatted.estimatedTokens).toBeGreaterThan(0);
      expect(formatted.estimatedTokens).toBeLessThanOrEqual(expectedTokens + 50);
    });
  });

  describe('CodeContextBuilder class', () => {
    it('should create instance with default options', () => {
      const builder = createCodeContextBuilder('/project');
      expect(builder).toBeInstanceOf(CodeContextBuilder);
    });

    it('should create instance with custom options', () => {
      const customOptions: CodeContextOptions = {
        maxDepth: 3,
        maxRelatedFiles: 30,
        includeTestFiles: false,
      };

      const builder = createCodeContextBuilder('/project', customOptions);
      expect(builder).toBeInstanceOf(CodeContextBuilder);
    });

    it('should build context using instance method', async () => {
      mockReadFile.mockResolvedValue('export const x = 1;');
      mockStat.mockRejectedValue(new Error('Not found'));

      const builder = createCodeContextBuilder('/project');
      const result = await builder.build(['src/index.ts']);

      expect(result.changedFiles).toEqual(['src/index.ts']);
      expect(result.fileAnalyses).toHaveLength(1);
    });

    it('should cache file analyses', async () => {
      mockReadFile.mockResolvedValue('export const x = 1;');
      mockStat.mockRejectedValue(new Error('Not found'));

      const builder = createCodeContextBuilder('/project');

      // Analyze same file twice
      await builder.analyzeFile('src/index.ts');
      await builder.analyzeFile('src/index.ts');

      // Should only read file once due to caching
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when requested', async () => {
      mockReadFile.mockResolvedValue('export const x = 1;');
      mockStat.mockRejectedValue(new Error('Not found'));

      const builder = createCodeContextBuilder('/project');

      await builder.analyzeFile('src/index.ts');
      builder.clearCache();
      await builder.analyzeFile('src/index.ts');

      // Should read file twice after cache clear
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it('should format context using instance method', async () => {
      mockReadFile.mockResolvedValue('export const x = 1;');
      mockStat.mockRejectedValue(new Error('Not found'));

      const builder = createCodeContextBuilder('/project');
      const context = await builder.build(['src/index.ts']);
      const formatted = builder.format(context);

      expect(formatted.text).toContain('## Code Context Summary');
      expect(formatted.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_CODE_CONTEXT_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.maxDepth).toBe(2);
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.maxRelatedFiles).toBe(20);
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.includeTestFiles).toBe(true);
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.includeTypeDefinitions).toBe(true);
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.minRelevanceScore).toBe(30);
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.excludePatterns).toContain('node_modules/**');
      expect(DEFAULT_CODE_CONTEXT_OPTIONS.excludePatterns).toContain('dist/**');
    });
  });
});
