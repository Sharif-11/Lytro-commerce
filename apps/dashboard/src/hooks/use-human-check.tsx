import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appConfig } from '@/lib/app-config';
import {
  type HumanCheckAction,
  type HumanCheckTokens,
  HumanCheckWidget,
  NO_HUMAN_CHECK,
  TurnstileScript,
} from '@/lib/turnstile';

const script = typeof document === 'undefined' ? null : new TurnstileScript();

/**
 * SUP-08, SMS-11, AUTH-09 as amended 2026-11-20: the Turnstile widget for a form that texts a code. `box` goes in the
 * form and `tokens` to the request's hook, which takes one token per request. The box is out of the form's flow, so the
 * screen is as drawn, until Cloudflare wants a tap; then it shows in place. Rendered when the form mounts, so the token
 * is usually ready by the time the phone is typed; a request sent sooner waits for it. Without a site key in the build,
 * there is no box and no token.
 */
export function useHumanCheck(
  action: HumanCheckAction,
  siteKey: string | null = appConfig.turnstileSiteKey,
): {
  box: ReactNode;
  tokens: HumanCheckTokens;
} {
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef<Promise<HumanCheckTokens>>(Promise.resolve(NO_HUMAN_CHECK));
  const [tapWanted, setTapWanted] = useState(false);

  useEffect(() => {
    if (siteKey === null || script === null) {
      ready.current = Promise.resolve(NO_HUMAN_CHECK);
      return;
    }
    let gone = false;
    let made: HumanCheckWidget | null = null;
    ready.current = script
      .load()
      .then((api): HumanCheckTokens => {
        if (gone || container.current === null) return NO_HUMAN_CHECK;
        made = new HumanCheckWidget(api, container.current, {
          siteKey,
          action,
          onTap: (wanted) => {
            if (!gone) setTapWanted(wanted);
          },
        });
        return made;
      })
      // Blocked or offline: requests go without a token, and the server says to reload if it wanted one.
      .catch(() => NO_HUMAN_CHECK);
    return () => {
      gone = true;
      made?.remove();
    };
  }, [siteKey, action]);

  const tokens = useMemo<HumanCheckTokens>(
    () => ({
      next: async () => (await ready.current).next(),
      spent: () => {
        void ready.current.then((widget) => {
          widget.spent();
        });
      },
    }),
    [],
  );

  return {
    box:
      siteKey === null ? null : (
        <div
          ref={container}
          data-testid="human-check"
          className={tapWanted ? undefined : 'absolute'}
        />
      ),
    tokens,
  };
}
