"use client";

import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  key: string;
  action: () => void;
  description?: string;
}

/**
 * Check if the currently focused element is an input, textarea, or contenteditable element
 * or if an autocomplete/typeahead dropdown is open
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  // Check if it's a form input element
  const tagName = activeElement.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  // Check if it's a contenteditable element
  if (activeElement.getAttribute("contenteditable") === "true") {
    return true;
  }

  // Check if it has a role of textbox or searchbox
  const role = activeElement.getAttribute("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") {
    return true;
  }

  // Check for autocomplete/typeahead dropdowns being open
  const autocompleteList = document.querySelector(
    '[data-testid="category-autocomplete-list"]'
  );
  if (autocompleteList) {
    return true;
  }

  // Check for any open dialogs
  const dialog = document.querySelector('[role="dialog"][data-state="open"]');
  if (dialog) {
    return true;
  }

  // Check for project picker dropdown being open
  const projectPickerDropdown = document.querySelector(
    '[data-testid="project-picker-dropdown"]'
  );
  if (projectPickerDropdown) {
    return true;
  }

  return false;
}

/**
 * Hook to manage keyboard shortcuts
 * Shortcuts won't fire when user is typing in inputs, textareas, or when dialogs are open
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (isInputFocused()) {
        return;
      }

      // Don't trigger if any modifier keys are pressed (except for specific combos we want)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Find matching shortcut
      const matchingShortcut = shortcuts.find(
        (shortcut) => shortcut.key.toLowerCase() === event.key.toLowerCase()
      );

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Shortcut definitions for navigation
 */
export const NAV_SHORTCUTS: Record<string, string> = {
  board: "K", // K for Kanban
  agent: "A", // A for Agent
  spec: "D", // D for Document (Spec)
  context: "C", // C for Context
  tools: "T", // T for Tools
  settings: "S", // S for Settings
};

/**
 * Shortcut definitions for UI controls
 */
export const UI_SHORTCUTS: Record<string, string> = {
  toggleSidebar: "`", // Backtick to toggle sidebar
};

/**
 * Shortcut definitions for add buttons
 */
export const ACTION_SHORTCUTS: Record<string, string> = {
  addFeature: "N", // N for New feature
  addContextFile: "F", // F for File (add context file)
  startNext: "G", // G for Grab (start next features from backlog)
  newSession: "N", // N for New session (in agent view)
  openProject: "O", // O for Open project (navigate to welcome view)
  projectPicker: "P", // P for Project picker
  cyclePrevProject: "Q", // Q for previous project (cycle back through MRU)
  cycleNextProject: "E", // E for next project (cycle forward through MRU)
};
