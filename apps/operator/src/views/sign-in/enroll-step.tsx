import { useEffect, useState, type SyntheticEvent } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { useCopy } from '@/lib/use-copy';
import { CodeField, FormCard, StepHeading, Steps } from './sign-in-parts';
import { typedCode } from './typed-code';

const QR_SIZE = 168;

interface EnrollStepProps {
  email: string;
  secret: string;
  uri: string;
  onSubmit: (code: string) => void;
  pending: boolean;
  error: unknown;
}

/** The key in fours, as authenticator apps show it; a copy keeps it whole. */
function inFours(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

/** First sign-in (ADM-01): the server never renders a QR image (D30); `qrcode` draws the otpauth URI here,
    in the browser, and the secret stays shown for manual entry. */
export function EnrollStep({
  email,
  secret,
  uri,
  onSubmit,
  pending,
  error,
}: EnrollStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, copy] = useCopy();

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(uri, {
      width: QR_SIZE,
      margin: 1,
      color: { dark: '#10201f', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        // The manual-entry secret below is always shown.
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(typedCode(code));
  }

  const problem =
    error instanceof ApiClientError
      ? (error.fieldProblems().code ?? errorMessage(error, t))
      : error
        ? errorMessage(error, t)
        : undefined;

  return (
    <>
      <Steps done={2} total={3} email={email} />
      <StepHeading title={t('enroll.title')} lead={t('enroll.lead')} />
      <FormCard onSubmit={handleSubmit}>
        {qr ? (
          <img
            src={qr}
            alt={t('enroll.qrAlt')}
            width={QR_SIZE}
            height={QR_SIZE}
            className="mx-auto rounded-lg border border-line"
          />
        ) : (
          <div className="skel mx-auto size-[168px]" />
        )}
        <div>
          <p className="mb-1.5 text-label font-field-label text-field-label">
            {t('enroll.secretLabel')}
          </p>
          <div className="mono flex min-h-field items-center justify-between gap-2 rounded-control border border-line-strong bg-surface py-1 pr-1 pl-3 text-[14px] break-all">
            <span className="min-w-0">{inFours(secret)}</span>
            <button
              type="button"
              aria-label={copied ? t('common.copied') : t('common.copy')}
              onClick={() => {
                copy(secret);
              }}
              className="inline-flex size-9 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100"
            >
              <ConsoleIcon name={copied ? 'check' : 'copy'} />
            </button>
          </div>
        </div>
        <CodeField
          label={t('verify.codeLabel')}
          value={code}
          onChange={setCode}
          error={problem}
          digitsOnly
        />
        <Button type="submit" small loading={pending}>
          {t('enroll.submit')}
        </Button>
      </FormCard>
    </>
  );
}
