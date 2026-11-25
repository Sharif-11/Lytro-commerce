import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import {
  PICKUP_STORE_ADDRESS_MAX,
  PICKUP_STORE_ADDRESS_MIN,
  PICKUP_STORE_NAME_MAX,
  PICKUP_STORE_NAME_MIN,
  type CourierKey,
} from '@lytronix/validators';
import { useAddPickupStore, useStorePlaces } from '@/api/couriers';
import { bangladeshiPhone } from '@/lib/phone';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { AreaField, Field, SelectField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useShell } from '@/shell/shell-context';
import type { PickupStoreAdded } from '@/types/couriers';

interface Draft {
  storeName: string;
  contactName: string;
  contactNumber: string;
  cityId: string;
  zoneId: string;
  areaId: string;
  storeAddress: string;
  use: boolean;
}

/**
 * A new pickup store (the owner, 2026-11-19, the sketch's `sh-ps-new`): made in the courier's own account, with what it
 * asks for -- a name, a contact person and mobile, its own city, zone and area (only areas it collects from) and the
 * address. What it would refuse is said here first, field by field; what it refuses anyway comes back in its words.
 */
export function NewStoreSheet({
  courier,
  name,
  currentStore,
  onClose,
  onAdded,
}: {
  courier: CourierKey;
  /** The courier's name, as it is shown. */
  name: string;
  /** The store bookings leave from now, for "Now: …"; null when none is chosen. */
  currentStore: string | null;
  onClose: () => void;
  onAdded: (added: PickupStoreAdded) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { personName } = useShell();
  const [draft, setDraft] = useState<Draft>({
    storeName: '',
    contactName: personName ?? '',
    contactNumber: '',
    cityId: '',
    zoneId: '',
    areaId: '',
    storeAddress: '',
    use: true,
  });
  const [tried, setTried] = useState(false);
  const cities = useStorePlaces(courier, {});
  const zones = useStorePlaces(courier, { cityId: draft.cityId, enabled: draft.cityId !== '' });
  const areas = useStorePlaces(courier, { zoneId: draft.zoneId, enabled: draft.zoneId !== '' });
  const add = useAddPickupStore(courier);
  const server = add.error instanceof ApiClientError ? add.error.fieldProblems() : {};
  const set = (patch: Partial<Draft>) => {
    setDraft((now) => ({ ...now, ...patch }));
  };

  const mine = {
    storeName:
      draft.storeName.trim().length < PICKUP_STORE_NAME_MIN ? t('crStoreNameErr') : undefined,
    contactName:
      draft.contactName.trim().length < PICKUP_STORE_NAME_MIN ? t('crStoreNameErr') : undefined,
    contactNumber:
      bangladeshiPhone.localOf(draft.contactNumber) === null ? t('crStorePhoneErr') : undefined,
    cityId: draft.cityId === '' ? t('crStorePlaceErr') : undefined,
    zoneId: draft.zoneId === '' ? t('crStorePlaceErr') : undefined,
    areaId: draft.areaId === '' ? t('crStorePlaceErr') : undefined,
    storeAddress:
      draft.storeAddress.trim().length < PICKUP_STORE_ADDRESS_MIN ? t('crStoreAddrErr') : undefined,
  };
  const errorOf = (field: keyof typeof mine): string | undefined =>
    server[field] ?? (tried ? mine[field] : undefined);
  const placeOptions = (list: { id: string; name: string }[] | undefined) => [
    { value: '', label: t('crStorePick') },
    ...(list ?? []).map((place) => ({ value: place.id, label: place.name })),
  ];
  // Field problems are shown on their fields; anything else (the courier refused, didn't answer) above the form.
  const general = add.isError && Object.keys(server).length === 0;

  return (
    <Sheet
      open
      title={t('crStoreNew')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={add.isPending}
          onClick={() => {
            setTried(true);
            if (Object.values(mine).some(Boolean)) return;
            add.mutate(
              {
                storeName: draft.storeName.trim(),
                contactName: draft.contactName.trim(),
                contactNumber: bangladeshiPhone.localOf(draft.contactNumber) ?? draft.contactNumber,
                storeAddress: draft.storeAddress.trim(),
                cityId: draft.cityId,
                zoneId: draft.zoneId,
                areaId: draft.areaId,
                use: draft.use,
              },
              { onSuccess: onAdded },
            );
          }}
        >
          {t('crStoreSubmit', { c: name })}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-fg-muted">{t('crStoreNewD', { c: name })}</p>
        {general ? <ErrorBanner error={add.error} /> : null}
        {cities.isError ? <ErrorBanner error={cities.error} /> : null}
        <Field
          label={t('crStoreName')}
          value={draft.storeName}
          maxLength={PICKUP_STORE_NAME_MAX}
          help={t('crStoreNameH', { c: name })}
          error={errorOf('storeName')}
          onChange={(event) => {
            set({ storeName: event.target.value });
          }}
        />
        <Field
          label={t('crStoreContact')}
          value={draft.contactName}
          maxLength={PICKUP_STORE_NAME_MAX}
          error={errorOf('contactName')}
          onChange={(event) => {
            set({ contactName: event.target.value });
          }}
        />
        <Field
          label={t('crStorePhone')}
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          autoComplete="tel-national"
          value={draft.contactNumber}
          error={errorOf('contactNumber')}
          onChange={(event) => {
            set({ contactNumber: event.target.value });
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label={t('crStoreCity')}
            value={draft.cityId}
            options={placeOptions(cities.data)}
            error={errorOf('cityId')}
            onChange={(event) => {
              set({ cityId: event.target.value, zoneId: '', areaId: '' });
            }}
          />
          <SelectField
            label={t('crStoreZone')}
            value={draft.zoneId}
            disabled={draft.cityId === ''}
            options={placeOptions(zones.data)}
            error={errorOf('zoneId')}
            onChange={(event) => {
              set({ zoneId: event.target.value, areaId: '' });
            }}
          />
        </div>
        <SelectField
          label={t('crStoreArea')}
          value={draft.areaId}
          disabled={draft.zoneId === ''}
          options={placeOptions(areas.data)}
          help={t('crStoreAreaH', { c: name })}
          error={errorOf('areaId')}
          onChange={(event) => {
            set({ areaId: event.target.value });
          }}
        />
        <AreaField
          label={t('crStoreAddr')}
          value={draft.storeAddress}
          maxLength={PICKUP_STORE_ADDRESS_MAX}
          help={t('crStoreAddrH')}
          error={errorOf('storeAddress')}
          onChange={(event) => {
            set({ storeAddress: event.target.value });
          }}
        />
        <CheckRow
          checked={draft.use}
          onChange={() => {
            set({ use: !draft.use });
          }}
          title={t('crStoreUse')}
          sub={currentStore ? t('crStoreUseNow', { s: currentStore }) : undefined}
        />
      </div>
    </Sheet>
  );
}
