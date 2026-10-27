import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

/**
 * A link to share (the prototype's link cards: Home's shop link, a product's link): the address in a field with Copy,
 * a line under it when there is one, then Facebook and WhatsApp, each opening the network's own share page. `onShared`
 * hears each copy and share (Home keeps SUP-01's "link shared").
 */
export function LinkShare({
  url,
  shown,
  note,
  onShared,
}: {
  url: string;
  /** The address as the field shows it, without the scheme. */
  shown: string;
  /** A line under the address (a product's "Pick a variant to add ?v= to the link"). */
  note?: ReactNode;
  onShared?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { copied, copy } = useCopyToClipboard();
  const share = (name: string, href: string): React.JSX.Element => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onShared}
      className={`${buttonClass('outline', 'sm')} no-underline`}
    >
      <Icon name="share" />
      {name}
    </a>
  );
  return (
    <>
      <div className="mt-2 mb-3 flex flex-col gap-1.5">
        <div className="flex h-12 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-[16px]">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {shown}
          </span>
          <Button
            tone="outline"
            size="xs"
            onClick={() => {
              void copy(url).then((ok) => {
                if (ok) onShared?.();
              });
            }}
          >
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
        {note ? <div className="text-[13px] text-fg-muted">{note}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {share(
          t('facebook'),
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        )}
        {share(t('whatsapp'), `https://wa.me/?text=${encodeURIComponent(url)}`)}
      </div>
    </>
  );
}
