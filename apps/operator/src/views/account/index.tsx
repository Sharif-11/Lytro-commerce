import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useOperatorMe, useOperatorSignOut } from '@/api/operator-auth';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle } from '@/components/ui/console-page';
import { LoadFailed } from '@/components/ui/load-failed';
import { browserOf } from '@/lib/user-agent';
import { formatSessionTime } from '@/lib/session-time';
import { useOtherLanguage } from '@/lib/use-other-language';
import { CodesPanel } from './codes-panel';

const CARD_TITLE = 'mb-1 text-[16px] font-semibold';
const HINT = 'text-[13px] text-fg-muted';

/** The operator's own account (OPERATOR-CONSOLE-DESIGN §12): the backup codes and this session. */
export function Account(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useOperatorMe();
  const signOut = useOperatorSignOut();
  const language = useOtherLanguage();
  const [panelOpen, setPanelOpen] = useState(false);
  const browser = browserOf(me.data?.userAgent ?? null);
  const signedInAt = me.data ? formatSessionTime(me.data.signedInAt) : '';

  return (
    <ConsolePage>
      <PageTitle title={t('account.title')} lead={t('account.lead')} />
      {me.isError ? (
        <LoadFailed
          onRetry={() => {
            void me.refetch();
          }}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ConsoleCard>
          <h2 className={CARD_TITLE}>{t('account.codes')}</h2>
          {me.data ? (
            <div className={HINT}>
              {t('account.codesHint', { count: me.data.unusedBackupCodes })}
            </div>
          ) : (
            <span className="skel w-4/5" />
          )}
          <div className="mt-3">
            <Button
              type="button"
              tone="outline"
              small
              fit
              onClick={() => {
                setPanelOpen(true);
              }}
            >
              <ConsoleIcon name="refresh" size={18} />
              {t('account.regenerate')}
            </Button>
          </div>
        </ConsoleCard>
        <ConsoleCard>
          <h2 className={CARD_TITLE}>{t('account.session')}</h2>
          {me.data ? (
            <>
              <div className={HINT}>
                {browser
                  ? t('account.sessionLine', { date: signedInAt, browser })
                  : t('account.sessionLineOnly', { date: signedInAt })}
              </div>
              <div className={HINT}>{me.data.email}</div>
            </>
          ) : (
            <span className="skel w-3/5" />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              tone="outline"
              small
              fit
              disabled={signOut.isPending}
              onClick={() => {
                signOut.mutate();
              }}
            >
              <ConsoleIcon name="logout" size={18} />
              {t('common.signOut')}
            </Button>
            <Button
              type="button"
              tone="outline"
              small
              fit
              lang={language.lang}
              onClick={language.change}
            >
              <ConsoleIcon name="globe" size={18} />
              {language.label}
            </Button>
          </div>
        </ConsoleCard>
      </div>
      <div className="text-[13px] leading-[1.55] text-fg-muted">{t('account.breakGlass')}</div>
      <CodesPanel
        open={panelOpen}
        onClose={() => {
          setPanelOpen(false);
        }}
      />
    </ConsolePage>
  );
}
