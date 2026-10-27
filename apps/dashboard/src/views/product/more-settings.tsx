import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

/**
 * More settings (TENANT-DASHBOARD-DESIGN §7.4's fourth card, collapsed; PST-05), Slice 11.7a's part of it: whether the
 * product is on sale, and Duplicate (PRD-18), Archive and Delete for good (PRD-13). The size chart and condition join it
 * in 11.7c.
 */
export function MoreSettings({
  active,
  readOnly,
  busy,
  onActive,
  onDuplicate,
  onRemove,
}: {
  active: boolean;
  readOnly: boolean;
  /** Duplicate is under way. */
  busy: boolean;
  onActive: (active: boolean) => void;
  onDuplicate: () => void;
  onRemove: (how: 'archive' | 'hard') => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <details className="group rounded-card border border-line bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
        {t('moreSettings')}
        <span className="transition-transform group-open:rotate-180">
          <Icon name="down" />
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex min-h-10 items-center gap-3">
          <Switch checked={active} disabled={readOnly} onChange={onActive} label={t('active')} />
          <span className="text-[15px] font-medium">{t('active')}</span>
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <Button tone="outline" size="sm" busy={busy} onClick={onDuplicate}>
              <Icon name="copy" />
              {t('duplicate')}
            </Button>
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                onRemove('archive');
              }}
            >
              {t('archiveOpt')}
            </Button>
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                onRemove('hard');
              }}
            >
              <span className="text-danger-text">{t('deleteForever')}</span>
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
