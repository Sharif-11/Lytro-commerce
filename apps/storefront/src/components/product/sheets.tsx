'use client';

import { type ReactNode, useEffect, useState } from 'react';
import type {
  DeliveryEstimate,
  EstimateItem,
  Locations,
  SizeChart,
} from '@/lib/api/storefront-api';
import { plainNumber, type Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { useDeliveryEstimate, useLocations } from './use-delivery';

/** The prototype's sheet: from the bottom on a phone, a centred dialog on a wide screen; as a `drawer`, the cart's
    full-height panel. Escape or the scrim closes. `footClass` is the footer's own variant (`soon`: a line under it). */
export function Sheet({
  title,
  words,
  onClose,
  children,
  footer,
  drawer,
  footClass,
}: {
  title: string;
  words: Words;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  drawer?: boolean;
  footClass?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div
      className={drawer ? 'scrim drawer' : 'scrim'}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="sh">
          <h2>{title}</h2>
          <button type="button" className="x" aria-label={words.t('close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sb">{children}</div>
        {footer ? <div className={footClass ? `sf ${footClass}` : 'sf'}>{footer}</div> : null}
      </div>
    </div>
  );
}

/** PRD-17: the product's size chart, as the shop typed it (its first row the heading) or as its photo. */
export function SizeChartSheet({
  chart,
  words,
  onClose,
}: {
  chart: SizeChart;
  words: Words;
  onClose: () => void;
}) {
  const [head, ...body] = chart.rows ?? [];
  return (
    <Sheet title={words.t('sc_title')} words={words} onClose={onClose}>
      {head ? (
        <table className="matrix">
          <thead>
            <tr>
              {head.map((cell, at) => (
                <th key={at}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, at) => (
              <tr key={at}>
                {row.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {chart.image ? (
        <img
          src={chart.image.urls.main}
          alt={words.t('sc_image')}
          style={{ width: '100%', borderRadius: 8 }}
        />
      ) : null}
    </Sheet>
  );
}

/** The share sheet: the link to copy, and WhatsApp and Facebook. */
export function ShareSheet({
  url,
  words,
  onClose,
}: {
  url: string;
  words: Words;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet title={words.t('share')} words={words} onClose={onClose}>
      <div className="card2" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 14, wordBreak: 'break-all' }}>{url}</span>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
            });
          }}
        >
          <Icon name="copy" />
          {words.t(copied ? 'copied' : 'copy_link')}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <ShareLinks url={url} words={words} small={false} />
      </div>
    </Sheet>
  );
}

/** WhatsApp and Facebook, each opening its own share page with the link. */
export function ShareLinks({ url, words, small }: { url: string; words: Words; small: boolean }) {
  const className = small ? 'btn ghost sm' : 'btn ghost';
  const style = small ? undefined : { flex: 1 };
  return (
    <>
      <a
        className={className}
        style={style}
        href={`https://wa.me/?text=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="wa" />
        {words.t('whatsapp')}
      </a>
      <a
        className={className}
        style={style}
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="fb" />
        {words.t('facebook')}
      </a>
    </>
  );
}

/** The zilla a thana is in, so a picker reopens where the shopper left it. */
export function zillaOf(locations: Locations | null, thanaId: number | null): number | null {
  if (locations === null || thanaId === null) return null;
  const found = locations.zillas.find((zilla) =>
    zilla.thanas.some((thana) => thana.id === thanaId),
  );
  return found?.id ?? null;
}

/** CUS-08: the zilla, then the thana in it; city police thanas grouped under their city. */
export function AreaFields({
  locations,
  zillaId,
  thanaId,
  words,
  onZilla,
  onThana,
}: {
  locations: Locations | null;
  zillaId: number | null;
  thanaId: number | null;
  words: Words;
  onZilla: (id: number | null) => void;
  onThana: (id: number | null) => void;
}) {
  const zilla = locations?.zillas.find((row) => row.id === zillaId) ?? null;
  const name = (row: { nameBn: string; nameEn: string }) =>
    words.pick({ bn: row.nameBn, en: row.nameEn });
  const grouped = (locations?.cities ?? [])
    .map((city) => ({
      city,
      thanas: zilla?.thanas.filter((thana) => thana.cityCode === city.code) ?? [],
    }))
    .filter((group) => group.thanas.length > 0);
  const plain = zilla?.thanas.filter((thana) => thana.cityCode === null) ?? [];
  const chosen = (value: string) => (value === '' ? null : Number(value));
  return (
    <div className="grid2">
      <div className="field">
        <label>{words.t('district')}</label>
        <select
          className="select"
          value={zillaId ?? ''}
          disabled={locations === null}
          onChange={(event) => {
            onZilla(chosen(event.target.value));
          }}
        >
          <option value="">—</option>
          {locations?.zillas.map((row) => (
            <option key={row.id} value={row.id}>
              {name(row)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{words.t('thana')}</label>
        <select
          className="select"
          value={thanaId ?? ''}
          disabled={zilla === null}
          onChange={(event) => {
            onThana(chosen(event.target.value));
          }}
        >
          <option value="">—</option>
          {grouped.map((group) => (
            <optgroup key={group.city.code} label={name(group.city)}>
              {group.thanas.map((thana) => (
                <option key={thana.id} value={thana.id}>
                  {name(thana)}
                </option>
              ))}
            </optgroup>
          ))}
          {plain.map((thana) => (
            <option key={thana.id} value={thana.id}>
              {name(thana)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** SFT-20: "Set your area": pick a thana, see what delivering these items there costs, keep it. */
export function AreaSheet({
  words,
  items,
  areaId,
  shopPhone,
  onSave,
  onClose,
}: {
  words: Words;
  items: EstimateItem[] | null;
  areaId: number | null;
  shopPhone: string | null;
  onSave: (thanaId: number) => void;
  onClose: () => void;
}) {
  const locations = useLocations(true);
  const [zillaId, setZillaId] = useState<number | null>(null);
  const [thanaId, setThanaId] = useState<number | null>(areaId);
  const shownZilla = zillaId ?? zillaOf(locations, thanaId);
  const estimate = useDeliveryEstimate(null, thanaId === null ? null : items, thanaId);
  return (
    <Sheet
      title={words.t('area_title')}
      words={words}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary"
          disabled={thanaId === null}
          onClick={() => {
            if (thanaId !== null) onSave(thanaId);
          }}
        >
          {words.t('area_save')}
        </button>
      }
    >
      <div className="sub">{words.t('area_hint')}</div>
      <AreaFields
        locations={locations}
        zillaId={shownZilla}
        thanaId={thanaId}
        words={words}
        onZilla={(id) => {
          setZillaId(id);
          setThanaId(null);
        }}
        onThana={setThanaId}
      />
      {thanaId !== null && estimate ? (
        <DeliveryBanner estimate={estimate} words={words} shopPhone={shopPhone} />
      ) : null}
    </Sheet>
  );
}

/** What delivery to the picked thana costs, or that the shop does not deliver there (DLV-06). */
export function DeliveryBanner({
  estimate,
  words,
  shopPhone,
}: {
  estimate: DeliveryEstimate;
  words: Words;
  shopPhone: string | null;
}) {
  const zone = estimate.zone ? words.pick(estimate.zone.name) : '';
  if (!estimate.deliverable || estimate.deliveryCharge === null) {
    return (
      <div className="banner bad">
        <Icon name="warn" />
        <span>
          <b>{words.t('no_delivery', { a: zone })}</b>
          <br />
          {shopPhone ? words.t('no_delivery_call', { p: shopPhone }) : words.t('no_delivery_hint')}
        </span>
      </div>
    );
  }
  return (
    <div className="banner info">
      <Icon name="truck" />
      <span>{words.t('deliv_to', { a: zone, n: plainNumber(estimate.deliveryCharge) })}</span>
    </div>
  );
}
