import { useEffect, useMemo, useState } from 'react';

import { getAdminPanelApi } from '../../services/admin-panel-service-context';
import { loadActivityFeed } from './service';

export function useActivityPageModel() {
  const api = getAdminPanelApi();
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadActivityFeed>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: api context is static
  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);

      try {
        const next = await loadActivityFeed(api, { limit: 20 });
        if (active) {
          setEvents(next);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'Failed to load activity feed.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () => ({
      events,
      error,
      loading,
    }),
    [error, events, loading],
  );
}
