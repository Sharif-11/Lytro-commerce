import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useDomain } from '@/api/domain';
import { useShopSettings, useUpdateShopSettings } from '@/api/shop-settings';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { RowChevron, RowLead, RowList, rowClass, RowText } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useShopAddress } from '@/hooks/use-shop-address';
import { useToast } from '@/hooks/use-toast';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { DomainView } from '@/types/domain';

/**
 * Storefront (TENANT-DASHBOARD-DESIGN §7.29, the prototype's Part 25: `sf25`, `sh-sf25-off`, `sf25-off` and their
 * toasts): the shop's link with Copy, Share and Open, and the switch (SFT-16). Off, the link answers "Nothing here" while
 * every landing page keeps working; turning it off asks first, turning it on is at once. Under it, the shop's own domain
 * (Part 28, Slice 13): once active, the link is the domain, the shop's main address.
 */
export function StorefrontView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const errorText = useErrorText();
  const { slug } = useShell();
  const settings = useShopSettings();
  const update = useUpdateShopSettings();
  const domain = useDomain();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const { host, url } = useShopAddress();
  const line = domain.data ? domainLine(domain.data) : null;
  const canShare = typeof navigator.share === 'function';
  const on = settings.data?.storefrontEnabled ?? true;

  function turn(next: boolean): void {
    update.mutate(
      { storefrontEnabled: next },
      {
        onSuccess: () => {
          setAsking(false);
          toast.show(t(next ? 'sfOned' : 'sfOffed'));
        },
      },
    );
  }

  return (
    <ShellPage>
      {settings.isError ? <Banner tone="bad">{errorText(settings.error)}</Banner> : null}
      {update.isError ? <Banner tone="bad">{errorText(update.error)}</Banner> : null}
      <div className="flex max-w-[640px] flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[17px] font-semibold">{t('sfLink')}</h3>
            {settings.data && !on ? <StatusTag tone="neutral">{t('sfOffTag')}</StatusTag> : null}
          </div>
          <p className="rounded-[8px] border border-line bg-neutral-50 px-3 py-2.5 font-mono text-[13px] break-all">
            {host}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  toast.show(t('sfCopied'));
                });
              }}
            >
              <Icon name="copy" />
              {shell('copy')}
            </Button>
            {canShare ? (
              <Button
                tone="outline"
                size="sm"
                onClick={() => {
                  void navigator.share({ url }).catch(() => undefined);
                }}
              >
                <Icon name="share" />
                {t('sfShare')}
              </Button>
            ) : null}
            <a className={buttonClass('outline', 'sm')} href={url} target="_blank" rel="noopener">
              <Icon name="external" />
              {t('sfOpen')}
            </a>
          </div>
          <p className="text-[14px] text-fg-muted">{t('sfLinkHint')}</p>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex min-h-10 items-center gap-3">
            <Switch
              checked={on}
              label={t('sfSwitch')}
              disabled={!settings.data || update.isPending}
              onChange={(next) => {
                if (next) turn(true);
                else setAsking(true);
              }}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-medium">{t('sfSwitch')}</span>
              <span className="text-[14px] text-fg-muted">
                {t(on ? 'sfSwitchOn' : 'sfSwitchOff')}
              </span>
            </span>
          </div>
          <p className="text-[14px] text-fg-muted">{t('sfOffNote')}</p>
        </Card>
        <Card flush>
          <RowList>
            <Link
              to="/$shop/settings/storefront/domain"
              params={{ shop: slug }}
              className={rowClass}
            >
              <RowLead>
                <Icon name="external" />
              </RowLead>
              <RowText
                title={shell('sDomain')}
                sub={line ? t(line.word, { domain: line.domain }) : ' '}
              />
              <RowChevron />
            </Link>
          </RowList>
        </Card>
      </div>
      <Dialog
        open={asking}
        title={t('sfOffTitle')}
        onClose={() => {
          setAsking(false);
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              tone="danger"
              disabled={update.isPending}
              onClick={() => {
                turn(false);
              }}
            >
              {t('sfTurnOff')}
            </Button>
          </>
        }
      >
        {t('sfOffCons', { address: host })}
      </Dialog>
      <Toast message={toast.message} />
    </ShellPage>
  );
}

// The domain line's second line for each state of the domain.
const DOMAIN_LINE = {
  pending: 'dmRowWait',
  active: 'dmRowActive',
  failed: 'dmRowFailed',
  off: 'dmRowOff',
} as const;

/** The domain line's second line: none yet, or the domain with its state. */
function domainLine(view: DomainView): { word: string; domain: string } {
  const current = view.domain;
  if (current === null) return { word: 'dmRowNone', domain: '' };
  return { word: DOMAIN_LINE[current.state], domain: current.hostname };
}
