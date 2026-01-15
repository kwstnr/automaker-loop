import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { GitMerge, GitBranch, Trash2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { AutoPullSettings } from '@automaker/types';

const CARD_TITLE = 'Automatic Pull After Merge';
const CARD_SUBTITLE = 'Configure automatic git pull and worktree cleanup after PRs are merged.';

interface AutoPullSectionProps {
  autoPull: AutoPullSettings;
  onAutoPullChange: (settings: Partial<AutoPullSettings>) => Promise<void>;
}

export function AutoPullSection({ autoPull, onAutoPullChange }: AutoPullSectionProps) {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center border border-green-500/20">
            <GitMerge className="w-5 h-5 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">{CARD_TITLE}</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">{CARD_SUBTITLE}</p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-5">
        {/* Enable Auto Pull Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Switch
            id="auto-pull-enabled"
            checked={autoPull.enabled}
            onCheckedChange={(checked) => onAutoPullChange({ enabled: checked })}
            className="mt-0.5"
            data-testid="auto-pull-enabled-switch"
          />
          <div className="space-y-1.5 flex-1">
            <Label
              htmlFor="auto-pull-enabled"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitMerge className="w-4 h-4 text-green-500" />
              Enable Automatic Pull
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, the main branch will be automatically pulled after a PR is merged. This
              keeps your local repository in sync with the latest changes.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Auto Cleanup Worktrees Toggle */}
        <div
          className={cn(
            'group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3',
            !autoPull.enabled && 'opacity-50 pointer-events-none'
          )}
        >
          <Switch
            id="auto-pull-cleanup-worktrees"
            checked={autoPull.autoCleanupWorktrees}
            onCheckedChange={(checked) => onAutoPullChange({ autoCleanupWorktrees: checked })}
            disabled={!autoPull.enabled}
            className="mt-0.5"
            data-testid="auto-pull-cleanup-worktrees-switch"
          />
          <div className="space-y-1.5 flex-1">
            <Label
              htmlFor="auto-pull-cleanup-worktrees"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-green-500" />
              Auto-Cleanup Worktrees
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Automatically remove worktrees after their associated PRs are merged. This helps free
              up disk space by cleaning up feature worktrees that are no longer needed.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Target Branch Input */}
        <div
          className={cn(
            'group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3',
            !autoPull.enabled && 'opacity-50 pointer-events-none'
          )}
        >
          <div className="w-9 h-9 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-green-500/10">
            <GitBranch className="w-5 h-5 text-green-500" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-pull-target-branch" className="text-foreground font-medium">
                Target Branch
              </Label>
            </div>
            <Input
              id="auto-pull-target-branch"
              type="text"
              placeholder="main"
              value={autoPull.targetBranch ?? ''}
              onChange={(e) =>
                onAutoPullChange({
                  targetBranch: e.target.value || 'main',
                })
              }
              disabled={!autoPull.enabled}
              className="h-9 text-sm"
              data-testid="auto-pull-target-branch-input"
            />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              The branch to pull after a PR is merged. This should match the base branch used for
              your PRs (usually{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">main</code> or{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">master</code>).
            </p>
          </div>
        </div>

        {/* Help Info */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/20 border border-border/30">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Auto Pull works with the PR Merge Monitor to detect when PRs are merged. When a merge is
            detected, it will automatically pull the target branch and optionally clean up the
            associated worktree.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Connected version that uses the app store directly
 */
export function AutoPullSectionConnected() {
  const autoPull = useAppStore((s) => s.autoPull);
  const setAutoPull = useAppStore((s) => s.setAutoPull);

  return <AutoPullSection autoPull={autoPull} onAutoPullChange={setAutoPull} />;
}
