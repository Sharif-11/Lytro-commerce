import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DELIVERY_ZONE_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useCreateZone, useSetZoneAreas, useUpdateZone, type ZoneChange } from '@/api/delivery';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import type { DeliverySettings, DeliveryZone, Locations } from '@/types/delivery';
import { AreaChips } from './area-chips';
import { AreaPickSheet } from './area-pick-sheet';
import { areaKey, coverOf, holderOf, inputOf, refsOf, sameRefs, type AreaRef } from './areas';
import { useDeliveryWords } from './delivery-words';

/** A typed charge: a whole or two-decimal amount of taka. */
const CHARGE = /^\d+(\.\d{1,2})?$/;

/**
 * One of the shop's own zones, new or saved (the prototype's `sh-zone`, Part 22's `sh-zone-new` and `sh-zone-taken`;
 * DLV-01, DLV-02, DLV-06): its name, its charge, its areas as chips with the picker to add more, no delivery; before
 * Save, an area another zone holds is named and red, to be removed here, and a thana moving from a broader zone says so.
 */
export function ZoneSheet({
  open,
  zone,
  settings,
  locations,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** Null for a new zone. */
  zone: DeliveryZone | null;
  settings: DeliverySettings;
  locations: Locations;
  onDelete: (zone: DeliveryZone) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const words = useDeliveryWords();
  const create = useCreateZone();
  const update = useUpdateZone();
  const setAreas = useSetZoneAreas();
  const saved = zone ? refsOf(zone.areas) : [];
  const [name, setName] = useState('');
  const [charge, setCharge] = useState('');
  const [noDelivery, setNoDelivery] = useState(false);
  const [refs, setRefs] = useState<AreaRef[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? '');
    setCharge(zone ? String(Number(zone.charge)) : '');
    setNoDelivery(zone?.noDelivery ?? false);
    setRefs(zone ? refsOf(zone.areas) : []);
    setPicking(false);
    create.reset();
    update.reset();
    setAreas.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const own = zone?.id ?? null;
  const taken = refs.flatMap((ref) => {
    const holder = holderOf(settings, ref, own);
    return holder ? [{ ref, holder }] : [];
  });
  // A thana added here that another zone covers by its city or district moves to this zone.
  const moving = refs.flatMap((ref) => {
    if (ref.kind !== 'thana' || saved.some((each) => areaKey(each) === areaKey(ref))) return [];
    const cover = coverOf(settings, locations, ref.id, own);
    return cover ? [{ ref, zone: cover.zone }] : [];
  });

  const ready =
    name.trim() !== '' && CHARGE.test(charge.trim()) && refs.length > 0 && taken.length === 0;
  const busy = create.isPending || update.isPending || setAreas.isPending;
  const failed = create.error ?? update.error ?? setAreas.error;

  async function save(): Promise<void> {
    if (!ready) return;
    if (!zone) {
      await create.mutateAsync({
        name: name.trim(),
        charge: Number(charge),
        noDelivery,
        areas: inputOf(refs),
      });
      onClose();
      return;
    }
    const body: ZoneChange = {
      ...(name.trim() === zone.name ? {} : { name: name.trim() }),
      ...(Number(charge) === Number(zone.charge) ? {} : { charge: Number(charge) }),
      ...(noDelivery === zone.noDelivery ? {} : { noDelivery }),
    };
    if (Object.keys(body).length > 0) await update.mutateAsync({ id: zone.id, body });
    if (!sameRefs(refs, saved)) await setAreas.mutateAsync({ id: zone.id, areas: inputOf(refs) });
    onClose();
  }

  return (
    <>
      <Sheet
        open={open && !picking}
        title={zone ? t('zoneTitle') : t('addZone')}
        onClose={onClose}
        footer={
          <>
            <Button
              busy={busy}
              disabled={!ready}
              onClick={() => {
                void save().catch(() => undefined);
              }}
            >
              {t('save')}
            </Button>
            {zone ? (
              <Button
                tone="outline"
                onClick={() => {
                  onDelete(zone);
                }}
              >
                <span className="text-danger-text">{t('zoneDelete')}</span>
              </Button>
            ) : null}
          </>
        }
      >
        {open ? (
          <>
            <Field
              label={t('zoneName')}
              value={name}
              maxLength={DELIVERY_ZONE_NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <Field
              label={t('zoneCharge')}
              prefix="৳"
              inputMode="decimal"
              className="num"
              value={charge}
              onChange={(event) => {
                setCharge(event.target.value);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-fg-muted">{t('zoneAreas')}</span>
              <AreaChips
                refs={refs}
                locations={locations}
                addLabel={t('zoneAdd')}
                taken={new Set(taken.map(({ ref }) => areaKey(ref)))}
                onRemove={(ref) => {
                  setRefs((now) => now.filter((each) => areaKey(each) !== areaKey(ref)));
                }}
                onAdd={() => {
                  setPicking(true);
                }}
              />
              {moving.map(({ ref, zone: from }) => (
                <p key={areaKey(ref)} className="text-[13px] text-fg-muted">
                  {t('areaMoves', { area: words.area(locations, ref), zone: words.zone(from) })}
                </p>
              ))}
              {taken.map(({ ref, holder }) => (
                <p key={areaKey(ref)} className="text-[13px] font-medium text-danger">
                  {t('areaTaken', { area: words.area(locations, ref), zone: words.zone(holder) })}
                </p>
              ))}
            </div>
            <div className="flex min-h-10 items-center gap-3">
              <Switch checked={noDelivery} onChange={setNoDelivery} label={t('zoneNoDel')} />
              <span className="text-[15px] font-medium">{t('zoneNoDel')}</span>
            </div>
            <p className="text-[14px] text-fg-muted">{t('zonesLimit')}</p>
            {failed ? <Banner tone="bad">{errorText(failed)}</Banner> : null}
          </>
        ) : null}
      </Sheet>
      <AreaPickSheet
        open={open && picking}
        mode="zone"
        title={t('areaPickT')}
        settings={settings}
        locations={locations}
        zoneId={own}
        chosen={refs}
        onAdd={(added) => {
          setRefs((now) => [
            ...now,
            ...added.filter((ref) => !now.some((each) => areaKey(each) === areaKey(ref))),
          ]);
          setPicking(false);
        }}
        onBack={() => {
          setPicking(false);
        }}
        onClose={onClose}
      />
    </>
  );
}
