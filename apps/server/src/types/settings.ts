/**
 * Settings Types - Re-exported from @automaker/types
 *
 * This file now re-exports settings types from the shared @automaker/types package
 * to maintain backward compatibility with existing imports in the server codebase.
 */

export type {
  ThemeMode,
  KanbanCardDetailLevel,
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  KeyboardShortcuts,
  AIProfile,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  AutoPRSettings,
  AutoPullSettings,
  ReviewLoopConfig,
  QualityGateThresholds,
} from '@automaker/types';

export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_AUTO_PR_SETTINGS,
  DEFAULT_AUTO_PULL_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  DEFAULT_REVIEW_LOOP_CONFIG,
  DEFAULT_QUALITY_GATE_THRESHOLDS,
} from '@automaker/types';
