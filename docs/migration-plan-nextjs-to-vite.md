# Migration Plan: Next.js to Vite + Electron + TanStack

> **Document Version**: 1.0
> **Date**: December 2025
> **Status**: Planning Phase
> **Branch**: feature/worktrees (awaiting merge before implementation)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Assessment](#current-architecture-assessment)
3. [Proposed New Architecture](#proposed-new-architecture)
4. [Folder Structure](#folder-structure)
5. [Shared Packages (libs/)](#shared-packages-libs)
6. [Type-Safe Electron Implementation](#type-safe-electron-implementation)
7. [Components Refactoring](#components-refactoring)
8. [Web + Electron Dual Support](#web--electron-dual-support)
9. [Migration Phases](#migration-phases)
10. [Expected Benefits](#expected-benefits)
11. [Risk Mitigation](#risk-mitigation)

---

## Executive Summary

### Why Migrate?

Our current Next.js implementation uses **less than 5%** of the framework's capabilities. We're essentially running a static SPA with unnecessary overhead:

| Next.js Feature | Our Usage |
|-----------------|-----------|
| Server-Side Rendering | ❌ Not used |
| Static Site Generation | ❌ Not used |
| API Routes | ⚠️ Only 2 test endpoints |
| Image Optimization | ❌ Not used |
| Dynamic Routing | ❌ Not used |
| App Router | ⚠️ File structure only |
| Metadata API | ⚠️ Title/description only |
| Static Export | ✅ Used (`output: "export"`) |

### Migration Benefits

| Metric | Current (Next.js) | Expected (Vite) |
|--------|-------------------|-----------------|
| Dev server startup | ~8-15s | ~1-3s |
| HMR speed | ~500ms-2s | ~50-100ms |
| Production build | ~45-90s | ~15-30s |
| Bundle overhead | Next.js runtime | None |
| Type safety (Electron) | 0% | 100% |
| Debug capabilities | Limited | Full debug console |

### Target Stack

- **Bundler**: Vite
- **Framework**: React 19
- **Routing**: TanStack Router (file-based)
- **Data Fetching**: TanStack Query
- **State**: Zustand (unchanged)
- **Styling**: Tailwind CSS 4 (unchanged)
- **Desktop**: Electron (TypeScript rewrite)

---

## Current Architecture Assessment

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐       HTTP/WS        ┌─────────────────┐  │
│  │   React SPA     │ ←──────────────────→ │  Backend Server │  │
│  │   (Next.js)     │     localhost:3008   │   (Express)     │  │
│  │                 │                       │                 │  │
│  │ • Zustand Store │                       │ • AI Providers  │  │
│  │ • 16 Views      │                       │ • Git/FS Ops    │  │
│  │ • 180+ Comps    │                       │ • Terminal      │  │
│  └────────┬────────┘                       └─────────────────┘  │
│           │                                                      │
│           │ IPC (minimal - dialogs/shell only)                  │
│           ↓                                                      │
│  ┌─────────────────┐                                            │
│  │  Electron Main  │ • File dialogs                             │
│  │    (main.js)    │ • Shell operations                         │
│  │   **NO TYPES**  │ • App paths                                │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Current Electron Layer Issues

| Issue | Impact | Solution |
|-------|--------|----------|
| Pure JavaScript | No compile-time safety | Migrate to TypeScript |
| Untyped IPC handlers | Runtime errors | IPC Schema with generics |
| String literal channels | Typos cause silent failures | Const enums |
| No debug tooling | Hard to diagnose issues | Debug console feature |
| Monolithic main.js | Hard to maintain | Modular IPC organization |

### Current Component Structure Issues

| View File | Lines | Issue |
|-----------|-------|-------|
| spec-view.tsx | 1,230 | Exceeds 500-line threshold |
| analysis-view.tsx | 1,134 | Exceeds 500-line threshold |
| agent-view.tsx | 916 | Exceeds 500-line threshold |
| welcome-view.tsx | 815 | Exceeds 500-line threshold |
| context-view.tsx | 735 | Exceeds 500-line threshold |
| terminal-view.tsx | 697 | Exceeds 500-line threshold |
| interview-view.tsx | 637 | Exceeds 500-line threshold |
| board-view.tsx | 685 | ✅ Already has subfolder structure |

---

## Proposed New Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MIGRATED ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    @automaker/app (Vite + React)                  │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │  │
│  │  │ TanStack       │  │ TanStack       │  │ Zustand            │  │  │
│  │  │ Router         │  │ Query          │  │ Store              │  │  │
│  │  │ (file-based)   │  │ (data fetch)   │  │ (UI state)         │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘  │  │
│  │                                                                    │  │
│  │  src/                                                              │  │
│  │  ├── routes/          # TanStack file-based routes                │  │
│  │  ├── components/      # Refactored per folder-pattern.md          │  │
│  │  ├── hooks/           # React hooks                               │  │
│  │  ├── store/           # Zustand stores                            │  │
│  │  ├── lib/             # Utilities                                 │  │
│  │  └── config/          # Configuration                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│          HTTP/WS (unchanged) │           Type-Safe IPC                  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Electron Layer (TypeScript)                    │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  electron/                                                        │  │
│  │  ├── main.ts              # Main process entry                   │  │
│  │  ├── preload.ts           # Context bridge exposure              │  │
│  │  ├── debug-console/       # Debug console feature                │  │
│  │  └── ipc/                 # Modular IPC handlers                 │  │
│  │      ├── ipc-schema.ts    # Type definitions                     │  │
│  │      ├── dialog/          # File dialogs                         │  │
│  │      ├── shell/           # Shell operations                     │  │
│  │      └── server/          # Server management                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    @automaker/server (unchanged)                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         SHARED PACKAGES (libs/)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  @automaker/types          # API contracts, model definitions           │
│  @automaker/utils          # Shared utilities (error handling, etc.)    │
│  @automaker/platform       # OS-specific utilities, path handling       │
│  @automaker/model-resolver # Model string resolution                    │
│  @automaker/ipc-types      # IPC channel type definitions               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

### apps/app/ (After Migration)

```
apps/app/
├── electron/                          # Electron main process (TypeScript)
│   ├── main.ts                        # Main entry point
│   ├── preload.ts                     # Context bridge
│   ├── tsconfig.json                  # Electron-specific TS config
│   ├── debug-console/
│   │   ├── debug-console.html
│   │   ├── debug-console-preload.ts
│   │   └── debug-mode.ts
│   ├── ipc/
│   │   ├── ipc-schema.ts              # Central type definitions
│   │   ├── context-exposer.ts         # Exposes all contexts to renderer
│   │   ├── listeners-register.ts      # Registers all main process handlers
│   │   ├── dialog/
│   │   │   ├── dialog-channels.ts     # Channel constants
│   │   │   ├── dialog-context.ts      # Preload exposure
│   │   │   └── dialog-listeners.ts    # Main process handlers
│   │   ├── shell/
│   │   │   ├── shell-channels.ts
│   │   │   ├── shell-context.ts
│   │   │   └── shell-listeners.ts
│   │   ├── app-info/
│   │   │   ├── app-info-channels.ts
│   │   │   ├── app-info-context.ts
│   │   │   └── app-info-listeners.ts
│   │   └── server/
│   │       ├── server-channels.ts
│   │       ├── server-context.ts
│   │       └── server-listeners.ts
│   └── helpers/
│       ├── server-manager.ts          # Backend server spawn/health
│       ├── static-server.ts           # Production static file server
│       ├── window-helpers.ts          # Window utilities
│       └── window-registry.ts         # Multi-window tracking
│
├── src/
│   ├── routes/                        # TanStack Router (file-based)
│   │   ├── __root.tsx                 # Root layout
│   │   ├── index.tsx                  # Welcome/home (default route)
│   │   ├── board.tsx                  # Board view
│   │   ├── agent.tsx                  # Agent view
│   │   ├── settings.tsx               # Settings view
│   │   ├── setup.tsx                  # Setup view
│   │   ├── terminal.tsx               # Terminal view
│   │   ├── spec.tsx                   # Spec view
│   │   ├── context.tsx                # Context view
│   │   ├── profiles.tsx               # Profiles view
│   │   ├── interview.tsx              # Interview view
│   │   ├── wiki.tsx                   # Wiki view
│   │   ├── analysis.tsx               # Analysis view
│   │   └── agent-tools.tsx            # Agent tools view
│   │
│   ├── components/                    # Refactored per folder-pattern.md
│   │   ├── ui/                        # Global UI primitives (unchanged)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── base-layout.tsx
│   │   │   └── index.ts
│   │   ├── dialogs/                   # Global dialogs
│   │   │   ├── index.ts
│   │   │   ├── new-project-modal.tsx
│   │   │   ├── workspace-picker-modal.tsx
│   │   │   └── file-browser-dialog.tsx
│   │   └── views/                     # Complex view components
│   │       ├── board-view/            # ✅ Already structured
│   │       ├── settings-view/         # Needs dialogs reorganization
│   │       ├── setup-view/            # ✅ Already structured
│   │       ├── profiles-view/         # ✅ Already structured
│   │       ├── agent-view/            # NEW: needs subfolder
│   │       │   ├── components/
│   │       │   │   ├── index.ts
│   │       │   │   ├── message-list.tsx
│   │       │   │   ├── message-input.tsx
│   │       │   │   └── session-sidebar.tsx
│   │       │   ├── dialogs/
│   │       │   │   ├── index.ts
│   │       │   │   ├── delete-session-dialog.tsx
│   │       │   │   └── delete-all-archived-dialog.tsx
│   │       │   └── hooks/
│   │       │       ├── index.ts
│   │       │       └── use-agent-state.ts
│   │       ├── spec-view/             # NEW: needs subfolder (1230 lines!)
│   │       ├── analysis-view/         # NEW: needs subfolder (1134 lines!)
│   │       ├── context-view/          # NEW: needs subfolder
│   │       ├── welcome-view/          # NEW: needs subfolder
│   │       ├── interview-view/        # NEW: needs subfolder
│   │       └── terminal-view/         # Expand existing
│   │
│   ├── hooks/                         # Global hooks
│   ├── store/                         # Zustand stores
│   ├── lib/                           # Utilities
│   ├── config/                        # Configuration
│   ├── contexts/                      # React contexts
│   ├── types/                         # Type definitions
│   ├── App.tsx                        # Root component
│   ├── renderer.ts                    # Vite entry point
│   └── routeTree.gen.ts               # Generated by TanStack Router
│
├── index.html                         # Vite HTML entry
├── vite.config.mts                    # Vite configuration
├── tsconfig.json                      # TypeScript config (renderer)
├── package.json
└── tailwind.config.ts
```

---

## Shared Packages (libs/)

### Package Overview

```
libs/
├── @automaker/types           # API contracts, model definitions
├── @automaker/utils           # General utilities (error handling, logger)
├── @automaker/platform        # OS-specific utilities, path handling
├── @automaker/model-resolver  # Model string resolution
└── @automaker/ipc-types       # IPC channel type definitions
```

### @automaker/types

Shared type definitions for API contracts between frontend and backend.

```
libs/types/
├── src/
│   ├── api.ts                 # API response types
│   ├── models.ts              # ModelDefinition, ProviderStatus
│   ├── features.ts            # Feature, FeatureStatus, Priority
│   ├── sessions.ts            # Session, Message types
│   ├── agent.ts               # Agent types
│   ├── git.ts                 # Git operation types
│   ├── worktree.ts            # Worktree types
│   └── index.ts               # Barrel export
├── package.json
└── tsconfig.json
```

```typescript
// libs/types/src/models.ts
export interface ModelDefinition {
  id: string
  name: string
  provider: ProviderType
  contextWindow: number
  maxOutputTokens: number
  capabilities: ModelCapabilities
}

export interface ModelCapabilities {
  vision: boolean
  toolUse: boolean
  streaming: boolean
  computerUse: boolean
}

export type ProviderType = "claude" | "openai" | "gemini" | "ollama"
```

### @automaker/utils

General utilities shared between frontend and backend.

```
libs/utils/
├── src/
│   ├── error-handler.ts       # Error classification & user-friendly messages
│   ├── logger.ts              # Logging utilities
│   ├── conversation-utils.ts  # Message formatting & history
│   ├── image-utils.ts         # Image processing utilities
│   ├── string-utils.ts        # String manipulation helpers
│   └── index.ts
├── package.json
└── tsconfig.json
```

```typescript
// libs/utils/src/error-handler.ts
export type ErrorType =
  | "authentication"
  | "rate_limit"
  | "network"
  | "validation"
  | "not_found"
  | "server"
  | "unknown"

export interface ErrorInfo {
  type: ErrorType
  message: string
  userMessage: string
  retryable: boolean
  statusCode?: number
}

export function classifyError(error: unknown): ErrorInfo
export function getUserFriendlyErrorMessage(error: unknown): string
export function isAbortError(error: unknown): boolean
export function isAuthenticationError(error: unknown): boolean
export function isRateLimitError(error: unknown): boolean
```

### @automaker/platform

**OS-specific utilities, path handling, and cross-platform helpers.**

```
libs/platform/
├── src/
│   ├── paths/
│   │   ├── index.ts           # Path utilities barrel export
│   │   ├── path-resolver.ts   # Cross-platform path resolution
│   │   ├── path-constants.ts  # Common path constants
│   │   └── path-validator.ts  # Path validation utilities
│   ├── os/
│   │   ├── index.ts           # OS utilities barrel export
│   │   ├── platform-info.ts   # Platform detection & info
│   │   ├── shell-commands.ts  # OS-specific shell commands
│   │   └── env-utils.ts       # Environment variable utilities
│   ├── fs/
│   │   ├── index.ts           # FS utilities barrel export
│   │   ├── safe-fs.ts         # Symlink-safe file operations
│   │   ├── temp-files.ts      # Temporary file handling
│   │   └── permissions.ts     # File permission utilities
│   └── index.ts               # Main barrel export
├── package.json
└── tsconfig.json
```

```typescript
// libs/platform/src/paths/path-resolver.ts
import path from "path"

/**
 * Platform-aware path separator
 */
export const SEP = path.sep

/**
 * Normalizes a path to use the correct separator for the current OS
 */
export function normalizePath(inputPath: string): string {
  return inputPath.replace(/[/\\]/g, SEP)
}

/**
 * Converts a path to POSIX format (forward slashes)
 * Useful for consistent storage/comparison
 */
export function toPosixPath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/")
}

/**
 * Converts a path to Windows format (backslashes)
 */
export function toWindowsPath(inputPath: string): string {
  return inputPath.replace(/\//g, "\\")
}

/**
 * Resolves a path relative to a base, handling platform differences
 */
export function resolvePath(basePath: string, ...segments: string[]): string {
  return path.resolve(basePath, ...segments)
}

/**
 * Gets the relative path from one location to another
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to)
}

/**
 * Joins path segments with proper platform separator
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments)
}

/**
 * Extracts directory name from a path
 */
export function getDirname(filePath: string): string {
  return path.dirname(filePath)
}

/**
 * Extracts filename from a path
 */
export function getBasename(filePath: string, ext?: string): string {
  return path.basename(filePath, ext)
}

/**
 * Extracts file extension from a path
 */
export function getExtension(filePath: string): string {
  return path.extname(filePath)
}

/**
 * Checks if a path is absolute
 */
export function isAbsolutePath(inputPath: string): boolean {
  return path.isAbsolute(inputPath)
}

/**
 * Ensures a path is absolute, resolving relative to cwd if needed
 */
export function ensureAbsolutePath(inputPath: string, basePath?: string): string {
  if (isAbsolutePath(inputPath)) {
    return inputPath
  }
  return resolvePath(basePath || process.cwd(), inputPath)
}
```

```typescript
// libs/platform/src/paths/path-constants.ts
import path from "path"
import os from "os"

/**
 * Common system paths
 */
export const SYSTEM_PATHS = {
  /** User's home directory */
  home: os.homedir(),

  /** System temporary directory */
  temp: os.tmpdir(),

  /** Current working directory */
  cwd: process.cwd(),
} as const

/**
 * Gets the appropriate app data directory for the current platform
 */
export function getAppDataPath(appName: string): string {
  const platform = process.platform

  switch (platform) {
    case "win32":
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName)
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", appName)
    default: // Linux and others
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), appName)
  }
}

/**
 * Gets the appropriate cache directory for the current platform
 */
export function getCachePath(appName: string): string {
  const platform = process.platform

  switch (platform) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), appName, "Cache")
    case "darwin":
      return path.join(os.homedir(), "Library", "Caches", appName)
    default:
      return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), appName)
  }
}

/**
 * Gets the appropriate logs directory for the current platform
 */
export function getLogsPath(appName: string): string {
  const platform = process.platform

  switch (platform) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), appName, "Logs")
    case "darwin":
      return path.join(os.homedir(), "Library", "Logs", appName)
    default:
      return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), appName, "logs")
  }
}

/**
 * Gets the user's Documents directory
 */
export function getDocumentsPath(): string {
  const platform = process.platform

  switch (platform) {
    case "win32":
      return process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "Documents")
        : path.join(os.homedir(), "Documents")
    case "darwin":
      return path.join(os.homedir(), "Documents")
    default:
      return process.env.XDG_DOCUMENTS_DIR || path.join(os.homedir(), "Documents")
  }
}

/**
 * Gets the user's Desktop directory
 */
export function getDesktopPath(): string {
  const platform = process.platform

  switch (platform) {
    case "win32":
      return process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "Desktop")
        : path.join(os.homedir(), "Desktop")
    case "darwin":
      return path.join(os.homedir(), "Desktop")
    default:
      return process.env.XDG_DESKTOP_DIR || path.join(os.homedir(), "Desktop")
  }
}
```

```typescript
// libs/platform/src/paths/path-validator.ts
import path from "path"
import { isAbsolutePath } from "./path-resolver"

/**
 * Characters that are invalid in file/directory names on Windows
 */
const WINDOWS_INVALID_CHARS = /[<>:"|?*\x00-\x1f]/g

/**
 * Reserved names on Windows (case-insensitive)
 */
const WINDOWS_RESERVED_NAMES = [
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
]

export interface PathValidationResult {
  valid: boolean
  errors: string[]
  sanitized?: string
}

/**
 * Validates a filename for the current platform
 */
export function validateFilename(filename: string): PathValidationResult {
  const errors: string[] = []

  if (!filename || filename.trim().length === 0) {
    return { valid: false, errors: ["Filename cannot be empty"] }
  }

  // Check for path separators (filename shouldn't be a path)
  if (filename.includes("/") || filename.includes("\\")) {
    errors.push("Filename cannot contain path separators")
  }

  // Platform-specific checks
  if (process.platform === "win32") {
    if (WINDOWS_INVALID_CHARS.test(filename)) {
      errors.push("Filename contains invalid characters for Windows")
    }

    const nameWithoutExt = filename.split(".")[0].toUpperCase()
    if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
      errors.push(`"${nameWithoutExt}" is a reserved name on Windows`)
    }

    if (filename.endsWith(" ") || filename.endsWith(".")) {
      errors.push("Filename cannot end with a space or period on Windows")
    }
  }

  // Check length
  if (filename.length > 255) {
    errors.push("Filename exceeds maximum length of 255 characters")
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length > 0 ? sanitizeFilename(filename) : filename
  }
}

/**
 * Sanitizes a filename for cross-platform compatibility
 */
export function sanitizeFilename(filename: string): string {
  let sanitized = filename
    .replace(WINDOWS_INVALID_CHARS, "_")
    .replace(/[/\\]/g, "_")
    .trim()

  // Handle Windows reserved names
  const nameWithoutExt = sanitized.split(".")[0].toUpperCase()
  if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
    sanitized = "_" + sanitized
  }

  // Remove trailing spaces and periods (Windows)
  sanitized = sanitized.replace(/[\s.]+$/, "")

  // Ensure not empty
  if (!sanitized) {
    sanitized = "unnamed"
  }

  // Truncate if too long
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized)
    const name = path.basename(sanitized, ext)
    sanitized = name.slice(0, 255 - ext.length) + ext
  }

  return sanitized
}

/**
 * Validates a full path for the current platform
 */
export function validatePath(inputPath: string): PathValidationResult {
  const errors: string[] = []

  if (!inputPath || inputPath.trim().length === 0) {
    return { valid: false, errors: ["Path cannot be empty"] }
  }

  // Check total path length
  const maxPathLength = process.platform === "win32" ? 260 : 4096
  if (inputPath.length > maxPathLength) {
    errors.push(`Path exceeds maximum length of ${maxPathLength} characters`)
  }

  // Validate each segment
  const segments = inputPath.split(/[/\\]/).filter(Boolean)
  for (const segment of segments) {
    // Skip drive letters on Windows
    if (process.platform === "win32" && /^[a-zA-Z]:$/.test(segment)) {
      continue
    }

    const segmentValidation = validateFilename(segment)
    if (!segmentValidation.valid) {
      errors.push(...segmentValidation.errors.map(e => `Segment "${segment}": ${e}`))
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Checks if a path is within a base directory (prevents directory traversal)
 */
export function isPathWithin(childPath: string, parentPath: string): boolean {
  const resolvedChild = path.resolve(childPath)
  const resolvedParent = path.resolve(parentPath)

  return resolvedChild.startsWith(resolvedParent + path.sep) ||
         resolvedChild === resolvedParent
}
```

```typescript
// libs/platform/src/os/platform-info.ts
import os from "os"

export type Platform = "windows" | "macos" | "linux" | "unknown"
export type Architecture = "x64" | "arm64" | "ia32" | "unknown"

export interface PlatformInfo {
  platform: Platform
  arch: Architecture
  release: string
  hostname: string
  username: string
  cpus: number
  totalMemory: number
  freeMemory: number
  isWsl: boolean
  isDocker: boolean
}

/**
 * Gets the normalized platform name
 */
export function getPlatform(): Platform {
  switch (process.platform) {
    case "win32":
      return "windows"
    case "darwin":
      return "macos"
    case "linux":
      return "linux"
    default:
      return "unknown"
  }
}

/**
 * Gets the normalized architecture
 */
export function getArchitecture(): Architecture {
  switch (process.arch) {
    case "x64":
      return "x64"
    case "arm64":
      return "arm64"
    case "ia32":
      return "ia32"
    default:
      return "unknown"
  }
}

/**
 * Checks if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === "win32"
}

/**
 * Checks if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === "darwin"
}

/**
 * Checks if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === "linux"
}

/**
 * Checks if running in WSL (Windows Subsystem for Linux)
 */
export function isWsl(): boolean {
  if (process.platform !== "linux") return false

  try {
    const release = os.release().toLowerCase()
    return release.includes("microsoft") || release.includes("wsl")
  } catch {
    return false
  }
}

/**
 * Checks if running in Docker container
 */
export function isDocker(): boolean {
  try {
    const fs = require("fs")
    return fs.existsSync("/.dockerenv") ||
           (fs.existsSync("/proc/1/cgroup") &&
            fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker"))
  } catch {
    return false
  }
}

/**
 * Gets comprehensive platform information
 */
export function getPlatformInfo(): PlatformInfo {
  return {
    platform: getPlatform(),
    arch: getArchitecture(),
    release: os.release(),
    hostname: os.hostname(),
    username: os.userInfo().username,
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    isWsl: isWsl(),
    isDocker: isDocker()
  }
}

/**
 * Gets the appropriate line ending for the current platform
 */
export function getLineEnding(): string {
  return isWindows() ? "\r\n" : "\n"
}

/**
 * Normalizes line endings to the current platform
 */
export function normalizeLineEndings(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  return isWindows() ? normalized.replace(/\n/g, "\r\n") : normalized
}
```

```typescript
// libs/platform/src/os/shell-commands.ts
import { isWindows, isMacOS } from "./platform-info"

export interface ShellCommand {
  command: string
  args: string[]
}

/**
 * Gets the appropriate command to open a file/URL with default application
 */
export function getOpenCommand(target: string): ShellCommand {
  if (isWindows()) {
    return { command: "cmd", args: ["/c", "start", "", target] }
  } else if (isMacOS()) {
    return { command: "open", args: [target] }
  } else {
    return { command: "xdg-open", args: [target] }
  }
}

/**
 * Gets the appropriate command to reveal a file in file manager
 */
export function getRevealCommand(filePath: string): ShellCommand {
  if (isWindows()) {
    return { command: "explorer", args: ["/select,", filePath] }
  } else if (isMacOS()) {
    return { command: "open", args: ["-R", filePath] }
  } else {
    // Linux: try multiple file managers
    return { command: "xdg-open", args: [require("path").dirname(filePath)] }
  }
}

/**
 * Gets the default shell for the current platform
 */
export function getDefaultShell(): string {
  if (isWindows()) {
    return process.env.COMSPEC || "cmd.exe"
  }
  return process.env.SHELL || "/bin/sh"
}

/**
 * Gets shell-specific arguments for running a command
 */
export function getShellArgs(command: string): ShellCommand {
  if (isWindows()) {
    return { command: "cmd.exe", args: ["/c", command] }
  }
  return { command: "/bin/sh", args: ["-c", command] }
}

/**
 * Escapes a string for safe use in shell commands
 */
export function escapeShellArg(arg: string): string {
  if (isWindows()) {
    // Windows cmd.exe escaping
    return `"${arg.replace(/"/g, '""')}"`
  }
  // POSIX shell escaping
  return `'${arg.replace(/'/g, "'\\''")}'`
}
```

```typescript
// libs/platform/src/os/env-utils.ts
import { isWindows } from "./platform-info"

/**
 * Gets an environment variable with a fallback
 */
export function getEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback
}

/**
 * Gets an environment variable, throwing if not set
 */
export function requireEnv(key: string): string {
  const value = process.env[key]
  if (value === undefined) {
    throw new Error(`Required environment variable "${key}" is not set`)
  }
  return value
}

/**
 * Parses a boolean environment variable
 */
export function getBoolEnv(key: string, fallback = false): boolean {
  const value = process.env[key]
  if (value === undefined) return fallback
  return ["true", "1", "yes", "on"].includes(value.toLowerCase())
}

/**
 * Parses a numeric environment variable
 */
export function getNumericEnv(key: string, fallback: number): number {
  const value = process.env[key]
  if (value === undefined) return fallback
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? fallback : parsed
}

/**
 * Expands environment variables in a string
 * Supports both $VAR and ${VAR} syntax, plus %VAR% on Windows
 */
export function expandEnvVars(input: string): string {
  let result = input

  // Expand ${VAR} syntax
  result = result.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || "")

  // Expand $VAR syntax (not followed by another word char)
  result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])/g, (_, name) => process.env[name] || "")

  // Expand %VAR% syntax (Windows)
  if (isWindows()) {
    result = result.replace(/%([^%]+)%/g, (_, name) => process.env[name] || "")
  }

  return result
}

/**
 * Gets the PATH environment variable as an array
 */
export function getPathEntries(): string[] {
  const pathVar = process.env.PATH || process.env.Path || ""
  const separator = isWindows() ? ";" : ":"
  return pathVar.split(separator).filter(Boolean)
}

/**
 * Checks if a command is available in PATH
 */
export function isCommandInPath(command: string): boolean {
  const pathEntries = getPathEntries()
  const extensions = isWindows() ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""]
  const path = require("path")
  const fs = require("fs")

  for (const dir of pathEntries) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext)
      try {
        fs.accessSync(fullPath, fs.constants.X_OK)
        return true
      } catch {
        // Continue searching
      }
    }
  }

  return false
}
```

```typescript
// libs/platform/src/fs/safe-fs.ts
import fs from "fs"
import path from "path"

/**
 * Safely reads a file, following symlinks but preventing escape from base directory
 */
export async function safeReadFile(
  filePath: string,
  basePath: string,
  encoding: BufferEncoding = "utf8"
): Promise<string> {
  const resolvedPath = path.resolve(filePath)
  const resolvedBase = path.resolve(basePath)

  // Resolve symlinks
  const realPath = await fs.promises.realpath(resolvedPath)
  const realBase = await fs.promises.realpath(resolvedBase)

  // Ensure resolved path is within base
  if (!realPath.startsWith(realBase + path.sep) && realPath !== realBase) {
    throw new Error(`Path "${filePath}" resolves outside of allowed directory`)
  }

  return fs.promises.readFile(realPath, encoding)
}

/**
 * Safely writes a file, preventing writes outside base directory
 */
export async function safeWriteFile(
  filePath: string,
  basePath: string,
  content: string
): Promise<void> {
  const resolvedPath = path.resolve(filePath)
  const resolvedBase = path.resolve(basePath)

  // Ensure path is within base before any symlink resolution
  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new Error(`Path "${filePath}" is outside of allowed directory`)
  }

  // Check parent directory exists and is within base
  const parentDir = path.dirname(resolvedPath)

  try {
    const realParent = await fs.promises.realpath(parentDir)
    const realBase = await fs.promises.realpath(resolvedBase)

    if (!realParent.startsWith(realBase + path.sep) && realParent !== realBase) {
      throw new Error(`Parent directory resolves outside of allowed directory`)
    }
  } catch (error) {
    // Parent doesn't exist, that's OK - we'll create it
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }

  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true })
  await fs.promises.writeFile(resolvedPath, content, "utf8")
}

/**
 * Checks if a path exists and is accessible
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Gets file stats, returning null if file doesn't exist
 */
export async function safeStat(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(filePath)
  } catch {
    return null
  }
}

/**
 * Recursively removes a directory
 */
export async function removeDirectory(dirPath: string): Promise<void> {
  await fs.promises.rm(dirPath, { recursive: true, force: true })
}

/**
 * Copies a file or directory
 */
export async function copy(src: string, dest: string): Promise<void> {
  const stats = await fs.promises.stat(src)

  if (stats.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true })
    const entries = await fs.promises.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
      await copy(
        path.join(src, entry.name),
        path.join(dest, entry.name)
      )
    }
  } else {
    await fs.promises.copyFile(src, dest)
  }
}
```

```typescript
// libs/platform/src/index.ts
// Main barrel export

// Path utilities
export * from "./paths/path-resolver"
export * from "./paths/path-constants"
export * from "./paths/path-validator"

// OS utilities
export * from "./os/platform-info"
export * from "./os/shell-commands"
export * from "./os/env-utils"

// File system utilities
export * from "./fs/safe-fs"
```

### @automaker/model-resolver

Model string resolution shared between frontend and backend.

```
libs/model-resolver/
├── src/
│   ├── model-map.ts           # CLAUDE_MODEL_MAP, DEFAULT_MODELS
│   ├── resolver.ts            # resolveModelString, getEffectiveModel
│   └── index.ts
├── package.json
└── tsconfig.json
```

### @automaker/ipc-types

IPC channel type definitions for type-safe Electron communication.

```
libs/ipc-types/
├── src/
│   ├── schema.ts              # IPCSchema interface
│   ├── channels.ts            # Channel constant enums
│   ├── helpers.ts             # Type helper functions
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## Type-Safe Electron Implementation

### IPC Schema Definition

```typescript
// electron/ipc/ipc-schema.ts
import type { OpenDialogOptions, SaveDialogOptions } from "electron"

// Dialog result types
export interface DialogResult<T = unknown> {
  canceled: boolean
  filePaths?: string[]
  filePath?: string
  data?: T
}

// App path names (from Electron)
export type AppPathName =
  | "home" | "appData" | "userData" | "sessionData"
  | "temp" | "exe" | "module" | "desktop"
  | "documents" | "downloads" | "music"
  | "pictures" | "videos" | "recent" | "logs" | "crashDumps"

// Complete IPC Schema with request/response types
export interface IPCSchema {
  // Dialog operations
  "dialog:openDirectory": {
    request: Partial<OpenDialogOptions>
    response: DialogResult<string[]>
  }
  "dialog:openFile": {
    request: Partial<OpenDialogOptions>
    response: DialogResult<string[]>
  }
  "dialog:saveFile": {
    request: Partial<SaveDialogOptions>
    response: DialogResult<string>
  }

  // Shell operations
  "shell:openExternal": {
    request: { url: string }
    response: { success: boolean; error?: string }
  }
  "shell:openPath": {
    request: { path: string }
    response: { success: boolean; error?: string }
  }

  // App info
  "app:getPath": {
    request: { name: AppPathName }
    response: string
  }
  "app:getVersion": {
    request: void
    response: string
  }
  "app:isPackaged": {
    request: void
    response: boolean
  }

  // Server management
  "server:getUrl": {
    request: void
    response: string
  }

  // Connection test
  "ping": {
    request: void
    response: "pong"
  }

  // Debug console
  "debug:log": {
    request: {
      level: DebugLogLevel
      category: DebugCategory
      message: string
      args: unknown[]
    }
    response: void
  }
}

export type DebugLogLevel = "info" | "warn" | "error" | "debug" | "success"
export type DebugCategory =
  | "general" | "ipc" | "route" | "network"
  | "perf" | "state" | "lifecycle" | "updater"

// Type extractors
export type IPCChannel = keyof IPCSchema
export type IPCRequest<T extends IPCChannel> = IPCSchema[T]["request"]
export type IPCResponse<T extends IPCChannel> = IPCSchema[T]["response"]
```

### Modular IPC Organization

```typescript
// electron/ipc/dialog/dialog-channels.ts
export const DIALOG_CHANNELS = {
  OPEN_DIRECTORY: "dialog:openDirectory",
  OPEN_FILE: "dialog:openFile",
  SAVE_FILE: "dialog:saveFile",
} as const

// electron/ipc/dialog/dialog-context.ts
import { contextBridge, ipcRenderer } from "electron"
import { DIALOG_CHANNELS } from "./dialog-channels"
import type { IPCRequest, IPCResponse } from "../ipc-schema"

export function exposeDialogContext(): void {
  contextBridge.exposeInMainWorld("dialogAPI", {
    openDirectory: (options?: IPCRequest<"dialog:openDirectory">) =>
      ipcRenderer.invoke(DIALOG_CHANNELS.OPEN_DIRECTORY, options),

    openFile: (options?: IPCRequest<"dialog:openFile">) =>
      ipcRenderer.invoke(DIALOG_CHANNELS.OPEN_FILE, options),

    saveFile: (options?: IPCRequest<"dialog:saveFile">) =>
      ipcRenderer.invoke(DIALOG_CHANNELS.SAVE_FILE, options),
  })
}

// electron/ipc/dialog/dialog-listeners.ts
import { ipcMain, dialog, BrowserWindow } from "electron"
import { DIALOG_CHANNELS } from "./dialog-channels"
import type { IPCRequest, IPCResponse } from "../ipc-schema"
import { debugLog } from "../../helpers/debug-mode"

export function addDialogEventListeners(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    DIALOG_CHANNELS.OPEN_DIRECTORY,
    async (_, options: IPCRequest<"dialog:openDirectory"> = {}) => {
      debugLog.ipc(`OPEN_DIRECTORY called with options: ${JSON.stringify(options)}`)

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory", "createDirectory"],
        ...options,
      })

      debugLog.ipc(`OPEN_DIRECTORY result: canceled=${result.canceled}, paths=${result.filePaths.length}`)

      return {
        canceled: result.canceled,
        filePaths: result.filePaths,
      } satisfies IPCResponse<"dialog:openDirectory">
    }
  )

  ipcMain.handle(
    DIALOG_CHANNELS.OPEN_FILE,
    async (_, options: IPCRequest<"dialog:openFile"> = {}) => {
      debugLog.ipc(`OPEN_FILE called`)

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        ...options,
      })

      return {
        canceled: result.canceled,
        filePaths: result.filePaths,
      } satisfies IPCResponse<"dialog:openFile">
    }
  )

  ipcMain.handle(
    DIALOG_CHANNELS.SAVE_FILE,
    async (_, options: IPCRequest<"dialog:saveFile"> = {}) => {
      debugLog.ipc(`SAVE_FILE called`)

      const result = await dialog.showSaveDialog(mainWindow, options)

      return {
        canceled: result.canceled,
        filePath: result.filePath,
      } satisfies IPCResponse<"dialog:saveFile">
    }
  )
}
```

---

## Components Refactoring

### Priority Matrix

| Priority | View | Lines | Action Required |
|----------|------|-------|-----------------|
| 🔴 P0 | spec-view | 1,230 | Create subfolder with components/, dialogs/, hooks/ |
| 🔴 P0 | analysis-view | 1,134 | Create subfolder with components/, dialogs/, hooks/ |
| 🔴 P0 | agent-view | 916 | Create subfolder, extract message list, input, sidebar |
| 🟡 P1 | welcome-view | 815 | Create subfolder, extract sections |
| 🟡 P1 | context-view | 735 | Create subfolder, extract components |
| 🟡 P1 | terminal-view | 697 | Expand existing subfolder |
| 🟡 P1 | interview-view | 637 | Create subfolder |
| 🟢 P2 | settings-view | 178 | Move dialogs from components/ to dialogs/ |
| ✅ Done | board-view | 685 | Already properly structured |
| ✅ Done | setup-view | 144 | Already properly structured |
| ✅ Done | profiles-view | 300 | Already properly structured |

### Immediate Dialog Reorganization

```bash
# Settings-view: Move dialogs to proper location
mv settings-view/components/keyboard-map-dialog.tsx → settings-view/dialogs/
mv settings-view/components/delete-project-dialog.tsx → settings-view/dialogs/

# Root components: Organize global dialogs
mv components/dialogs/board-background-modal.tsx → board-view/dialogs/

# Agent-related dialogs: Move to agent-view
mv components/delete-session-dialog.tsx → agent-view/dialogs/
mv components/delete-all-archived-sessions-dialog.tsx → agent-view/dialogs/
```

---

## Web + Electron Dual Support

### Platform Detection

```typescript
// src/lib/platform.ts
export const isElectron = typeof window !== "undefined" &&
  "electronAPI" in window

export const platform = {
  isElectron,
  isWeb: !isElectron,
  isMac: isElectron ? window.electronAPI.platform === "darwin" : false,
  isWindows: isElectron ? window.electronAPI.platform === "win32" : false,
  isLinux: isElectron ? window.electronAPI.platform === "linux" : false,
}
```

### API Abstraction Layer

```typescript
// src/lib/api/file-picker.ts
import { platform } from "../platform"

export interface FilePickerResult {
  canceled: boolean
  paths: string[]
}

export async function pickDirectory(): Promise<FilePickerResult> {
  if (platform.isElectron) {
    const result = await window.dialogAPI.openDirectory()
    return { canceled: result.canceled, paths: result.filePaths || [] }
  }

  // Web fallback using File System Access API
  try {
    const handle = await window.showDirectoryPicker()
    return { canceled: false, paths: [handle.name] }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { canceled: true, paths: [] }
    }
    throw error
  }
}

export async function pickFile(options?: {
  accept?: Record<string, string[]>
}): Promise<FilePickerResult> {
  if (platform.isElectron) {
    const result = await window.dialogAPI.openFile({
      filters: options?.accept
        ? Object.entries(options.accept).map(([name, extensions]) => ({ name, extensions }))
        : undefined
    })
    return { canceled: result.canceled, paths: result.filePaths || [] }
  }

  // Web fallback
  try {
    const [handle] = await window.showOpenFilePicker({
      types: options?.accept
        ? Object.entries(options.accept).map(([description, accept]) => ({ description, accept: { "application/*": accept } }))
        : undefined
    })
    return { canceled: false, paths: [handle.name] }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { canceled: true, paths: [] }
    }
    throw error
  }
}
```

---

## Migration Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Set up new build infrastructure without breaking existing functionality.

- [ ] Create `vite.config.mts` with electron plugins
- [ ] Create `electron/tsconfig.json` for Electron TypeScript
- [ ] Convert `electron/main.js` → `electron/main.ts`
- [ ] Convert `electron/preload.js` → `electron/preload.ts`
- [ ] Implement IPC schema and type-safe handlers
- [ ] Set up TanStack Router configuration
- [ ] Port debug console from starter template
- [ ] Create `index.html` for Vite entry

**Deliverables**:
- Working Vite dev server
- Type-safe Electron main process
- Debug console functional

### Phase 2: Core Migration (Week 3-4)

**Goal**: Replace Next.js with Vite while maintaining feature parity.

- [ ] Create `src/renderer.ts` entry point
- [ ] Create `src/App.tsx` root component
- [ ] Set up TanStack Router with file-based routes
- [ ] Port all views to route files
- [ ] Update environment variables (`NEXT_PUBLIC_*` → `VITE_*`)
- [ ] Verify Zustand stores work unchanged
- [ ] Verify HTTP API client works unchanged
- [ ] Test both Electron and Web builds

**Deliverables**:
- All views accessible via TanStack Router
- Both Electron and web builds functional
- No regression in existing functionality

### Phase 3: Component Refactoring (Week 5-7)

**Goal**: Refactor large view files to follow folder-pattern.md.

- [ ] Refactor `spec-view.tsx` (1,230 lines)
- [ ] Refactor `analysis-view.tsx` (1,134 lines)
- [ ] Refactor `agent-view.tsx` (916 lines)
- [ ] Refactor `welcome-view.tsx` (815 lines)
- [ ] Refactor `context-view.tsx` (735 lines)
- [ ] Refactor `terminal-view.tsx` (697 lines)
- [ ] Refactor `interview-view.tsx` (637 lines)
- [ ] Reorganize `settings-view` dialogs

**Deliverables**:
- All views under 500 lines
- Consistent folder structure across all views
- Barrel exports for all component folders

### Phase 4: Package Extraction (Week 8)

**Goal**: Create shared packages for better modularity.

- [ ] Create `libs/types/` package
- [ ] Create `libs/utils/` package
- [ ] Create `libs/platform/` package
- [ ] Create `libs/model-resolver/` package
- [ ] Create `libs/ipc-types/` package
- [ ] Update imports across apps

**Deliverables**:
- 5 new shared packages
- No code duplication between apps
- Clean dependency graph

### Phase 5: Polish & Testing (Week 9-10)

**Goal**: Ensure production readiness.

- [ ] Write E2E tests with Playwright
- [ ] Performance benchmarking
- [ ] Bundle size optimization
- [ ] Documentation updates
- [ ] CI/CD pipeline updates
- [ ] Remove Next.js dependencies

**Deliverables**:
- Comprehensive test coverage
- Performance metrics documentation
- Updated CI/CD configuration
- Clean package.json (no Next.js)

---

## Expected Benefits

### Developer Experience

| Aspect | Before | After |
|--------|--------|-------|
| Dev server startup | 8-15 seconds | 1-3 seconds |
| Hot Module Replacement | 500ms-2s | 50-100ms |
| TypeScript in Electron | Not supported | Full support |
| Debug tooling | Limited | Full debug console |
| Build times | 45-90 seconds | 15-30 seconds |

### Code Quality

| Aspect | Before | After |
|--------|--------|-------|
| Electron type safety | 0% | 100% |
| Component organization | Inconsistent | Standardized |
| Code sharing | None | 5 shared packages |
| Path handling | Ad-hoc | Centralized utilities |

### Bundle Size

| Aspect | Before | After |
|--------|--------|-------|
| Next.js runtime | ~200KB | 0KB |
| Framework overhead | High | Minimal |
| Tree shaking | Limited | Full |

---

## Risk Mitigation

### Rollback Strategy

1. **Branch-based development**: All work on feature branch
2. **Parallel running**: Keep Next.js functional until migration complete
3. **Feature flags**: Toggle between old/new implementations
4. **Comprehensive testing**: E2E tests before/after comparison

### Known Challenges

| Challenge | Mitigation |
|-----------|------------|
| Route migration | TanStack Router has similar file-based routing |
| Environment variables | Simple search/replace (`NEXT_PUBLIC_` → `VITE_`) |
| Build configuration | Reference electron-starter-template |
| SSR considerations | N/A - we don't use SSR |

### Testing Strategy

1. **Unit tests**: Vitest for component/utility testing
2. **Integration tests**: Test IPC communication
3. **E2E tests**: Playwright for full application testing
4. **Manual testing**: QA checklist for each view

---

## Appendix: Vite Configuration Reference

```typescript
// vite.config.mts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import electron from "vite-plugin-electron"
import renderer from "vite-plugin-electron-renderer"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    tailwindcss(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart: ({ reload }) => reload(),
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@electron": path.resolve(__dirname, "electron"),
    },
  },
  build: {
    outDir: "dist",
  },
})
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2025 | Team | Initial migration plan |

---

**Next Steps**:
1. Review and approve this plan
2. Wait for `feature/worktrees` branch merge
3. Create `feature/vite-migration` branch
4. Begin Phase 1 implementation
