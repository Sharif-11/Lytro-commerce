import { useTranslation } from 'react-i18next';
import { useCopy } from '@/lib/use-copy';
import { ConsoleIcon } from './console-icon';

/** Copies an id or a TrxID, and says so for a moment. */
export function CopyButton({ text }: { text: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      aria-label={copied ? t('common.copied') : t('common.copy')}
      onClick={(event) => {
        event.stopPropagation();
        copy(text);
      }}
      className="inline-flex size-7 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100"
    >
      <ConsoleIcon name={copied ? 'check' : 'copy'} />
    </button>
  );
}
