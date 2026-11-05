import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { downloadText } from '@/lib/download';
import { useCopy } from '@/lib/use-copy';

/** Shown exactly once after enrolment or a regeneration (ADM-01): the codes cannot be retrieved later, so
    copy-all and download are both offered. Shared with the account screen. */
export function BackupCodes({ codes }: { codes: string[] }): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  return (
    <>
      <ul className="grid grid-cols-2 gap-2">
        {codes.map((code) => (
          <li
            key={code}
            className="mono rounded-md border border-line bg-neutral-50 px-2.5 py-2 text-center text-[14px]"
          >
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          tone="outline"
          small
          fit
          onClick={() => {
            copy(codes.join('\n'));
          }}
        >
          <ConsoleIcon name={copied ? 'check' : 'copy'} size={18} />
          {copied ? t('common.copied') : t('backupCodes.copyAll')}
        </Button>
        <Button
          type="button"
          tone="outline"
          small
          fit
          onClick={() => {
            downloadText('lytro-operator-backup-codes.txt', codes.join('\n'));
          }}
        >
          <ConsoleIcon name="down" size={18} />
          {t('backupCodes.download')}
        </Button>
      </div>
    </>
  );
}
