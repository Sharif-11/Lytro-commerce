import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

interface BackupCodesStepProps {
  codes: string[];
  onContinue: () => void;
}

function downloadCodes(codes: string[]): void {
  const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lytro-operator-backup-codes.txt';
  link.click();
  URL.revokeObjectURL(url);
}

/** Shown exactly once, right after enroll succeeds (ADM-01) — these ten codes are never shown or retrievable
    again, so both a copy-all and a download-as-file affordance are offered rather than just a static list. */
export function BackupCodesStep({ codes, onContinue }: BackupCodesStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [copied, copy] = useCopyToClipboard();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-900">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-auto! flex-1"
          onClick={() => {
            copy(codes.join('\n'));
          }}
        >
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto! flex-1"
          onClick={() => {
            downloadCodes(codes);
          }}
        >
          {t('common.download')}
        </Button>
      </div>

      <Button type="button" onClick={onContinue}>
        {t('operator.backupCodes.continue')}
      </Button>
    </div>
  );
}
