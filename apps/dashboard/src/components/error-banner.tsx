import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHelpLine } from '@/api/help-line';
import { HelpSheet } from '@/components/help-sheet';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useErrorText } from '@/hooks/use-error-text';
import { requestIdOf } from '@/lib/help-line';
import { isSavingPaused } from '@/lib/saving-paused';
import { ShellContext } from '@/shell/shell-context';

/**
 * A request's failure in a banner (TENANT-DASHBOARD-DESIGN §9), wherever a page that didn't load, a Save that failed or a
 * sheet's action says so. A server fault (500, 503) adds its error ID under it to copy or send Lytro (Slice 8.8's
 * `p88-err-save`, `p88-err-busy`, `p88-err-sheet`); a refusal keeps its sentence alone (`p88-err-refused`).
 */
export function ErrorBanner({ error }: { error: unknown }): React.JSX.Element | null {
  const errorText = useErrorText();
  const shell = useContext(ShellContext);
  // D9-14 (Slice 9.9): a save refused because changes can't be saved now is a wait, not a fault. The page's banner says
  // so, and its action bar holds "Saving paused", so the form adds nothing; a page without that banner says it here.
  if (isSavingPaused(error)) {
    return shell?.showsBanners ? null : <Banner tone="warn">{errorText(error)}</Banner>;
  }
  const id = requestIdOf(error);
  const banner = <Banner tone="bad">{errorText(error)}</Banner>;
  if (id === null) return banner;
  return (
    <div className="flex flex-col">
      {banner}
      <RequestId id={id} />
    </div>
  );
}

/**
 * A page that didn't load, in its card with Try again (Slice 8.8's `p88-err-load`): what didn't load, the server's
 * sentence, and a fault's error ID.
 */
export function LoadFailed({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const errorText = useErrorText();
  const id = requestIdOf(error);
  return (
    <Card role="alert" className="flex flex-col items-start gap-2">
      <span className="text-danger">
        <Icon name="alert" size={28} />
      </span>
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="text-[14px] text-fg-muted">{errorText(error)}</p>
      <Button size="sm" onClick={onRetry}>
        {t('p88help.tryAgain')}
      </Button>
      {id === null ? null : (
        <div className="self-stretch">
          <RequestId id={id} />
        </div>
      )}
    </Card>
  );
}

/**
 * The error ID under a fault (the prototype's `.p88rid`): the ID to copy, and asking that it be sent if it happens again --
 * on WhatsApp, which opens the help line holding the shop's link and the ID (`p88-help-id`); with no WhatsApp set, the
 * ID to copy alone.
 */
function RequestId({ id }: { id: string }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const shell = useContext(ShellContext);
  const whatsapp = useHelpLine().data?.whatsapp ?? null;
  const [helping, setHelping] = useState(false);
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-dashed border-line-strong bg-neutral-50 px-3 py-2.5">
        <span className="text-[13px] font-semibold text-fg-muted">{t('p88help.errId')}</span>
        <span className="font-mono text-[17px] font-bold tracking-[0.06em]">{id}</span>
        <Button
          tone="outline"
          size="xs"
          className="ml-auto"
          onClick={() => {
            void navigator.clipboard.writeText(id).then(() => {
              shell?.showToast(t('p88help.idCopied'));
            });
          }}
        >
          <Icon name="copy" />
          {t('copy')}
        </Button>
      </div>
      <p className="mt-2 text-[14px]">
        {t('p88help.errAgain')}
        {whatsapp === null ? null : (
          <>
            {' '}
            <button
              type="button"
              className="font-semibold text-primary underline"
              onClick={() => {
                setHelping(true);
              }}
            >
              {t('p88help.sendWa')}
            </button>
          </>
        )}
      </p>
      {helping ? (
        <HelpSheet
          open
          requestId={id}
          onClose={() => {
            setHelping(false);
          }}
        />
      ) : null}
    </>
  );
}
