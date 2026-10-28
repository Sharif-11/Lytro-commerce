import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useDeliverySettings } from '@/api/shop-setup';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Sheet } from '@/components/ui/sheet';
import { ChoiceList, ChoiceRow } from './choice-list';

/**
 * Delivers to (§7.4's sheet, the prototype's `sh-deliversto`; DLV-07): wherever the shop delivers, or only the chosen
 * zones, each with its charge. A zone the shop does not deliver to is not offered. Done keeps the choice.
 */
export function ZonesSheet({
  open,
  chosen,
  onDone,
  onClose,
}: {
  open: boolean;
  chosen: readonly string[];
  onDone: (zoneIds: string[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const settings = useDeliverySettings({ enabled: open });
  const [picked, setPicked] = useState<string[]>([...chosen]);
  const [only, setOnly] = useState(chosen.length > 0);

  useEffect(() => {
    if (!open) return;
    setPicked([...chosen]);
    setOnly(chosen.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const zones = (settings.data?.zones ?? []).filter((zone) => !zone.noDelivery);
  const nameOf = (zone: (typeof zones)[number]) =>
    i18n.language === 'bn' ? zone.label.bn : zone.label.en;
  const names = zones.filter((zone) => picked.includes(zone.id)).map(nameOf);
  return (
    <Sheet
      open={open}
      title={t('deliversTo')}
      onClose={onClose}
      footer={
        <Button
          wide
          onClick={() => {
            onDone(only ? picked : []);
          }}
        >
          {t('done')}
        </Button>
      }
    >
      {open ? (
        <div className="flex flex-col gap-3">
          <ChoiceList label={t('deliversTo')}>
            <ChoiceRow
              on={!only}
              title={t('zonesAll')}
              onChoose={() => {
                setOnly(false);
              }}
            />
            <ChoiceRow
              on={only}
              title={t('zonesOnly')}
              onChoose={() => {
                setOnly(true);
              }}
            />
          </ChoiceList>
          {only ? (
            <div className="flex-none overflow-hidden rounded-card border border-line">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className="flex items-center gap-3 border-b border-line px-4 py-1 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <CheckRow
                      checked={picked.includes(zone.id)}
                      title={nameOf(zone)}
                      onChange={() => {
                        setPicked((current) =>
                          current.includes(zone.id)
                            ? current.filter((id) => id !== zone.id)
                            : [...current, zone.id],
                        );
                      }}
                    />
                  </span>
                  <span className="num text-[15px] font-semibold">{formatTaka(zone.charge)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {only && names.length > 0 ? (
            <p className="text-[14px] text-fg-muted">
              {t('zonesHint', { zones: names.join(', ') })}
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
