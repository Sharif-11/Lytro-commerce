import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import type { EvidenceFile } from '@/api/evidence';
import { useEntryEvidence } from '@/api/manual-entries';
import { Banner } from '@/components/ui/banner';
import { Panel } from '@/components/ui/panel';
import type { ManualEntry } from '@/types/manual-entries';

/**
 * ADM-17, D8-47: a payment's screenshot, read through the server as the panel opens (amended 2026-11-20: never an R2
 * link). A PDF, which an image can't show, is downloaded rather than opened in a tab: a `blob:` tab keeps the console's
 * own policy (`object-src 'none'`), which can stop the browser's PDF viewer. One the server no longer holds says so.
 */
export function ShotPanel({
  title,
  sub,
  file,
  failed,
  note,
  onBack,
}: {
  title: string;
  sub: string;
  file: EvidenceFile | undefined;
  failed: boolean;
  /** A word under the picture, such as the queue's warning that it is only the seller's word. */
  note?: ReactNode;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Panel open title={title} sub={sub} onClose={onBack}>
      {failed ? (
        <Banner tone="info" icon="info">
          {t('manual.gone')}
        </Banner>
      ) : !file ? (
        <span className="skel mx-auto h-[320px]! w-[220px]" aria-busy="true" />
      ) : !file.isImage ? (
        <a
          href={file.url}
          download="screenshot.pdf"
          className="mx-auto font-semibold text-primary underline"
        >
          {t('manual.shotPdf')}
        </a>
      ) : (
        <img
          src={file.url}
          alt={title}
          className="mx-auto block w-[220px] max-w-full rounded-[14px] border border-line bg-white shadow-card"
        />
      )}
      {note}
      <Button type="button" tone="outline" small onClick={onBack}>
        {t('common.back')}
      </Button>
    </Panel>
  );
}

/** An entry's screenshot. */
export function EntryShotPanel({
  entry,
  onBack,
}: {
  entry: ManualEntry;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const evidence = useEntryEvidence(entry.id);
  return (
    <ShotPanel
      title={t('manual.shotTitle', { trx: entry.transactionId ?? '' })}
      sub={t('manual.copyNote')}
      file={evidence.file}
      failed={evidence.failed}
      onBack={onBack}
    />
  );
}
