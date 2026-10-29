import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { Permission } from '@lytronix/validators';
import {
  useDeleteZone,
  useDeliverySettings,
  useLocations,
  useResolveZone,
  useSetChargePerKg,
  useUpdateZone,
  type ZoneChange,
} from '@/api/delivery';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, PickField } from '@/components/ui/field';
import { RowList, rowClass } from '@/components/ui/list-row';
import { SectionHead } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { DeliverySettings, DeliveryZone, Locations, ZoneHolder } from '@/types/delivery';
import { AreaPickSheet } from './area-pick-sheet';
import { useDeliveryWords } from './delivery-words';
import { HomeAreaSheet } from './home-area-sheet';
import { DeleteZoneSheet, InUseSheet, RenameSheet } from './zone-confirm';
import { ZoneSheet } from './zone-sheet';

/** A typed charge: a whole or two-decimal amount of taka. */
const CHARGE = /^\d+(\.\d{1,2})?$/;

/**
 * Delivery (TENANT-DASHBOARD-DESIGN §7.10, the prototype's `delivery` and Part 22; DLV-01 to DLV-07, RAT-14): the home
 * area and the two charges, each zone renamable and the outside one able to deliver nowhere; the shop's own zones,
 * each opening its sheet; the extra charge per kg; Check an address; one Save for what the page holds. Someone who may
 * only look sees the values, and Check still works.
 */
export function DeliveryView(): React.JSX.Element {
  const errorText = useErrorText();
  const settings = useDeliverySettings();
  const locations = useLocations();
  if (settings.data && locations.data) {
    return <DeliveryBody settings={settings.data} locations={locations.data} />;
  }
  const failed = settings.error ?? locations.error;
  return (
    <ShellPage>
      {failed ? (
        <Banner tone="bad">{errorText(failed)}</Banner>
      ) : (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      )}
    </ShellPage>
  );
}

/** One of the two fixed zones' charges: its name with Rename, the charge, or No delivery in its place. */
function FixedCharge({
  name,
  value,
  off,
  error,
  onRename,
  onChange,
}: {
  name: string;
  value: string;
  off: boolean;
  error?: ReactNode;
  /** Null for someone who may only look. */
  onRename: (() => void) | null;
  onChange: ((value: string) => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const rename = onRename ? (
    <button
      type="button"
      aria-label={t('renameFor', { zone: name })}
      onClick={onRename}
      className="absolute top-0 right-0 text-[13px] font-medium text-primary"
    >
      {t('zoneRename')}
    </button>
  ) : null;
  if (off) {
    return (
      <div className="relative flex flex-col gap-1.5">
        <span className="pr-24 text-[14px] font-medium text-fg-muted">{name}</span>
        {rename}
        <div className="flex h-12 items-center rounded-control border border-line-strong bg-neutral-50 px-3">
          <StatusTag tone="bad">{t('noDelivery')}</StatusTag>
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <Field
        label={<span className="pr-24">{name}</span>}
        prefix="৳"
        inputMode="decimal"
        className="num"
        readOnly={onChange === null}
        value={value}
        error={error}
        onChange={(event) => {
          onChange?.(event.target.value);
        }}
      />
      {rename}
    </div>
  );
}

function DeliveryBody({
  settings,
  locations,
}: {
  settings: DeliverySettings;
  locations: Locations;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const words = useDeliveryWords();
  const { viewer } = useShell();
  const mayManage = allows(viewer, [Permission.SettingsManage]);
  const updateHome = useUpdateZone();
  const updateFallback = useUpdateZone();
  const setPerKg = useSetChargePerKg();
  const remove = useDeleteZone();
  const home = settings.zones.find((zone) => zone.isHome);
  const fallback = settings.zones.find((zone) => zone.isFallback);
  const own = settings.zones.filter((zone) => !zone.isHome && !zone.isFallback);

  const [inside, setInside] = useState(home ? String(Number(home.charge)) : '');
  const [outside, setOutside] = useState(fallback ? String(Number(fallback.charge)) : '');
  const [outsideOff, setOutsideOff] = useState(fallback?.noDelivery ?? false);
  const [insideName, setInsideName] = useState(home?.name ?? null);
  const [outsideName, setOutsideName] = useState(fallback?.name ?? null);
  const [perKg, setPerKgTyped] = useState(String(Number(settings.extraDeliveryChargePerKg)));
  const [homeAreaOpen, setHomeAreaOpen] = useState(false);
  const [renaming, setRenaming] = useState<'inside' | 'outside' | null>(null);
  // Undefined while closed; null for a new zone.
  const [zoneOpen, setZoneOpen] = useState<DeliveryZone | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DeliveryZone | null>(null);
  const [holders, setHolders] = useState<ZoneHolder[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [thana, setThana] = useState<number | null>(null);
  const resolved = useResolveZone(thana);

  const homeArea = words.label(settings.homeArea.label);
  /** A fixed zone's name as the page holds it: its own, else the automatic one. */
  const nameOf = (
    zone: DeliveryZone | undefined,
    staged: string | null,
    place: 'inside' | 'outside',
  ) => {
    if (staged !== null) return staged;
    if (zone && zone.name === null) return words.zone(zone);
    return words.automatic(settings.homeArea.kind, homeArea, place);
  };

  const homeChange: ZoneChange = home
    ? {
        ...(Number(inside) === Number(home.charge) ? {} : { charge: Number(inside) }),
        ...(insideName === home.name ? {} : { name: insideName }),
      }
    : {};
  const fallbackChange: ZoneChange = fallback
    ? {
        ...(Number(outside) === Number(fallback.charge) ? {} : { charge: Number(outside) }),
        ...(outsideOff === fallback.noDelivery ? {} : { noDelivery: outsideOff }),
        ...(outsideName === fallback.name ? {} : { name: outsideName }),
      }
    : {};
  const perKgChanged = Number(perKg) !== Number(settings.extraDeliveryChargePerKg);
  const dirty =
    Object.keys(homeChange).length > 0 || Object.keys(fallbackChange).length > 0 || perKgChanged;
  const valid = [inside, outside, perKg].every((typed) => CHARGE.test(typed.trim()));
  const busy = updateHome.isPending || updateFallback.isPending || setPerKg.isPending;

  /** One Save (agreed in the 11.11 read): only what changed is sent, each refusal on its own field. */
  function save(): void {
    if (!dirty || !valid) return;
    if (home && Object.keys(homeChange).length > 0)
      updateHome.mutate({ id: home.id, body: homeChange });
    if (fallback && Object.keys(fallbackChange).length > 0) {
      updateFallback.mutate({ id: fallback.id, body: fallbackChange });
    }
    if (perKgChanged) setPerKg.mutate(Number(perKg));
  }

  const full = settings.zones.length >= settings.maxZones;
  const addZone = (
    <button
      type="button"
      onClick={() => {
        setZoneOpen(null);
      }}
      className="inline-flex items-center gap-1 text-[14px] font-medium whitespace-nowrap text-primary"
    >
      <Icon name="plus" size={16} />
      {t('addZone')}
    </button>
  );

  const result = resolved.data;
  return (
    <ShellPage>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h3 className="mb-1 text-[17px] font-semibold">{t('homeArea')}</h3>
            {mayManage ? (
              <PickField
                label={t('homeArea')}
                value={homeArea}
                help={t('homeAreaHelp')}
                onPick={() => {
                  setHomeAreaOpen(true);
                }}
              />
            ) : (
              <Field label={t('homeArea')} readOnly value={homeArea} />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FixedCharge
                name={nameOf(home, insideName, 'inside')}
                value={inside}
                off={false}
                error={updateHome.error ? errorText(updateHome.error) : undefined}
                onRename={
                  mayManage
                    ? () => {
                        setRenaming('inside');
                      }
                    : null
                }
                onChange={mayManage ? setInside : null}
              />
              <FixedCharge
                name={nameOf(fallback, outsideName, 'outside')}
                value={outside}
                off={outsideOff}
                error={updateFallback.error ? errorText(updateFallback.error) : undefined}
                onRename={
                  mayManage
                    ? () => {
                        setRenaming('outside');
                      }
                    : null
                }
                onChange={mayManage ? setOutside : null}
              />
            </div>
            {mayManage ? (
              // The prototype's `.row` with padding 0: 40 px, the switch centred on its words.
              <div className="flex min-h-10 items-center gap-3">
                <Switch
                  checked={outsideOff}
                  onChange={setOutsideOff}
                  label={t('noDelOutside', { area: homeArea })}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">
                    {t('noDelOutside', { area: homeArea })}
                  </span>
                  {outsideOff ? (
                    <span className="text-[14px] text-fg-muted">
                      {t('noDelOutsideHint', { area: homeArea })}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : outsideOff ? (
              <p className="text-[14px] text-fg-muted">{t('noDelOutside', { area: homeArea })}</p>
            ) : null}
          </Card>
          <Card flush>
            <div className="px-4 pt-4 pb-2">
              <SectionHead link={mayManage && !full && own.length > 0 ? addZone : undefined}>
                {t('moreZones')}
              </SectionHead>
            </div>
            {full ? <p className="px-4 pb-2 text-[14px] text-fg-muted">{t('zonesFull')}</p> : null}
            {own.length === 0 ? (
              <div className="px-4 pb-4">
                <EmptyState
                  icon="pin"
                  action={
                    mayManage ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setZoneOpen(null);
                        }}
                      >
                        {t('addZone')}
                      </Button>
                    ) : undefined
                  }
                >
                  {t('zonesNone')}
                </EmptyState>
              </div>
            ) : (
              <RowList>
                {own.map((zone) => {
                  const body = (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[16px] font-medium">
                          {words.zone(zone)}{' '}
                          {zone.noDelivery ? (
                            <StatusTag tone="bad" small>
                              {t('noDelivery')}
                            </StatusTag>
                          ) : null}
                        </span>
                        <span className="truncate text-[14px] text-fg-muted">
                          {words.areasLine(zone)}
                        </span>
                      </span>
                      {zone.noDelivery ? null : (
                        <span className="num flex-none text-[16px] font-semibold">
                          {formatTaka(zone.charge)}
                        </span>
                      )}
                    </>
                  );
                  return mayManage ? (
                    <button
                      key={zone.id}
                      type="button"
                      className={rowClass}
                      onClick={() => {
                        setZoneOpen(zone);
                      }}
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={zone.id} className={rowClass}>
                      {body}
                    </div>
                  );
                })}
              </RowList>
            )}
          </Card>
          <Field
            label={t('perKg')}
            prefix="৳"
            inputMode="decimal"
            className="num"
            readOnly={!mayManage}
            value={perKg}
            help={mayManage ? t('perKgNote') : undefined}
            error={setPerKg.error ? errorText(setPerKg.error) : undefined}
            onChange={(event) => {
              setPerKgTyped(event.target.value);
            }}
          />
        </div>
        <Card>
          <h3 className="mb-1 text-[17px] font-semibold">{t('checkAddress')}</h3>
          <p className="mb-3 text-[14px] text-fg-muted">{t('checkAddressH')}</p>
          <PickField
            label={t('districtThana')}
            value={thana === null ? '' : words.districtAndThana(locations, thana)}
            onPick={() => {
              setChecking(true);
            }}
          />
          {result ? (
            <div
              className={`mt-3 flex items-start gap-2.5 rounded-card px-4 py-3 text-[14px] leading-[1.5] ${result.zone.noDelivery ? 'bg-neutral-100 text-fg-muted' : 'bg-info-soft text-brand-900'}`}
            >
              <span className="mt-0.5">
                <Icon name="pin" />
              </span>
              <span className="flex-1">
                {result.zone.noDelivery ? (
                  <>
                    {words.zone(result.zone)}{' '}
                    <StatusTag tone="bad" small>
                      {t('noDelivery')}
                    </StatusTag>{' '}
                    · {words.matched(result.matchedBy)}
                  </>
                ) : (
                  [
                    words.zone(result.zone),
                    formatTaka(result.zone.charge),
                    words.matched(result.matchedBy),
                  ].join(' · ')
                )}
              </span>
            </div>
          ) : null}
        </Card>
      </div>
      {mayManage ? (
        <ActionBar>
          <Button busy={busy} disabled={!dirty || !valid} onClick={save}>
            {t('save')}
          </Button>
        </ActionBar>
      ) : null}
      {mayManage ? (
        <>
          <HomeAreaSheet
            open={homeAreaOpen}
            settings={settings}
            locations={locations}
            charges={{ inside, outside }}
            onClose={() => {
              setHomeAreaOpen(false);
            }}
          />
          <RenameSheet
            open={renaming !== null}
            name={renaming === 'outside' ? outsideName : insideName}
            automatic={words.automatic(settings.homeArea.kind, homeArea, renaming ?? 'inside')}
            onDone={(name) => {
              if (renaming === 'outside') setOutsideName(name);
              else setInsideName(name);
              setRenaming(null);
            }}
            onClose={() => {
              setRenaming(null);
            }}
          />
          <ZoneSheet
            open={zoneOpen !== undefined && deleting === null}
            zone={zoneOpen ?? null}
            settings={settings}
            locations={locations}
            onDelete={(zone) => {
              remove.reset();
              setDeleting(zone);
            }}
            onClose={() => {
              setZoneOpen(undefined);
            }}
          />
          <DeleteZoneSheet
            zoneName={deleting ? words.zone(deleting) : null}
            busy={remove.isPending}
            error={remove.error && !holdersOf(remove.error) ? remove.error : null}
            onDelete={() => {
              if (!deleting) return;
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null);
                  setZoneOpen(undefined);
                },
                onError: (error) => {
                  const named = holdersOf(error);
                  if (!named) return;
                  setDeleting(null);
                  setZoneOpen(undefined);
                  setHolders(named);
                },
              });
            }}
            onClose={() => {
              setDeleting(null);
            }}
          />
          <InUseSheet
            holders={holders}
            onClose={() => {
              setHolders(null);
            }}
          />
        </>
      ) : null}
      <AreaPickSheet
        open={checking}
        mode="thana"
        title={t('checkAddress')}
        settings={settings}
        locations={locations}
        zoneId={null}
        chosen={[]}
        onAdd={([picked]) => {
          if (picked?.kind === 'thana') setThana(picked.id);
          setChecking(false);
        }}
        onClose={() => {
          setChecking(false);
        }}
      />
    </ShellPage>
  );
}

/** DLV-07: the products a refused delete names, when the refusal is that the zone is still in use. */
function holdersOf(error: unknown): ZoneHolder[] | null {
  if (!(error instanceof ApiClientError) || error.code !== 'conflict') return null;
  const products = error.details.products;
  return Array.isArray(products) && products.length > 0 ? (products as ZoneHolder[]) : null;
}
