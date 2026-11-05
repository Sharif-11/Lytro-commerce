import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBanner } from '@lytronix/ui';
import { INLINE_FIELD, SMALL_BUTTON } from './sizes';

/**
 * A change made in its row (OPERATOR-CONSOLE-DESIGN §8, §9): the value, the reason that goes on the audit log, Save and
 * Cancel. `block` gives the value the row's whole width, for what takes more than one short field.
 */
export function InlineForm({
  reason,
  onReason,
  pending,
  canSave = true,
  error,
  block = false,
  onSubmit,
  onCancel,
  children,
}: {
  reason: string;
  onReason: (reason: string) => void;
  pending: boolean;
  canSave?: boolean;
  error: string | null;
  block?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, []);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (canSave && reason.trim() !== '') onSubmit();
  }

  const controls = (
    <>
      <input
        name="reason"
        aria-label={t('common.reason')}
        placeholder={t('common.reason')}
        required
        value={reason}
        onChange={(event) => {
          onReason(event.target.value);
        }}
        className={`${INLINE_FIELD} w-[220px] max-w-full`}
      />
      <Button
        type="submit"
        small
        fit
        loading={pending}
        disabled={!canSave || reason.trim() === ''}
        className={SMALL_BUTTON}
      >
        {t('common.save')}
      </Button>
      <Button
        type="button"
        tone="outline"
        small
        fit
        disabled={pending}
        className={SMALL_BUTTON}
        onClick={onCancel}
      >
        {t('common.cancel')}
      </Button>
    </>
  );

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit}
      className={
        block
          ? 'flex min-w-0 flex-[1_1_100%] flex-col gap-2'
          : 'flex max-w-full flex-wrap items-center gap-2'
      }
    >
      {children}
      {block ? <span className="flex flex-wrap items-center gap-2">{controls}</span> : controls}
      {error ? (
        <div className="min-w-0 flex-[1_1_100%]">
          <ErrorBanner message={error} />
        </div>
      ) : null}
    </form>
  );
}
