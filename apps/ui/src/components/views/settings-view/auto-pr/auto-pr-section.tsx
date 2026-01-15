import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { GitPullRequest, FileText, GitBranch, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { AutoPRSettings } from '@automaker/types';

const CARD_TITLE = 'Automatic Pull Requests';
const CARD_SUBTITLE =
  'Configure automatic Pull Request creation when features are completed.';

interface AutoPRSectionProps {
  autoPR: AutoPRSettings;
  onAutoPRChange: (settings: Partial<AutoPRSettings>) => Promise<void>;
}

export function AutoPRSection({ autoPR, onAutoPRChange }: AutoPRSectionProps) {
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
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <GitPullRequest className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {CARD_TITLE}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">{CARD_SUBTITLE}</p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-5">
        {/* Enable Auto PR Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Switch
            id="auto-pr-enabled"
            checked={autoPR.enabled}
            onCheckedChange={(checked) => onAutoPRChange({ enabled: checked })}
            className="mt-0.5"
            data-testid="auto-pr-enabled-switch"
          />
          <div className="space-y-1.5 flex-1">
            <Label
              htmlFor="auto-pr-enabled"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitPullRequest className="w-4 h-4 text-brand-500" />
              Enable Automatic PR Creation
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, a Pull Request will be automatically created when an agent
              successfully completes a feature. The PR will target the configured base
              branch with changes from the feature branch.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Create as Draft Toggle */}
        <div
          className={cn(
            'group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3',
            !autoPR.enabled && 'opacity-50 pointer-events-none'
          )}
        >
          <Switch
            id="auto-pr-draft"
            checked={autoPR.createAsDraft}
            onCheckedChange={(checked) =>
              onAutoPRChange({ createAsDraft: checked })
            }
            disabled={!autoPR.enabled}
            className="mt-0.5"
            data-testid="auto-pr-draft-switch"
          />
          <div className="space-y-1.5 flex-1">
            <Label
              htmlFor="auto-pr-draft"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-brand-500" />
              Create as Draft
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Create Pull Requests as drafts instead of ready for review. This allows
              you to review and make additional changes before marking them as ready.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Base Branch Input */}
        <div
          className={cn(
            'group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3',
            !autoPR.enabled && 'opacity-50 pointer-events-none'
          )}
        >
          <div className="w-9 h-9 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
            <GitBranch className="w-5 h-5 text-brand-500" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="auto-pr-base-branch"
                className="text-foreground font-medium"
              >
                Base Branch Override
              </Label>
            </div>
            <Input
              id="auto-pr-base-branch"
              type="text"
              placeholder="main"
              value={autoPR.baseBranch ?? ''}
              onChange={(e) =>
                onAutoPRChange({
                  baseBranch: e.target.value || undefined,
                })
              }
              disabled={!autoPR.enabled}
              className="h-9 text-sm"
              data-testid="auto-pr-base-branch-input"
            />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              The target branch for Pull Requests. Leave empty to use the repository's
              default branch (usually <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">main</code> or <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">master</code>).
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* PR Title Template Input */}
        <div
          className={cn(
            'group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3',
            !autoPR.enabled && 'opacity-50 pointer-events-none'
          )}
        >
          <div className="w-9 h-9 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
            <FileText className="w-5 h-5 text-brand-500" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="auto-pr-title-template"
                className="text-foreground font-medium"
              >
                PR Title Template
              </Label>
            </div>
            <Input
              id="auto-pr-title-template"
              type="text"
              placeholder="{{featureName}}"
              value={autoPR.prTitleTemplate ?? ''}
              onChange={(e) =>
                onAutoPRChange({
                  prTitleTemplate: e.target.value || undefined,
                })
              }
              disabled={!autoPR.enabled}
              className="h-9 text-sm"
              data-testid="auto-pr-title-template-input"
            />
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Customize the PR title format. Supports placeholders:{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">{'{{featureName}}'}</code>,{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">{'{{featureId}}'}</code>.
              Leave empty to use the feature name as the title.
            </p>
          </div>
        </div>

        {/* Help Info */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/20 border border-border/30">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Auto PR requires GitHub CLI (<code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">gh</code>)
            to be installed and authenticated. The feature branch must be pushed to
            the remote repository before a PR can be created.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Connected version that uses the app store directly
 */
export function AutoPRSectionConnected() {
  const autoPR = useAppStore((s) => s.autoPR);
  const setAutoPR = useAppStore((s) => s.setAutoPR);

  return <AutoPRSection autoPR={autoPR} onAutoPRChange={setAutoPR} />;
}
