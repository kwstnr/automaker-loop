"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Lightbulb,
  Download,
  StopCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getElectronAPI, FeatureSuggestion, SuggestionsEvent } from "@/lib/electron";
import { useAppStore, Feature } from "@/store/app-store";
import { toast } from "sonner";

interface FeatureSuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  // Props to persist state across dialog open/close
  suggestions: FeatureSuggestion[];
  setSuggestions: (suggestions: FeatureSuggestion[]) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
}

export function FeatureSuggestionsDialog({
  open,
  onClose,
  projectPath,
  suggestions,
  setSuggestions,
  isGenerating,
  setIsGenerating,
}: FeatureSuggestionsDialogProps) {
  const [progress, setProgress] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const { features, setFeatures } = useAppStore();

  // Initialize selectedIds when suggestions change
  useEffect(() => {
    if (suggestions.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  }, [suggestions, selectedIds.size]);

  // Auto-scroll progress when new content arrives
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current && isGenerating) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [progress, isGenerating]);

  // Listen for suggestion events when dialog is open
  useEffect(() => {
    if (!open) return;

    const api = getElectronAPI();
    if (!api?.suggestions) return;

    const unsubscribe = api.suggestions.onEvent((event: SuggestionsEvent) => {
      if (event.type === "suggestions_progress") {
        setProgress((prev) => [...prev, event.content || ""]);
      } else if (event.type === "suggestions_tool") {
        const toolName = event.tool || "Unknown Tool";
        setProgress((prev) => [...prev, `Using tool: ${toolName}\n`]);
      } else if (event.type === "suggestions_complete") {
        setIsGenerating(false);
        if (event.suggestions && event.suggestions.length > 0) {
          setSuggestions(event.suggestions);
          // Select all by default
          setSelectedIds(new Set(event.suggestions.map((s) => s.id)));
          toast.success(`Generated ${event.suggestions.length} feature suggestions!`);
        } else {
          toast.info("No suggestions generated. Try again.");
        }
      } else if (event.type === "suggestions_error") {
        setIsGenerating(false);
        toast.error(`Error: ${event.error}`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, setSuggestions, setIsGenerating]);

  // Start generating suggestions
  const handleGenerate = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.suggestions) {
      toast.error("Suggestions API not available");
      return;
    }

    setIsGenerating(true);
    setProgress([]);
    setSuggestions([]);
    setSelectedIds(new Set());

    try {
      const result = await api.suggestions.generate(projectPath);
      if (!result.success) {
        toast.error(result.error || "Failed to start generation");
        setIsGenerating(false);
      }
    } catch (error) {
      console.error("Failed to generate suggestions:", error);
      toast.error("Failed to start generation");
      setIsGenerating(false);
    }
  }, [projectPath, setIsGenerating, setSuggestions]);

  // Stop generating
  const handleStop = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.suggestions) return;

    try {
      await api.suggestions.stop();
      setIsGenerating(false);
      toast.info("Generation stopped");
    } catch (error) {
      console.error("Failed to stop generation:", error);
    }
  }, [setIsGenerating]);

  // Toggle suggestion selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Toggle expand/collapse for a suggestion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  }, [selectedIds.size, suggestions]);

  // Import selected suggestions as features
  const handleImport = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.warning("No suggestions selected");
      return;
    }

    setIsImporting(true);

    try {
      const api = getElectronAPI();
      const selectedSuggestions = suggestions.filter((s) =>
        selectedIds.has(s.id)
      );

      // Create new features from selected suggestions
      const newFeatures: Feature[] = selectedSuggestions.map((s) => ({
        id: `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: s.category,
        description: s.description,
        steps: s.steps,
        status: "backlog" as const,
        skipTests: true, // As specified, testing mode true
      }));

      // Merge with existing features
      const updatedFeatures = [...features, ...newFeatures];

      // Save to file
      const featureListPath = `${projectPath}/.automaker/feature_list.json`;
      await api.writeFile(featureListPath, JSON.stringify(updatedFeatures, null, 2));

      // Update store
      setFeatures(updatedFeatures);

      toast.success(`Imported ${newFeatures.length} features to backlog!`);

      // Clear suggestions after importing
      setSuggestions([]);
      setSelectedIds(new Set());
      setProgress([]);

      onClose();
    } catch (error) {
      console.error("Failed to import features:", error);
      toast.error("Failed to import features");
    } finally {
      setIsImporting(false);
    }
  }, [selectedIds, suggestions, features, setFeatures, setSuggestions, projectPath, onClose]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Don't reset immediately - allow re-open to see results
      // Only reset if explicitly closed without importing
    }
  }, [open]);

  const hasStarted = progress.length > 0 || suggestions.length > 0;
  const hasSuggestions = suggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[70vw] max-w-[70vw] max-h-[85vh] flex flex-col"
        data-testid="feature-suggestions-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            Feature Suggestions
          </DialogTitle>
          <DialogDescription>
            Analyze your project to discover missing features and improvements.
            The AI will scan your codebase and suggest features ordered by priority.
          </DialogDescription>
        </DialogHeader>

        {!hasStarted ? (
          // Initial state - show explanation and generate button
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <Lightbulb className="w-16 h-16 text-yellow-500/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Discover Missing Features
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Our AI will analyze your project structure, code patterns, and
              existing features to generate a prioritized list of suggestions
              for new features you could add.
            </p>
            <Button onClick={handleGenerate} size="lg">
              <Lightbulb className="w-4 h-4 mr-2" />
              Generate Suggestions
            </Button>
          </div>
        ) : isGenerating ? (
          // Generating state - show progress
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing project...
              </div>
              <Button variant="destructive" size="sm" onClick={handleStop}>
                <StopCircle className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto bg-zinc-950 rounded-lg p-4 font-mono text-xs min-h-[200px] max-h-[400px]"
            >
              <div className="whitespace-pre-wrap break-words text-zinc-300">
                {progress.join("")}
              </div>
            </div>
          </div>
        ) : hasSuggestions ? (
          // Results state - show suggestions list
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {suggestions.length} suggestions generated
                </span>
                <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                  {selectedIds.size === suggestions.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[400px] pr-2"
            >
              {suggestions.map((suggestion) => {
                const isSelected = selectedIds.has(suggestion.id);
                const isExpanded = expandedIds.has(suggestion.id);

                return (
                  <div
                    key={suggestion.id}
                    className={`border rounded-lg p-3 transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    data-testid={`suggestion-${suggestion.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={suggestion.id}
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(suggestion.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => toggleExpanded(suggestion.id)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                            #{suggestion.priority}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            {suggestion.category}
                          </span>
                        </div>
                        <Label
                          htmlFor={suggestion.id}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {suggestion.description}
                        </Label>

                        {isExpanded && (
                          <div className="mt-3 space-y-2 text-sm">
                            {suggestion.reasoning && (
                              <p className="text-muted-foreground italic">
                                {suggestion.reasoning}
                              </p>
                            )}
                            {suggestion.steps.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Implementation Steps:
                                </p>
                                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                                  {suggestion.steps.map((step, i) => (
                                    <li key={i}>{step}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // No results state
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No suggestions were generated. Try running the analysis again.
            </p>
            <Button onClick={handleGenerate}>
              <Lightbulb className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          {hasSuggestions && (
            <div className="flex gap-2 w-full justify-between">
              <Button variant="outline" onClick={handleGenerate}>
                <Lightbulb className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedIds.size === 0 || isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Import {selectedIds.size} Feature
                  {selectedIds.size !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          )}
          {!hasSuggestions && !isGenerating && hasStarted && (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
