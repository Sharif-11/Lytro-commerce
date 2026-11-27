import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle } from '@/components/ui/console-page';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { chatFabChoice, chatSound, type ChatSoundChoice } from '@/lib/chat-live';
import { useOperatorPush } from '@/lib/operator-push';

const SOUNDS: readonly ChatSoundChoice[] = ['chime', 'soft', 'none'];

/** One setting: its name and words on the left, its control on the right (below them on a phone). */
function Line({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 first:border-t-0">
      <span className="flex min-w-0 flex-[1_1_260px] flex-col">
        <b className="text-[14px] font-semibold">{title}</b>
        <span className="text-[13px] text-fg-muted">{hint}</span>
      </span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</span>
    </div>
  );
}

/**
 * LIVE-CHAT-PLAN LC-4 (the sketch's `oc-notif`): this operator's chat alerts on this browser -- the floating button on
 * every page, its sound (PR 1: every new message from a shop), and pushes while the console is closed.
 */
export function MyNotifications(): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const push = useOperatorPush();
  const [fab, setFab] = useState(chatFabChoice.shown());
  const [sound, setSound] = useState<ChatSoundChoice>(chatSound.choice());
  const [pushBusy, setPushBusy] = useState(false);

  const pushHint =
    push.state === 'blocked'
      ? t('myNotifications.pushBlocked')
      : push.state === 'unsupported'
        ? t('myNotifications.pushUnsupported')
        : push.state === 'unset'
          ? t('myNotifications.pushUnset')
          : t('myNotifications.pushHint');

  return (
    <ConsolePage>
      <PageTitle title={t('myNotifications.title')} lead={t('myNotifications.lead')} />
      <ConsoleCard className="p-0!">
        <Line title={t('myNotifications.fab')} hint={t('myNotifications.fabHint')}>
          <Switch
            checked={fab}
            label={t('myNotifications.fab')}
            onChange={(next) => {
              chatFabChoice.set(next);
              setFab(next);
            }}
          />
        </Line>
        <Line title={t('myNotifications.sound')} hint={t('myNotifications.soundHint')}>
          <select
            aria-label={t('myNotifications.sound')}
            value={sound}
            onChange={(event) => {
              const next = event.target.value as ChatSoundChoice;
              chatSound.choose(next);
              setSound(next);
            }}
            className="h-10 min-w-[220px] rounded-control border border-line-strong bg-surface px-3 text-[14px]"
          >
            {SOUNDS.map((each) => (
              <option key={each} value={each}>
                {t(`myNotifications.sounds.${each}`)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            tone="outline"
            small
            fit
            disabled={sound === 'none'}
            onClick={() => {
              chatSound.play(sound);
            }}
          >
            <ConsoleIcon name="play" size={16} />
            {t('myNotifications.play')}
          </Button>
        </Line>
        <Line title={t('myNotifications.push')} hint={pushHint}>
          <Switch
            checked={push.state === 'on'}
            label={t('myNotifications.push')}
            disabled={
              push.state === 'loading' ||
              push.state === 'unsupported' ||
              push.state === 'unset' ||
              push.state === 'blocked'
            }
            busy={pushBusy}
            onChange={(next) => {
              setPushBusy(true);
              (next ? push.turnOn().then(() => undefined) : push.turnOff())
                .catch((error: unknown) => {
                  toast(errorMessage(error, t));
                })
                .finally(() => {
                  setPushBusy(false);
                });
            }}
          />
        </Line>
      </ConsoleCard>
    </ConsolePage>
  );
}
