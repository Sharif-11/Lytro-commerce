import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TUTORIAL_CONTENT_TYPE,
  type OperatorTutorialView,
  type OperatorTutorialsView,
  type TutorialKey,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';

// OPERATOR-CONSOLE-DESIGN §10h: the tutorial videos in every seller's app -- each part's file, uploaded, replaced or
// removed, and the optional YouTube playlist link.

export const TUTORIALS_QUERY_KEY = ['operator', 'tutorials'] as const;

export function useOperatorTutorials() {
  return useQuery({
    queryKey: TUTORIALS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<OperatorTutorialsView>('/operator/tutorials'),
  });
}

interface UploadStarted {
  uploadKey: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

/** Where an upload is: sending the file (with how much has gone), or the server checking it and making it live. */
export type UploadStage = { step: 'sending'; share: number } | { step: 'checking' };

/** Sends the file to the signed link, telling how much has gone. */
function send(
  upload: UploadStarted['upload'],
  file: File,
  onShare: (share: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onShare(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`the video was not sent (${String(request.status)})`));
    };
    request.onerror = () => {
      reject(new Error('the video was not sent'));
    };
    request.send(file);
  });
}

/**
 * §10h: the part's new file -- a first upload or a replacement, which gets the next version's name. A signed link, the
 * file sent straight to storage, then the server checks it and makes it live at once.
 */
export function useUploadTutorial(key: TutorialKey, onStage: (stage: UploadStage) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const started = await operatorSession.client.post<UploadStarted>(
        `/operator/tutorials/${key}/uploads`,
        { contentType: TUTORIAL_CONTENT_TYPE, bytes: file.size },
      );
      onStage({ step: 'sending', share: 0 });
      await send(started.upload, file, (share) => {
        onStage({ step: 'sending', share });
      });
      onStage({ step: 'checking' });
      return operatorSession.client.put<OperatorTutorialView>(`/operator/tutorials/${key}`, {
        uploadKey: started.uploadKey,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TUTORIALS_QUERY_KEY });
    },
  });
}

/** §10h: the part leaves every shop's app; its file is deleted 7 days later. */
export function useRemoveTutorial(key: TutorialKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      operatorSession.client.delete<OperatorTutorialView>(`/operator/tutorials/${key}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TUTORIALS_QUERY_KEY });
    },
  });
}

/** §10h: the playlist link Menu › Tutorials ends with; empty takes the line away. */
export function useSavePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playlistUrl: string | null) =>
      operatorSession.client.put<{ playlistUrl: string | null }>('/operator/tutorials/playlist', {
        playlistUrl,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TUTORIALS_QUERY_KEY });
    },
  });
}
