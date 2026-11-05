import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { BackupCodes } from './backup-codes';
import { StepHeading, Steps } from './sign-in-parts';

/** The first sign-in's last step: the ten codes, then into the console. */
export function BackupCodesStep({
  email,
  codes,
  onContinue,
}: {
  email: string;
  codes: string[];
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Steps done={3} total={3} email={email} />
      <StepHeading title={t('backupCodes.title')} lead={t('backupCodes.lead')} />
      <div className="flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-surface p-4">
        <BackupCodes codes={codes} />
        <Button type="button" small onClick={onContinue}>
          {t('backupCodes.continue')}
        </Button>
      </div>
    </>
  );
}
