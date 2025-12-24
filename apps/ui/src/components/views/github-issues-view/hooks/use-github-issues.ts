import { useState, useEffect, useCallback } from 'react';
import { getElectronAPI, GitHubIssue } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';

export function useGithubIssues() {
  const { currentProject } = useAppStore();
  const [openIssues, setOpenIssues] = useState<GitHubIssue[]>([]);
  const [closedIssues, setClosedIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    if (!currentProject?.path) {
      setError('No project selected');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.listIssues(currentProject.path);
        if (result.success) {
          setOpenIssues(result.openIssues || []);
          setClosedIssues(result.closedIssues || []);
        } else {
          setError(result.error || 'Failed to fetch issues');
        }
      }
    } catch (err) {
      console.error('[GitHubIssuesView] Error fetching issues:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentProject?.path]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchIssues();
  }, [fetchIssues]);

  return {
    openIssues,
    closedIssues,
    loading,
    refreshing,
    error,
    refresh,
  };
}
