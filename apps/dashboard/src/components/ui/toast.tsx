import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/icon';
import type { ToastAction, ToastItem, ToastTone } from '@/hooks/use-toast';

const TONE_ICON: Record<ToastTone, IconName> = { success: 'check', error: 'alert', info: 'info' };
// The kind's colour on ink: its mark and the edge at its start (the prototype's `.ux-toast.ok/.bad/.info`).
const TONE_COLOUR: Record<ToastTone, string> = {
  success: '[--toast-tone:#86efac]',
  error: '[--toast-tone:#fca5a5]',
  info: '[--toast-tone:var(--color-brand-300)]',
};

/**
 * Where toasts sit (Fixes · UI/UX batch 2, item 1.4; the prototype's `.ux-toasts`): over the tab bar on a phone and a
 * tablet, and over a page's action bar when it has one (index.css, `.toast-stack`), so a toast never covers the main
 * action; 380 px in the bottom right corner from 1024 px. Two at most, the newest lowest.
 */
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastItem[];
  onDismiss?: (id: number) => void;
}): React.JSX.Element | null {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] left-4 z-30 flex flex-col gap-2 lg:right-8 lg:bottom-8 lg:left-auto lg:w-[380px]">
      {toasts.map((item) => (
        <ToastCard
          key={item.id}
          item={item}
          onClose={
            onDismiss && (item.tone === 'error' || item.action !== null)
              ? () => {
                  onDismiss(item.id);
                }
              : null
          }
        />
      ))}
    </div>
  );
}

/**
 * One toast (the prototype's `.ux-toast`): ink, the kind's mark in its colour inside a soft circle, the words, then an
 * action or a close. An error is read out at once (`alert`); the rest politely (`status`).
 */
function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      data-tone={item.tone}
      className={`${TONE_COLOUR[item.tone]} flex min-h-[52px] items-center gap-3 rounded-[12px] border-s-4 border-[var(--toast-tone)] bg-ink py-2.5 ps-3.5 pe-3 text-[15px] leading-[1.4] text-white shadow-[0_1px_2px_rgba(16,32,31,0.06),0_8px_24px_rgba(16,32,31,0.16)]`}
    >
      <span
        aria-hidden="true"
        className="flex size-7 flex-none items-center justify-center rounded-full bg-white/10 text-[var(--toast-tone)]"
      >
        <Icon name={TONE_ICON[item.tone]} size={18} />
      </span>
      <span className="min-w-0 flex-1">{item.message}</span>
      {item.action ? (
        <button
          type="button"
          onClick={item.action.onClick}
          className="min-h-9 flex-none rounded-[8px] bg-white/12 px-2.5 text-[14px] font-bold text-brand-300"
        >
          {item.action.label}
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          aria-label={t('ux2.close')}
          onClick={onClose}
          className="flex size-9 flex-none items-center justify-center rounded-[8px] text-white/85"
        >
          <Icon name="x" size={18} />
        </button>
      ) : null}
    </div>
  );
}

const ICON_TONE: Partial<Record<IconName, ToastTone>> = { info: 'info', alert: 'error' };

/**
 * A screen's one toast, in the same design: its words, its kind (or, as screens wrote it before, its mark), and an
 * action where one is drawn (Part 39's Undo after a category moved). It clears itself (useToast).
 */
export function Toast({
  message,
  icon,
  tone,
  action,
}: {
  message: string | null;
  icon?: IconName;
  tone?: ToastTone;
  action?: ToastAction | null;
}): React.JSX.Element | null {
  if (message === null) return null;
  const kind = tone ?? (icon ? ICON_TONE[icon] : undefined) ?? 'success';
  return <ToastStack toasts={[{ id: 0, message, tone: kind, action: action ?? null }]} />;
}
