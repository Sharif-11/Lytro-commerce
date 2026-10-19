import { useEffect, useState, type SyntheticEvent } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { useCopy } from '@/lib/use-copy';

interface EnrollStepProps {
  secret: string;
  uri: string;
  onSubmit: (code: string) => void;
  pending: boolean;
  error: string | null;
}

/** First sign-in (ADM-01): the server never renders a QR image (D30); `qrcode` draws the otpauth URI here,
    in the browser, and the secret stays shown for manual entry. */
export function EnrollStep({
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
      width: 220,
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
    onSubmit(code.trim());
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="flex justify-center">
        {qr ? (
          <img
            src={qr}
            alt={t('enroll.qrAlt')}
            width={220}
            height={220}
            className="rounded-card bg-white p-2"
          />
        ) : (
          <div className="h-[220px] w-[220px] animate-pulse rounded-card bg-surface-alt" />
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-bold text-fg">{t('enroll.secretLabel')}</p>
        <button
          type="button"
          onClick={() => {
            copy(secret);
          }}
          className="mono flex min-h-12 w-full items-center justify-between gap-3 rounded-control border border-line-strong bg-surface-alt px-3.5 text-left text-[14px] text-fg"
        >
          <span className="truncate">{secret}</span>
          <span className="shrink-0 font-sans text-[12px] font-bold text-brand-300">
            {copied ? t('common.copied') : t('common.copy')}
          </span>
        </button>
      </div>

      <TextField
        label={t('enroll.codeLabel')}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        mono
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" loading={pending}>
        {t('enroll.submit')}
      </Button>
    </form>
  );
}
