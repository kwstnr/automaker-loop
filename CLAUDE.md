# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automaker is an autonomous AI development studio that orchestrates AI agents to build software. Users describe features on a Kanban board, and AI agents powered by Claude Code automatically implement them.

## Architecture

This is a monorepo with npm workspaces containing two main applications:

### Apps Structure
- **`apps/app`** - Next.js 16 + Electron desktop application (frontend)
  - React 19 with Zustand for state management
  - Radix UI components with Tailwind CSS 4
  - dnd-kit for drag-and-drop Kanban board
  - xterm.js for integrated terminal
  - Playwright for E2E testing

- **`apps/server`** - Express.js backend server (TypeScript, ES modules)
  - Uses `@anthropic-ai/claude-agent-sdk` for AI agent orchestration
  - WebSocket support for real-time events and terminal communication
  - node-pty for terminal sessions
  - Vitest for testing

### Communication
- Frontend communicates with backend via HTTP API (port 3008) and WebSocket
- In Electron mode, the backend server is spawned as a child process
- In web mode, both run independently

### Key Server Services (`apps/server/src/services/`)
- `AgentService` - Manages Claude agent sessions and conversations
- `AutoModeService` - Orchestrates concurrent feature implementation
- `FeatureLoader` - Persists feature/task data to `.automaker/` directory
- `TerminalService` - Manages PTY terminal sessions

### Key Frontend State (`apps/app/src/store/`)
- `app-store.ts` - Main Zustand store with persisted state (projects, features, settings, themes)
- Features flow: backlog → in_progress → waiting_approval → verified → completed

## Development Commands

```bash
# Install dependencies
npm install

# Development (prompts for mode selection)
npm run dev

# Specific development modes
npm run dev:electron       # Desktop app with Electron
npm run dev:web            # Web browser mode (frontend + backend)
npm run dev:server         # Backend server only

# Testing
npm run test               # E2E tests (Playwright, headless)
npm run test:headed        # E2E tests with browser visible
npm run test:server        # Server unit tests (Vitest)
npm run test:server:coverage  # Server tests with coverage

# Linting
npm run lint               # ESLint on frontend

# Building
npm run build              # Build Next.js app
npm run build:electron     # Build Electron distributable
```

### Running a Single Test
```bash
# Frontend E2E (from apps/app)
npx playwright test tests/specific-test.spec.ts

# Server unit tests (from apps/server)
npx vitest run tests/unit/specific.test.ts
npx vitest watch tests/unit/specific.test.ts  # Watch mode
```

## Code Conventions

- Never use `any` for type declarations - create proper interfaces or use existing types
- Server uses ES modules (`"type": "module"`) - use `.js` extensions in imports
- Frontend components in `src/components/`, organized by feature in `views/`
- UI primitives in `src/components/ui/` following shadcn/ui patterns

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for Claude agent functionality
- `PORT` - Backend server port (default: 3008)
- `AUTOMAKER_MOCK_AGENT=true` - Enable mock agent for testing without API calls

## Project Data Storage

Features and project state are stored in `.automaker/` directory within each project:
- `features.json` - Kanban features/tasks
- `context/` - Context files for AI agents
- Background images and other project-specific data
