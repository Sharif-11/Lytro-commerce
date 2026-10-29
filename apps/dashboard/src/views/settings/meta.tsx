import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { useAdTracking, useCatalogFeed, useRegenerateFeed, useSaveAdTracking } from '@/api/meta';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Field } from '@/components/ui/field';
import { Eyebrow } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { formatDayMonthYear } from '@/lib/dates';
import { ShellPage } from '@/shell/shell-page';

const FEED_STEPS = ['fdS1', 'fdS2', 'fdS3', 'fdS4'] as const;

/**
 * Facebook and Meta (TENANT-DASHBOARD-DESIGN §7.27, the prototype's `meta`, `meta-empty` and `sh-feed-regenerate`):
 * the Meta Pixel ID (LND-15), the Conversions API token entered once and never shown again, with Replace and Remove
 * (LND-16, LND-17), and the catalog feed link with the steps in Commerce Manager and a new link on demand (FED-01,
 * FED-05). One Save for the pixel and a new token; Remove and a new link act at once.
 */
export function MetaView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const tracking = useAdTracking();
  const save = useSaveAdTracking();
  const feed = useCatalogFeed();
  const regenerate = useRegenerateFeed();
  const toast = useToast();
  const [pixel, setPixel] = useState('');
  const [token, setToken] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [askingFeed, setAskingFeed] = useState(false);

  useEffect(() => {
    if (tracking.data) setPixel(tracking.data.metaPixelId ?? '');
  }, [tracking.data]);

  const connected = tracking.data?.conversionsApiConnected ?? false;
  // Remove sends the token as null; Save sends the pixel and any new token.
  const removing = save.isPending && save.variables.conversionsApiToken === null;
  const savedPixel = tracking.data?.metaPixelId ?? null;
  const problems = save.error instanceof ApiClientError ? save.error.fieldProblems() : {};

  function saveAll(): void {
    const newToken = token.trim();
    save.mutate(
      {
        metaPixelId: pixel.trim() === '' ? null : pixel.trim(),
        ...(newToken === '' ? {} : { conversionsApiToken: newToken }),
      },
      {
        onSuccess: () => {
          setToken('');
          setReplacing(false);
          toast.show(t('saved'));
        },
      },
    );
  }

  return (
    <ShellPage>
      {save.isError && Object.keys(problems).length === 0 ? (
        <Banner tone="bad">{errorText(save.error)}</Banner>
      ) : null}
      {tracking.isError ? <Banner tone="bad">{errorText(tracking.error)}</Banner> : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[17px] font-semibold">{t('adPixel')}</h3>
              {savedPixel ? (
                <StatusTag tone="ok">{t('adConnected')}</StatusTag>
              ) : (
                <StatusTag tone="neutral">{t('adNot')}</StatusTag>
              )}
            </div>
            <Field
              label={t('adPixel')}
              name="metaPixelId"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('adPixelPh')}
              value={pixel}
              help={t('adPixelHelp')}
              error={problems['metaPixelId']}
              onChange={(event) => {
                setPixel(event.target.value.replace(/\D/g, ''));
              }}
            />
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="mb-1 text-[17px] font-semibold">{t('adCapi')}</h3>
            {connected && !replacing ? (
              <div className="flex min-h-16 items-center gap-3">
                <span className="flex size-10 flex-none items-center justify-center rounded-button bg-success-soft text-success">
                  <Icon name="lock" />
                </span>
                <span className="min-w-0 flex-1 overflow-hidden text-[15px] font-medium text-ellipsis whitespace-nowrap">
                  {t('adCapiSet')}
                </span>
                <Button
                  tone="outline"
                  size="xs"
                  onClick={() => {
                    setReplacing(true);
                  }}
                >
                  {t('adReplace')}
                </Button>
                <Button
                  tone="ghost"
                  size="xs"
                  busy={removing}
                  onClick={() => {
                    save.mutate(
                      { metaPixelId: savedPixel, conversionsApiToken: null },
                      {
                        onSuccess: () => {
                          toast.show(t('adRemoved'));
                        },
                      },
                    );
                  }}
                >
                  {t('adRemove')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Field
                  label={t('adCapi')}
                  name="conversionsApiToken"
                  type="password"
                  autoComplete="off"
                  placeholder="EAAG…"
                  value={token}
                  error={problems['conversionsApiToken']}
                  onChange={(event) => {
                    setToken(event.target.value);
                  }}
                />
                {replacing ? (
                  <Button
                    tone="ghost"
                    size="xs"
                    className="self-start"
                    onClick={() => {
                      setReplacing(false);
                      setToken('');
                    }}
                  >
                    {t('cancel')}
                  </Button>
                ) : null}
              </div>
            )}
            <p className="text-[14px] text-fg-muted">{t('adCapiHelp')}</p>
            <p className="text-[14px] text-fg-muted">{t('adLog')}</p>
          </Card>
        </div>
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[17px] font-semibold">{t('fdTitle')}</h3>
            <Button
              tone="ghost"
              size="xs"
              onClick={() => {
                setAskingFeed(true);
              }}
            >
              {t('fdRegen')}
            </Button>
          </div>
          <p className="text-[14px] text-fg-muted">{t('fdLead')}</p>
          {feed.data ? (
            <Field
              label={t('fdTitle')}
              className="[&>label]:sr-only [&_input]:text-[13px] [&_input]:text-ellipsis"
              name="feedUrl"
              readOnly
              value={feed.data.url.replace(/^https?:\/\//, '')}
              help={t('fdSince', { date: formatDayMonthYear(feed.data.regeneratedAt) })}
              suffix={<CopyButton text={feed.data.url} />}
            />
          ) : null}
          {feed.isError ? <Banner tone="bad">{errorText(feed.error)}</Banner> : null}
          <Eyebrow>{t('fdSteps')}</Eyebrow>
          <ol className="flex flex-col gap-2">
            {FEED_STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5 text-[14px]">
                <span className="mt-px flex size-[22px] flex-none items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">
                  {index + 1}
                </span>
                {t(step)}
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <ActionBar>
        <Button busy={save.isPending && !removing} onClick={saveAll}>
          {t('save')}
        </Button>
      </ActionBar>
      <Sheet
        open={askingFeed}
        title={t('fdRegenTitle')}
        onClose={() => {
          setAskingFeed(false);
        }}
        footer={
          <Button
            tone="danger"
            wide
            busy={regenerate.isPending}
            onClick={() => {
              regenerate.mutate(undefined, {
                onSuccess: () => {
                  setAskingFeed(false);
                  toast.show(t('fdRegenerated'));
                },
              });
            }}
          >
            {t('fdRegen')}
          </Button>
        }
      >
        <p className="text-[15px]">{t('fdRegenCons')}</p>
        {regenerate.isError ? <Banner tone="bad">{errorText(regenerate.error)}</Banner> : null}
      </Sheet>
      <Toast message={toast.message} />
    </ShellPage>
  );
}
