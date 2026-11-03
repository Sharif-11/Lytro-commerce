'use client';

import { ADDRESS_LABEL_MAX_LENGTH, SHOPPER_ADDRESSES_MAX } from '@lytronix/validators/common';
import { useCallback, useMemo, useState } from 'react';
import type { Locations, ShopperAddress } from '@/lib/api/storefront-api';
import { type Language, Words } from '@/lib/i18n/words';
import { ADDRESS_MAX } from '@/lib/order/order-form';
import { Icon } from '../icon';
import { AreaFields, Sheet, zillaOf } from '../product/sheets';
import { useLocations } from '../product/use-delivery';
import { shopperRequest } from './shopper-request';

type Editing = { kind: 'new' } | { kind: 'edit'; address: ShopperAddress } | null;

/** A saved address's line: the address, then its thana and district, as `account-addresses` writes it. */
function placeText(address: ShopperAddress, locations: Locations | null, words: Words): string {
  const { location } = address;
  if (!location) return address.deliveryAddress;
  const zilla = locations?.zillas.find((row) => row.id === location.zillaId);
  const place = [
    words.pick({ bn: location.nameBn, en: location.nameEn }),
    ...(zilla ? [words.pick({ bn: zilla.nameBn, en: zilla.nameEn })] : []),
  ].join(', ');
  return `${address.deliveryAddress} · ${place}`;
}

/** `e48-address-new`, `e48-address-edit`: the label, district, thana and address, making it the default; Delete on one saved. */
function AddressSheet({
  words,
  editing,
  locations,
  firstOne,
  onDone,
  onClose,
}: {
  words: Words;
  editing: Exclude<Editing, null>;
  locations: Locations | null;
  firstOne: boolean;
  onDone: (addresses: ShopperAddress[]) => void;
  onClose: () => void;
}) {
  const held = editing.kind === 'edit' ? editing.address : null;
  const [label, setLabel] = useState(held?.label ?? '');
  const [zillaId, setZillaId] = useState<number | null>(null);
  const [thanaId, setThanaId] = useState<number | null>(held?.location?.id ?? null);
  const [address, setAddress] = useState(held?.deliveryAddress ?? '');
  const [isDefault, setIsDefault] = useState(held?.isDefault ?? firstOne);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const labelWrong = label.trim() === '';
  const addressWrong = address.trim() === '';

  const finish = (answer: { data: { addresses: ShopperAddress[] } | null }) => {
    setSending(false);
    if (answer.data) onDone(answer.data.addresses);
    else setFailed(true);
  };

  const save = async () => {
    setTried(true);
    if (labelWrong || addressWrong || thanaId === null || sending) return;
    setSending(true);
    setFailed(false);
    const body = {
      label: label.trim(),
      locationId: thanaId,
      deliveryAddress: address.trim(),
      ...(isDefault ? { isDefault: true } : {}),
    };
    finish(
      await shopperRequest<{ addresses: ShopperAddress[] }>(
        held ? 'PATCH' : 'POST',
        held ? `addresses/${held.id}` : 'addresses',
        body,
      ),
    );
  };

  const remove = async () => {
    if (!held || sending) return;
    setSending(true);
    setFailed(false);
    finish(await shopperRequest<{ addresses: ShopperAddress[] }>('DELETE', `addresses/${held.id}`));
  };

  return (
    <Sheet
      title={words.t(held ? 'e48EditAddr' : 'e48AddAddr')}
      words={words}
      onClose={onClose}
      footer={
        <>
          {held ? (
            <button
              type="button"
              className="btn ghost"
              style={{ color: 'var(--danger)' }}
              disabled={sending}
              onClick={() => {
                void remove();
              }}
            >
              {words.t('e48DeleteAddr')}
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary"
            disabled={sending}
            aria-busy={sending}
            onClick={() => {
              void save();
            }}
          >
            {words.t('save_action')}
          </button>
        </>
      }
    >
      {failed ? (
        <div className="banner bad" role="alert">
          <Icon name="warn" />
          <span>{words.t('e48SendFailP')}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="addr-label">{words.t('e48Label')}</label>
        <input
          id="addr-label"
          className={tried && labelWrong ? 'input bad' : 'input'}
          maxLength={ADDRESS_LABEL_MAX_LENGTH}
          placeholder={words.t('e48LabelPh')}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
        {tried && labelWrong ? <div className="err">{words.t('e48LabelErr')}</div> : null}
      </div>
      <AreaFields
        locations={locations}
        zillaId={zillaId ?? zillaOf(locations, thanaId)}
        thanaId={thanaId}
        words={words}
        onZilla={(id) => {
          setZillaId(id);
          setThanaId(null);
        }}
        onThana={setThanaId}
        thanaError={tried && thanaId === null ? words.t('err_thana') : null}
      />
      <div className="field">
        <label htmlFor="addr-address">{words.t('address')}</label>
        <input
          id="addr-address"
          className={tried && addressWrong ? 'input bad' : 'input'}
          maxLength={ADDRESS_MAX}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
          }}
        />
        {tried && addressWrong ? <div className="err">{words.t('err_addr')}</div> : null}
      </div>
      {/* The default can't be un-made here: another is made the default instead. */}
      <button
        type="button"
        className={isDefault ? 'radio on' : 'radio'}
        role="checkbox"
        aria-checked={isDefault}
        disabled={held?.isDefault === true}
        onClick={() => {
          setIsDefault(!isDefault);
        }}
      >
        <span className="dot" />
        <span className="b">
          <span className="l1">{words.t('e48MakeDefault')}</span>
        </span>
      </button>
    </Sheet>
  );
}

/** CUS-06 (`account-addresses`): each with its label, thana and address, the default marked, Edit, and Add an address up to
    ten (`e48-address-full`); none yet says so (`e48-addresses-empty`). */
export function AddressesView({
  language,
  first,
}: {
  language: Language;
  first: ShopperAddress[];
}) {
  const words = useMemo(() => new Words(language), [language]);
  const locations = useLocations(true);
  const [addresses, setAddresses] = useState(first);
  const [editing, setEditing] = useState<Editing>(null);
  const close = useCallback(() => {
    setEditing(null);
  }, []);
  const addNew = () => {
    setEditing({ kind: 'new' });
  };
  const add = (
    <button type="button" className="btn ghost" onClick={addNew}>
      <Icon name="plus" /> {words.t('e48AddAddr')}
    </button>
  );
  const full = addresses.length >= SHOPPER_ADDRESSES_MAX;
  return (
    <>
      {addresses.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 10,
            padding: '32px 0',
          }}
        >
          <b style={{ fontSize: 17 }}>{words.t('e48NoAddr')}</b>
          <p className="sub">{words.t('e48NoAddrP')}</p>
          {add}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {addresses.map((address) => (
            <div
              key={address.id}
              className="card2"
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
            >
              <Icon name="pin" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{address.label}</b>{' '}
                {address.isDefault ? (
                  <span className="st info plain">{words.t('ac_default')}</span>
                ) : null}
                <div className="sub">{placeText(address, locations, words)}</div>
              </div>
              <button
                type="button"
                className="btn quiet sm"
                aria-label={`${words.t('edit')} ${address.label}`}
                onClick={() => {
                  setEditing({ kind: 'edit', address });
                }}
              >
                {words.t('edit')}
              </button>
            </div>
          ))}
          {full ? (
            <>
              <button type="button" className="btn ghost block" disabled>
                <Icon name="plus" /> {words.t('e48AddAddr')}
              </button>
              <div className="sub" style={{ textAlign: 'center', fontSize: 13 }}>
                {words.t('e48AddrFull')}
              </div>
            </>
          ) : (
            <button type="button" className="btn ghost block" onClick={addNew}>
              <Icon name="plus" /> {words.t('e48AddAddr')} · {words.t('e48AddrMax')}
            </button>
          )}
        </div>
      )}
      {editing ? (
        <AddressSheet
          words={words}
          editing={editing}
          locations={locations}
          firstOne={addresses.length === 0}
          onClose={close}
          onDone={(next) => {
            setAddresses(next);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}
