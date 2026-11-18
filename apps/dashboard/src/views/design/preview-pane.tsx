import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { EditorIcon } from './editor-icon';

// STOREFRONT-BUILDER-PLAN SB-12: the live preview -- the real storefront drawn from the draft through its short-lived
// signed link, at the shop's Lytro address (the one host that lets the dashboard frame its /preview, deploy/Caddyfile).
// Beside the editor on a desktop; full screen on a phone.

export type PreviewDevice = 'phone' | 'desktop';

// The widths the storefront is drawn at, then scaled into the pane.
const WIDTHS: Readonly<Record<PreviewDevice, number>> = { phone: 390, desktop: 1280 };

/** The storefront drawn at a phone's or a desktop's width, scaled to fit the box it is given. */
function PreviewFrame({
  src,
  device,
  title,
}: {
  src: string | null;
  device: PreviewDevice;
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const base = WIDTHS[device];
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      setScale(Math.min(1, element.clientWidth / base));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [base]);
  return (
    <div
      ref={box}
      className="relative mx-auto w-full overflow-hidden rounded-[12px] bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      style={{ maxWidth: device === 'phone' ? WIDTHS.phone : undefined, height: 820 }}
    >
      {src === null ? null : (
        <iframe
          key={src}
          src={src}
          title={title}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width: base, height: 820 / scale, transform: `scale(${String(scale)})` }}
        />
      )}
    </div>
  );
}

/** The desktop's pane beside the editor: what it shows, the phone or desktop choice, and the preview. */
export function PreviewPane({
  src,
  heading,
  badge,
  footer,
}: {
  src: string | null;
  heading?: string;
  /** Beside the heading: the draft's chip, which the desktop's header has no room for. */
  badge?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation('menu');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  return (
    <div className="flex flex-col items-center gap-3 bg-[#e7ecec] px-6 py-[18px]">
      <div className="flex w-full items-center gap-2.5 text-[13px] text-fg-muted">
        <b className="text-fg">{heading ?? t('sdLiveDraft')}</b>
        {badge}
        <div className="ml-auto flex w-[220px] gap-[3px] rounded-[12px] bg-[#eaf0f0] p-[3px]">
          {(['phone', 'desktop'] as const).map((each) => (
            <button
              key={each}
              type="button"
              aria-pressed={device === each}
              onClick={() => {
                setDevice(each);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-1 py-[9px] text-[13.5px] font-semibold ${device === each ? 'bg-surface text-primary shadow-[0_1px_3px_rgba(0,0,0,0.14)]' : 'text-fg-muted'}`}
            >
              <EditorIcon name={each} size={18} />
              {t(each === 'phone' ? 'sdPhone' : 'sdDesktop')}
            </button>
          ))}
        </div>
      </div>
      <PreviewFrame src={src} device={device} title={t('sdLiveDraft')} />
      {footer}
    </div>
  );
}

/** On a phone: the preview over the whole screen, with a way back to the editor and any buttons under it. */
export function FullPreview({
  open,
  src,
  heading,
  footer,
  onClose,
}: {
  open: boolean;
  src: string | null;
  heading?: string;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation('menu');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={t('sdLiveDraft')}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      {/* Drawn only while open, so the page never holds a second, hidden copy of its words and buttons. */}
      {open ? (
        <div className="flex h-dvh flex-col">
          <div className="flex h-14 flex-none items-center gap-2 border-b border-line px-2.5">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-[10px]"
              aria-label={t('sdClosePreview')}
              onClick={onClose}
            >
              <Icon name="x" />
            </button>
            <b className="min-w-0 flex-1 truncate text-[17px]">{heading ?? t('sdLiveDraft')}</b>
          </div>
          {src !== null ? (
            <iframe src={src} title={t('sdLiveDraft')} className="min-h-0 w-full flex-1 border-0" />
          ) : (
            <div className="flex-1" />
          )}
          {footer ? (
            <div className="flex flex-none gap-2.5 border-t border-line px-3 pt-2.5 pb-4 [&>*]:flex-1">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
