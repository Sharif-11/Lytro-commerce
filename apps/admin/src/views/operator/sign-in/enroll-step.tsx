import { useEffect, useState, type SyntheticEvent } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

interface EnrollStepProps {
  secret: string;
  uri: string;
  onSubmit: (code: string) => void;
  pending: boolean;
  error: string | null;
}

/** Step 2 for a first-time operator (ADM-01): the server never renders a QR image itself (D30) — this is
    that frontend concern. `qrcode` turns the otpauth:// URI into a data URL client-side, nothing leaves the
    browser. */
export function EnrollStep({
  secret,
  uri,
  onSubmit,
  pending,
  error,
}: EnrollStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, copy] = useCopyToClipboard();

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(uri, { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        /* Falls back to the manual-entry secret below, which is always shown regardless. */
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(code);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={t('operator.enroll.title')}
            className="h-[220px] w-[220px] rounded-2xl border border-slate-200 p-2"
          />
        ) : (
          <div className="h-[220px] w-[220px] animate-pulse rounded-2xl bg-slate-100" />
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {t('operator.enroll.secretLabel')}
        </span>
        <button
          type="button"
          onClick={() => {
            copy(secret);
          }}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-mono text-sm text-slate-900"
        >
          <span className="truncate">{secret}</span>
          <span className="ml-3 shrink-0 text-xs font-sans font-semibold text-brand-700">
            {copied ? t('common.copied') : t('common.copy')}
          </span>
        </button>
      </div>

      <TextField
        label={t('operator.enroll.codeLabel')}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" loading={pending}>
        {t('operator.enroll.submit')}
      </Button>
    </form>
  );
}
