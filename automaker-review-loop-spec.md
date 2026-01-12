# Automaker Review Loop Extension - Implementation Spec

## Overview

This spec defines an extension to Automaker that adds an **AI Review Loop** capability. This allows features to be automatically self-reviewed before PR creation, and automatically refined based on PR feedback until ready for human approval.

## Architecture Summary

```
Feature Implementation → Self-Review → Quality Gates → PR Creation
                              ↑              ↓
                              └── Refinement Loop (max N iterations)
                                             ↓
                                   PR Feedback Monitoring
                                             ↓
                              Human Review → Merge
```

---

## Feature Cards

The following features should be implemented in order (dependencies noted).

---

### Feature 1: Review Loop Type Definitions

**Priority:** P0 (Foundation)
**Dependencies:** None
**Estimated Complexity:** Low

#### Description
Create TypeScript type definitions for the review loop system. These types will be used across all other features.

#### Requirements

Create `libs/types/src/review-loop.ts` with the following types:

```typescript
// Review verdict from self-review or PR feedback analysis
export type ReviewVerdict = 'pass' | 'needs_work' | 'critical_issues';

// A single issue identified during review
export interface ReviewIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'suggestion';
  category: 'security' | 'architecture' | 'logic' | 'style' | 'performance' | 'testing' | 'documentation';
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  description: string;
  suggestedFix?: string;
}

// Result of a self-review or PR feedback analysis
export interface ReviewResult {
  verdict: ReviewVerdict;
  issues: ReviewIssue[];
  summary: string;
  iteration: number;
  timestamp: string;
}

// Configuration for the review loop
export interface ReviewLoopConfig {
  enabled: boolean;
  maxIterations: number;  // Default: 3
  selfReviewBeforePR: boolean;  // Default: true
  autoAddressReviewComments: boolean;  // Default: true
  severityThreshold: ReviewIssue['severity'];  // Issues at or above this block PR
  notifyOnReady: boolean;  // Default: true
  notificationChannels: ('github' | 'slack' | 'email')[];
}

// Extended feature state for review loop
export type ReviewLoopState =
  | 'pending_self_review'
  | 'self_reviewing'
  | 'self_review_passed'
  | 'self_review_failed'
  | 'refining'
  | 'pr_created'
  | 'awaiting_pr_feedback'
  | 'addressing_feedback'
  | 'ready_for_human_review'
  | 'approved'
  | 'merged';

// Review loop session tracking
export interface ReviewLoopSession {
  featureId: string;
  state: ReviewLoopState;
  iterations: ReviewResult[];
  currentIteration: number;
  prNumber?: number;
  prUrl?: string;
  startedAt: string;
  lastUpdatedAt: string;
  completedAt?: string;
}

// Structured PR feedback from GitHub
export interface PRFeedback {
  prNumber: number;
  comments: PRComment[];
  reviews: PRReview[];
  checksStatus: 'pending' | 'passing' | 'failing';
  mergeable: boolean;
  requestedChanges: boolean;
}

export interface PRComment {
  id: number;
  author: string;
  body: string;
  file?: string;
  line?: number;
  createdAt: string;
  isBot: boolean;
}

export interface PRReview {
  id: number;
  author: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'pending';
  body?: string;
  comments: PRComment[];
  submittedAt: string;
}
```

Also export these types from `libs/types/src/index.ts`.

#### Acceptance Criteria
- [ ] All types defined in `libs/types/src/review-loop.ts`
- [ ] Types exported from `libs/types/src/index.ts`
- [ ] No TypeScript errors when imported in server code
- [ ] Types are well-documented with JSDoc comments

---

### Feature 2: Review Loop Prompts

**Priority:** P0 (Foundation)
**Dependencies:** None
**Estimated Complexity:** Low

#### Description
Create prompt templates for the self-review agent and the feedback-fixing agent. These prompts guide Claude's behavior during the review loop.

#### Requirements

Create `libs/prompts/src/review-loop/self-reviewer.md`:

```markdown
# Self-Review Agent

You are a senior code reviewer performing a thorough review of code changes before they become a pull request.

## Your Role
- Review the changes critically as if reviewing a colleague's code
- Identify issues that would typically be caught in code review
- Be thorough but fair - don't nitpick style if it's consistent with the codebase

## Review Categories
Evaluate changes against these criteria:

### Security
- Input validation and sanitization
- Authentication/authorization issues
- Secrets or credentials in code
- SQL injection, XSS, command injection risks

### Architecture
- Does this follow existing patterns in the codebase?
- Are there unnecessary abstractions or missing abstractions?
- Is the code in the right location?
- Are dependencies appropriate?

### Logic
- Edge cases handled?
- Error handling complete?
- Race conditions possible?
- Off-by-one errors?

### Performance
- N+1 queries?
- Unnecessary loops or recomputation?
- Memory leaks possible?
- Missing caching opportunities?

### Testing
- Are changes adequately tested?
- Are tests meaningful (not just coverage)?
- Edge cases tested?

### Documentation
- Are complex sections explained?
- Are public APIs documented?
- Are there misleading comments?

## Output Format
Respond with a JSON object:
```json
{
  "verdict": "pass" | "needs_work" | "critical_issues",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "suggestion",
      "category": "security" | "architecture" | "logic" | "style" | "performance" | "testing" | "documentation",
      "file": "path/to/file.ts",
      "lineStart": 42,
      "lineEnd": 45,
      "description": "Clear description of the issue",
      "suggestedFix": "How to fix it (optional)"
    }
  ],
  "summary": "Brief overall assessment"
}
```

## Verdict Guidelines
- **pass**: No issues, or only low/suggestion severity items
- **needs_work**: Has medium or high severity issues that should be fixed
- **critical_issues**: Has critical security or correctness issues that must be fixed
```

Create `libs/prompts/src/review-loop/feedback-fixer.md`:

```markdown
# Feedback Fixer Agent

You are addressing feedback from a code review. Your job is to implement fixes for the identified issues.

## Context
You will receive:
1. The original feature requirements
2. The current code state
3. Review feedback with specific issues to address

## Your Approach
1. Read each issue carefully
2. Understand the root cause, not just the symptom
3. Implement fixes that address the underlying problem
4. Ensure fixes don't introduce new issues
5. If an issue is a false positive, explain why in a comment

## Guidelines
- Fix issues in order of severity (critical first)
- Make minimal changes - don't refactor unrelated code
- If a fix requires architectural changes, note this for human review
- Test your fixes mentally - will this actually solve the problem?
- If you're unsure about a fix, err on the side of caution and flag for human review

## Output
After implementing fixes, provide a summary:
- Which issues were addressed and how
- Which issues couldn't be addressed automatically (and why)
- Any new concerns introduced by the fixes
```

Create `libs/prompts/src/review-loop/pr-feedback-analyzer.md`:

```markdown
# PR Feedback Analyzer

You analyze feedback from GitHub pull request reviews and comments to determine what actions need to be taken.

## Input
You will receive:
1. PR comments (general and inline)
2. Review verdicts (approved, changes requested, etc.)
3. CI/CD check results

## Your Task
Analyze all feedback and categorize it into actionable items.

## Classification Rules

### Actionable Feedback
- Specific code change requests
- Bug reports or logic errors
- Security concerns
- Performance suggestions with clear fixes

### Non-Actionable Feedback
- Questions (respond with comment, don't change code)
- Praise or acknowledgments
- Discussions about approach (flag for human decision)
- Requests that contradict requirements

## Output Format
```json
{
  "actionableIssues": [
    {
      "source": "comment" | "review" | "check",
      "sourceId": 12345,
      "author": "username",
      "severity": "critical" | "high" | "medium" | "low",
      "file": "path/to/file.ts",
      "line": 42,
      "description": "What needs to change",
      "suggestedAction": "How to address it"
    }
  ],
  "questionsToAnswer": [
    {
      "sourceId": 12346,
      "author": "username",
      "question": "The question asked",
      "suggestedResponse": "How to respond"
    }
  ],
  "requiresHumanDecision": [
    {
      "sourceId": 12347,
      "reason": "Why this needs human input"
    }
  ],
  "overallStatus": "ready_to_fix" | "needs_human_input" | "blocked"
}
```
```

Also create `libs/prompts/src/review-loop/index.ts` to export prompt loaders.

#### Acceptance Criteria
- [ ] `self-reviewer.md` created with comprehensive review criteria
- [ ] `feedback-fixer.md` created with fix implementation guidance
- [ ] `pr-feedback-analyzer.md` created with classification rules
- [ ] `index.ts` exports functions to load each prompt
- [ ] Prompts follow existing prompt patterns in the codebase

---

### Feature 3: Review Loop Settings

**Priority:** P0 (Foundation)
**Dependencies:** Feature 1
**Estimated Complexity:** Low

#### Description
Add review loop configuration to the settings system, allowing users to enable/disable and configure the review loop behavior.

#### Requirements

1. Extend `apps/server/src/services/settings-service.ts` to include review loop settings:
   - Add `reviewLoop: ReviewLoopConfig` to the settings state
   - Default values:
     ```typescript
     reviewLoop: {
       enabled: true,
       maxIterations: 3,
       selfReviewBeforePR: true,
       autoAddressReviewComments: true,
       severityThreshold: 'medium',
       notifyOnReady: true,
       notificationChannels: ['github']
     }
     ```

2. Add settings persistence (save/load with other settings)

3. Create settings validation to ensure config is valid

#### Acceptance Criteria
- [ ] Review loop settings added to settings service
- [ ] Settings persist across server restarts
- [ ] Default values are sensible
- [ ] Invalid configurations are rejected with clear errors

---

### Feature 4: Self-Review Service

**Priority:** P1 (Core)
**Dependencies:** Features 1, 2, 3
**Estimated Complexity:** Medium

#### Description
Create a service that performs self-review of code changes using Claude before PR creation.

#### Requirements

Create `apps/server/src/services/self-review-service.ts`:

1. **Input:** Feature ID, worktree path
2. **Process:**
   - Get git diff of changes in worktree
   - Load self-reviewer prompt
   - Send to Claude with context about the feature requirements
   - Parse JSON response into `ReviewResult`
3. **Output:** `ReviewResult` object

Key functions:
```typescript
export class SelfReviewService {
  // Perform a self-review of changes
  async reviewChanges(featureId: string, worktreePath: string): Promise<ReviewResult>;

  // Check if review passes based on config
  evaluateVerdict(result: ReviewResult, config: ReviewLoopConfig): boolean;

  // Get review history for a feature
  getReviewHistory(featureId: string): ReviewResult[];
}
```

Integration points:
- Use existing `ClaudeProvider` for Claude API calls
- Use existing git utilities for diff generation
- Store review results in feature's `.automaker/` directory

#### Acceptance Criteria
- [ ] Service can perform self-review on any worktree
- [ ] Returns properly structured `ReviewResult`
- [ ] Handles Claude API errors gracefully
- [ ] Review results are persisted to disk
- [ ] Works with existing provider architecture

---

### Feature 5: Refinement Service

**Priority:** P1 (Core)
**Dependencies:** Features 1, 2, 4
**Estimated Complexity:** Medium

#### Description
Create a service that takes review feedback and automatically refines the code to address issues.

#### Requirements

Create `apps/server/src/services/refinement-service.ts`:

1. **Input:** Feature ID, `ReviewResult` with issues to fix
2. **Process:**
   - Load feedback-fixer prompt
   - Provide issues and current code state to Claude
   - Execute Claude's fixes (using existing agent execution)
   - Track which issues were addressed
3. **Output:** Updated code + list of addressed/unaddressed issues

Key functions:
```typescript
export class RefinementService {
  // Refine code based on review feedback
  async refineCode(
    featureId: string,
    reviewResult: ReviewResult
  ): Promise<RefinementResult>;

  // Check if refinement addressed all blocking issues
  evaluateRefinement(
    original: ReviewResult,
    addressed: string[]
  ): boolean;
}

interface RefinementResult {
  addressedIssueIds: string[];
  unaddressedIssueIds: string[];
  newIssuesIntroduced: ReviewIssue[];
  notes: string;
}
```

#### Acceptance Criteria
- [ ] Service can refine code based on `ReviewResult`
- [ ] Uses existing agent execution infrastructure
- [ ] Tracks which issues were/weren't addressed
- [ ] Doesn't get stuck in infinite loops (respects max iterations)
- [ ] Handles partial fixes gracefully

---

### Feature 6: PR Feedback Monitor

**Priority:** P1 (Core)
**Dependencies:** Features 1, 2
**Estimated Complexity:** Medium

#### Description
Create a service that monitors PRs for new feedback and analyzes it for actionability.

#### Requirements

Create `apps/server/src/services/pr-feedback-monitor.ts`:

1. **Polling approach** (can be enhanced to webhooks later):
   - Check PR for new comments/reviews every N seconds
   - Compare with last known state to detect new feedback

2. **Analysis:**
   - Load pr-feedback-analyzer prompt
   - Send new feedback to Claude for analysis
   - Return structured actionable items

Key functions:
```typescript
export class PRFeedbackMonitor {
  // Start monitoring a PR
  startMonitoring(featureId: string, prNumber: number): void;

  // Stop monitoring a PR
  stopMonitoring(featureId: string): void;

  // Get current feedback state
  getFeedback(prNumber: number): Promise<PRFeedback>;

  // Analyze feedback for actionability
  analyzeFeedback(feedback: PRFeedback): Promise<AnalyzedFeedback>;

  // Event emitter for new feedback
  on(event: 'new-feedback', handler: (analysis: AnalyzedFeedback) => void): void;
}
```

Use existing:
- `apps/server/src/routes/worktree/routes/pr-info.ts` for reading PR data
- GitHub CLI (`gh`) for API calls

#### Acceptance Criteria
- [ ] Can poll PR for new comments/reviews
- [ ] Detects new feedback since last check
- [ ] Analyzes feedback using Claude
- [ ] Emits events when actionable feedback found
- [ ] Handles rate limiting gracefully

---

### Feature 7: Review Loop Orchestrator

**Priority:** P1 (Core)
**Dependencies:** Features 4, 5, 6
**Estimated Complexity:** High

#### Description
Create the main orchestrator that ties together self-review, refinement, and PR monitoring into a cohesive loop.

#### Requirements

Create `apps/server/src/services/review-loop-orchestrator.ts`:

This is the "brain" of the review loop. It manages state transitions and coordinates the other services.

```typescript
export class ReviewLoopOrchestrator {
  // Start the review loop for a feature after implementation
  async startLoop(featureId: string): Promise<void>;

  // Handle state transitions
  private async transitionState(
    session: ReviewLoopSession,
    newState: ReviewLoopState
  ): Promise<void>;

  // Main loop logic
  private async executeLoop(session: ReviewLoopSession): Promise<void>;

  // Get current session state
  getSession(featureId: string): ReviewLoopSession | null;

  // Manually trigger refinement (for human override)
  async triggerRefinement(featureId: string): Promise<void>;

  // Skip to PR creation (bypass self-review)
  async skipToPR(featureId: string): Promise<void>;

  // Mark as ready for human review
  async markReadyForHuman(featureId: string): Promise<void>;
}
```

State machine:
```
pending_self_review
       │
       ▼
  self_reviewing ──────────────────┐
       │                           │
       ▼                           │
self_review_passed              self_review_failed
       │                           │
       │                           ▼
       │                      refining ──┐
       │                           │     │
       │                           │     │ (iteration < max)
       │                           ▼     │
       │                   ┌───────┴─────┘
       │                   │
       ▼                   ▼
   pr_created ◄────────────┘
       │
       ▼
awaiting_pr_feedback
       │
       ▼ (new feedback)
addressing_feedback
       │
       ▼
ready_for_human_review
       │
       ▼ (human approves)
   approved
       │
       ▼
    merged
```

#### Acceptance Criteria
- [ ] Correctly manages state transitions
- [ ] Respects max iteration limits
- [ ] Handles errors at each stage gracefully
- [ ] Emits events for UI updates (via WebSocket)
- [ ] Session state persists across server restarts
- [ ] Can be manually overridden at any stage

---

### Feature 8: Review Loop API Routes

**Priority:** P1 (Core)
**Dependencies:** Feature 7
**Estimated Complexity:** Medium

#### Description
Create API routes for the review loop, following existing route patterns.

#### Requirements

Create `apps/server/src/routes/review-loop/` directory structure:

```
review-loop/
├── index.ts              # Route registration
├── common.ts             # Shared utilities
└── routes/
    ├── start.ts          # POST /api/review-loop/:featureId/start
    ├── status.ts         # GET /api/review-loop/:featureId/status
    ├── history.ts        # GET /api/review-loop/:featureId/history
    ├── skip-review.ts    # POST /api/review-loop/:featureId/skip
    ├── retry.ts          # POST /api/review-loop/:featureId/retry
    ├── trigger-refine.ts # POST /api/review-loop/:featureId/refine
    └── mark-ready.ts     # POST /api/review-loop/:featureId/ready
```

API Endpoints:
1. `POST /api/review-loop/:featureId/start` - Start review loop
2. `GET /api/review-loop/:featureId/status` - Get current state
3. `GET /api/review-loop/:featureId/history` - Get all review iterations
4. `POST /api/review-loop/:featureId/skip` - Skip to PR creation
5. `POST /api/review-loop/:featureId/retry` - Retry current stage
6. `POST /api/review-loop/:featureId/refine` - Manually trigger refinement
7. `POST /api/review-loop/:featureId/ready` - Mark ready for human

Register routes in main router following existing patterns.

#### Acceptance Criteria
- [ ] All routes created and registered
- [ ] Routes follow existing patterns (error handling, validation)
- [ ] WebSocket events emitted for real-time updates
- [ ] Routes properly documented
- [ ] Input validation on all endpoints

---

### Feature 9: Review Loop WebSocket Events

**Priority:** P2 (Integration)
**Dependencies:** Feature 7
**Estimated Complexity:** Low

#### Description
Add WebSocket events for real-time review loop updates to the frontend.

#### Requirements

Add new events to the WebSocket system:

```typescript
// Events emitted by ReviewLoopOrchestrator
interface ReviewLoopEvents {
  'review-loop:state-changed': {
    featureId: string;
    previousState: ReviewLoopState;
    newState: ReviewLoopState;
    session: ReviewLoopSession;
  };

  'review-loop:review-completed': {
    featureId: string;
    result: ReviewResult;
  };

  'review-loop:refinement-completed': {
    featureId: string;
    result: RefinementResult;
  };

  'review-loop:pr-feedback-received': {
    featureId: string;
    feedback: AnalyzedFeedback;
  };

  'review-loop:ready-for-human': {
    featureId: string;
    prUrl: string;
    summary: string;
  };

  'review-loop:error': {
    featureId: string;
    error: string;
    stage: ReviewLoopState;
  };
}
```

#### Acceptance Criteria
- [ ] All events properly typed
- [ ] Events emitted at correct points in orchestrator
- [ ] Events include sufficient data for UI updates
- [ ] Error events include actionable information

---

### Feature 10: Review Loop UI - Status Panel

**Priority:** P2 (Integration)
**Dependencies:** Features 8, 9
**Estimated Complexity:** Medium

#### Description
Add a UI panel showing review loop status for a feature.

#### Requirements

Create `apps/ui/src/components/review-loop/ReviewLoopPanel.tsx`:

1. **Status Display:**
   - Current state with visual indicator
   - Progress through review loop stages
   - Current iteration number (e.g., "Iteration 2/3")

2. **Review Results:**
   - List of issues found (grouped by severity)
   - Which issues were addressed
   - Expandable details for each issue

3. **Actions:**
   - "Skip Review" button (bypass to PR)
   - "Retry" button (re-run current stage)
   - "Mark Ready" button (manual override)

4. **History:**
   - Collapsible list of past iterations
   - Diff of what changed each iteration

Use existing UI patterns:
- Zustand for state management
- TanStack Query for API calls
- Existing component library

#### Acceptance Criteria
- [ ] Panel shows current review loop state
- [ ] Issues displayed with proper severity styling
- [ ] Actions work and update state in real-time
- [ ] History is viewable and useful
- [ ] Follows existing UI patterns and styling

---

### Feature 11: Integration with Feature Workflow

**Priority:** P2 (Integration)
**Dependencies:** Features 7, 10
**Estimated Complexity:** Medium

#### Description
Integrate the review loop into the existing feature workflow so it automatically triggers after implementation.

#### Requirements

1. **Modify feature completion flow:**
   - When a feature's agent completes, check if review loop is enabled
   - If enabled, transition to `pending_self_review` instead of `completed`
   - Start the review loop orchestrator

2. **Modify PR creation flow:**
   - PR creation should go through review loop first (if enabled)
   - Existing "Create PR" button should respect review loop state

3. **Add review loop state to feature card:**
   - Show review loop badge on Kanban card
   - Color-code based on state (reviewing, fixing, ready, etc.)

4. **Keyboard shortcuts:**
   - Add shortcut to skip review (for quick iterations during development)
   - Add shortcut to view review panel

#### Acceptance Criteria
- [ ] Review loop automatically starts after feature implementation
- [ ] Feature cards show review loop state
- [ ] PR creation respects review loop
- [ ] Can be bypassed when needed
- [ ] Doesn't break existing non-review-loop workflows

---

### Feature 12: Notification System

**Priority:** P3 (Enhancement)
**Dependencies:** Feature 7
**Estimated Complexity:** Low

#### Description
Add notifications when features are ready for human review.

#### Requirements

Create `apps/server/src/services/notification-service.ts`:

1. **GitHub Notification:**
   - Add comment to PR: "This PR has been automatically refined and is ready for human review"
   - Request review from configured reviewers
   - Add "ready-for-review" label

2. **Slack Notification (optional):**
   - Post to configured channel
   - Include PR link and summary of changes
   - Tag configured users

3. **Configuration:**
   - Notification channels in settings
   - Slack webhook URL (if using Slack)
   - Default reviewers list

#### Acceptance Criteria
- [ ] GitHub notification works (PR comment + review request)
- [ ] Slack notification works (if configured)
- [ ] Notifications include useful summary
- [ ] Can be disabled per-feature or globally

---

### Feature 13: Review Loop Analytics

**Priority:** P3 (Enhancement)
**Dependencies:** Feature 7
**Estimated Complexity:** Low

#### Description
Track metrics about the review loop to help users understand its effectiveness.

#### Requirements

Track and display:
- Average iterations before PR creation
- Most common issue categories
- Time saved (estimated based on issues auto-fixed)
- Pass rate on first review
- Issues caught by category over time

Store in `.automaker/analytics/review-loop.json` per project.

Add simple analytics panel to settings or dashboard.

#### Acceptance Criteria
- [ ] Key metrics tracked
- [ ] Analytics viewable in UI
- [ ] Data persists across sessions
- [ ] Doesn't significantly impact performance

---

## Implementation Order

**Phase 1 - Foundation (Do First):**
1. Feature 1: Type Definitions
2. Feature 2: Prompts
3. Feature 3: Settings

**Phase 2 - Core Services:**
4. Feature 4: Self-Review Service
5. Feature 5: Refinement Service
6. Feature 6: PR Feedback Monitor
7. Feature 7: Review Loop Orchestrator

**Phase 3 - API & Integration:**
8. Feature 8: API Routes
9. Feature 9: WebSocket Events
10. Feature 10: UI Panel
11. Feature 11: Workflow Integration

**Phase 4 - Enhancements:**
12. Feature 12: Notifications
13. Feature 13: Analytics

---

## Testing Strategy

### Unit Tests
- Type validation
- Service methods in isolation
- State machine transitions

### Integration Tests
- Full review loop cycle (mock Claude responses)
- API route testing
- WebSocket event verification

### E2E Tests
- Create feature → implement → review loop → PR
- Manual override flows
- Error recovery scenarios

---

## Notes for Automaker Agents

When implementing these features:

1. **Follow existing patterns** - Look at how similar functionality is implemented elsewhere in the codebase
2. **Use existing utilities** - The codebase has utilities for git, file I/O, API calls - use them
3. **Emit events** - The UI depends on WebSocket events for updates
4. **Error handling** - Always handle errors gracefully and emit error events
5. **Type safety** - Use the types from Feature 1 consistently
6. **Persistence** - Store state in `.automaker/` directories following existing patterns

---

## Success Criteria

The review loop is complete when:
1. A feature can be implemented and automatically self-reviewed
2. Issues found are automatically refined (up to max iterations)
3. PRs are created only after review passes (or max iterations)
4. PR feedback triggers additional refinement
5. Humans are notified when PRs are ready for final review
6. The entire flow is visible in the UI
7. The feature can be disabled if not wanted
