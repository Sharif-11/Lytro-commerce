import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TutorialKey, TutorialScreen, TutorialsView } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import { HOME_QUERY_KEY } from './home';

// TENANT-DASHBOARD-DESIGN §7.49, §7.49a: the tutorial videos -- the series with each part's file and this person's watched
// marks, the screens they hid the videos on, and the playlist link. One read serves every screen's row, the player, Menu
// and Home; what the person does updates it at once.

export const TUTORIALS_QUERY_KEY = ['tutorials'] as const;

// A file Lytro uploads shows in the app within this long, or as soon as the page is opened again.
const FRESH_MS = 5 * 60_000;

export function useTutorials(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: TUTORIALS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<TutorialsView>('/tutorials'),
    enabled: options.enabled ?? true,
    staleTime: FRESH_MS,
  });
}

/** POST /tutorials/:key/watched: played to the end or past 90 percent; Home's head counts it too. */
export function useMarkTutorialWatched() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: TutorialKey) =>
      tenantSession.client.post<{ ok: true }>(`/tutorials/${key}/watched`),
    onMutate: (key) => {
      queryClient.setQueryData<TutorialsView>(TUTORIALS_QUERY_KEY, (view) =>
        view
          ? {
              ...view,
              parts: view.parts.map((part) =>
                part.key === key ? { ...part, watched: true } : part,
              ),
            }
          : view,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TUTORIALS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    },
  });
}

/** POST /tutorials/dismissals: "আর দেখাবেন না" on a screen (or Home's head), for this person on every device. */
export function useDismissTutorials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screen: TutorialScreen) =>
      tenantSession.client.post<{ ok: true }>('/tutorials/dismissals', { screen }),
    onMutate: (screen) => {
      queryClient.setQueryData<TutorialsView>(TUTORIALS_QUERY_KEY, (view) =>
        view && !view.dismissed.includes(screen)
          ? { ...view, dismissed: [...view.dismissed, screen] }
          : view,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TUTORIALS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    },
  });
}
