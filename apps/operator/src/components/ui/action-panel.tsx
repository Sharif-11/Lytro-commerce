import { useId, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBanner } from '@lytronix/ui';
import { Panel } from './panel';

/**
 * A panel that does one thing (OPERATOR-CONSOLE-DESIGN rule 3): the consequence and the fields it is given, then Cancel
 * and one button named for the action. It can't be closed by a stray tap while the action is on its way.
 */
export function ActionPanel({
  title,
  sub,
  onClose,
  onCancel,
  actionLabel,
  danger = false,
  pending,
  error,
  canSubmit = true,
  onSubmit,
  children,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  /** Where Cancel goes, when it isn't simply closing: a step back. */
  onCancel?: () => void;
  actionLabel: string;
  danger?: boolean;
  pending: boolean;
  error?: string | null;
  canSubmit?: boolean;
  onSubmit: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Panel
      open
      title={title}
      sub={sub}
      onClose={onClose}
      dismissable={!pending}
      footerInRow
      footer={
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            disabled={pending}
            className="flex-1 sm:flex-none"
            onClick={onCancel ?? onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            tone={danger ? 'danger' : 'primary'}
            small
            fit
            disabled={!canSubmit}
            loading={pending}
            className="flex-1 sm:flex-none"
          >
            {actionLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {children}
        {error ? <ErrorBanner message={error} /> : null}
      </form>
    </Panel>
  );
}
