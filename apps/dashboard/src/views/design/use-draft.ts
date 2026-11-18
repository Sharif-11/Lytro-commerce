import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import type { StorefrontDesign } from '@lytronix/validators';
import { useSaveDraft } from '@/api/storefront-design';
import type { StorefrontEditor } from '@/types/storefront-design';

/** The design as the editor shows it, each change saved to the server's draft in turn, the preview reloaded after. */
export interface DraftDesign {
  design: StorefrontDesign;
  /** Shows a change at once and saves it to the draft; a change made while one saves goes after it. */
  change: (next: StorefrontDesign) => void;
  /** Bumps once each save lands, so the preview draws the draft again. */
  saved: number;
  saving: boolean;
  error: Error | null;
  /** Asked when leaving while a save is on its way: stay, or leave anyway. */
  leaving: { stay: () => void; leave: () => void } | null;
}

/**
 * STOREFRONT-BUILDER-PLAN SB-12: the draft lives on the server, so a phone and a desktop see one draft. Each change is
 * saved whole, one save at a time and the newest last; one that is refused puts the screen back to the last saved draft.
 * Leaving the page or closing the tab while a save is on its way asks first.
 */
export function useDraftDesign(editor: StorefrontEditor): DraftDesign {
  const save = useSaveDraft();
  const send = save.mutate;
  const [design, setDesign] = useState(editor.design);
  const [saved, setSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  const queue = useRef<{ busy: boolean; next: StorefrontDesign | null }>({
    busy: false,
    next: null,
  });
  const last = useRef(editor.design);

  // Publish, Back and Discard answer with a new editor: the screen follows it unless a change is still being saved.
  useEffect(() => {
    last.current = editor.design;
    if (!queue.current.busy) setDesign(editor.design);
  }, [editor.design]);

  const write = useCallback(
    (next: StorefrontDesign) => {
      queue.current.busy = true;
      setSaving(true);
      send(next, {
        onError: () => {
          queue.current.next = null;
          setDesign(last.current);
        },
        onSettled: () => {
          const waiting = queue.current.next;
          queue.current.next = null;
          if (waiting) {
            write(waiting);
            return;
          }
          queue.current.busy = false;
          setSaving(false);
          setSaved((count) => count + 1);
        },
      });
    },
    [send],
  );

  const change = useCallback(
    (next: StorefrontDesign) => {
      setDesign(next);
      if (queue.current.busy) queue.current.next = next;
      else write(next);
    },
    [write],
  );

  const blocker = useBlocker({
    shouldBlockFn: () => queue.current.busy,
    enableBeforeUnload: () => queue.current.busy,
    withResolver: true,
  });
  const leaving =
    blocker.status === 'blocked'
      ? {
          stay: () => {
            blocker.reset();
          },
          leave: () => {
            blocker.proceed();
          },
        }
      : null;

  return { design, change, saved, saving, error: save.error, leaving };
}
