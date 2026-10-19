import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { downloadText } from '@/lib/download';
import { useCopy } from '@/lib/use-copy';

interface BackupCodesStepProps {
  codes: string[];
  onContinue: () => void;
  continueLabel?: string;
}

/** Shown exactly once after enrolment or a regeneration (ADM-01): the codes cannot be retrieved later, so
    copy-all and download are both offered. Shared with the account screen. */
export function BackupCodesStep({
  codes,
  onContinue,
  continueLabel,
}: BackupCodesStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();

  return (
    <div className="space-y-5">
      <ul className="mono grid grid-cols-2 gap-x-4 gap-y-2 rounded-card border border-line bg-surface-alt p-4 text-[14px] text-fg">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          tone="outline"
          onClick={() => {
            copy(codes.join('\n'));
          }}
        >
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
        <Button
          type="button"
          tone="outline"
          onClick={() => {
            downloadText('lytro-operator-backup-codes.txt', codes.join('\n'));
          }}
        >
          {t('common.download')}
        </Button>
      </div>
      <Button type="button" onClick={onContinue}>
        {continueLabel ?? t('backupCodes.continue')}
      </Button>
    </div>
  );
}
