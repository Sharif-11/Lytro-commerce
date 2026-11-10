import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useEntryEvidence } from '@/api/manual-entries';
import { Banner } from '@/components/ui/banner';
import { Panel } from '@/components/ui/panel';
import type { EvidenceLink, ManualEntry } from '@/types/manual-entries';

/**
 * ADM-17, D8-47: a payment's screenshot, through its five-minute link, read as the panel opens. A PDF, which an image can't
 * show, opens in its own tab; one the server no longer holds says so.
 */
export function ShotPanel({
  title,
  sub,
  link,
  failed,
  note,
  onBack,
}: {
  title: string;
  sub: string;
  link: EvidenceLink | undefined;
  failed: boolean;
  /** A word under the picture, such as the queue's warning that it is only the seller's word. */
  note?: ReactNode;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [notImage, setNotImage] = useState(false);
  return (
    <Panel open title={title} sub={sub} onClose={onBack}>
      {failed ? (
        <Banner tone="info" icon="info">
          {t('manual.gone')}
        </Banner>
      ) : !link ? (
        <span className="skel mx-auto h-[320px]! w-[220px]" aria-busy="true" />
      ) : notImage ? (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="mx-auto font-semibold text-primary underline"
        >
          {t('manual.shotPdf')}
        </a>
      ) : (
        <img
          src={link.url}
          alt={title}
          onError={() => {
            setNotImage(true);
          }}
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
      sub={t('manual.linkNote')}
      link={evidence.data}
      failed={evidence.isError}
      onBack={onBack}
    />
  );
}
