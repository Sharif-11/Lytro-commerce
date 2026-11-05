import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { ListenerDeviceStatus } from '@lytronix/validators';
import { useLytroPhones } from '@/api/phones';
import { Banner } from '@/components/ui/banner';
import { ConsolePage } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { useAgo } from '@/lib/format';
import type { ListenerDevice } from '@/types/operator';
import { BlockPhonePanel, PhoneChip, RevokePhonePanel } from './phone-panels';
import { PhonesHead } from './phones-head';

/** PAY-21 (OPERATOR-CONSOLE-DESIGN §10a): the phones that read Lytro's own wallets and match sellers' payments. */
export function Phones(): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const phones = useLytroPhones();
  const [panel, setPanel] = useState<{ device: ListenerDevice; action: 'revoke' | 'block' } | null>(
    null,
  );
  const devices = phones.data?.devices ?? [];
  const offline = devices.find(
    (device) => device.status === ListenerDeviceStatus.Active && !device.online,
  );

  function close(): void {
    setPanel(null);
  }

  const columns: Column<ListenerDevice>[] = [
    {
      key: 'phone',
      label: t('phones.phone'),
      width: 'minmax(180px,1.4fr)',
      main: true,
      cell: (device) => (
        <>
          <div>{device.name}</div>
          <div className={CELL_NOTE}>{device.model ?? '—'}</div>
        </>
      ),
    },
    {
      key: 'app',
      label: t('phones.app'),
      width: '70px',
      cell: (device) => <span className="tabular-nums">{device.appVersion}</span>,
    },
    {
      key: 'seen',
      label: t('phones.seen'),
      width: '100px',
      cell: (device) => (
        <span className="tabular-nums">{device.lastSeenAt ? ago(device.lastSeenAt) : '—'}</span>
      ),
    },
    {
      key: 'state',
      label: t('phones.status'),
      width: '100px',
      cell: (device) => <PhoneChip device={device} />,
    },
    {
      key: 'today',
      label: t('phones.today'),
      width: '70px',
      right: true,
      cell: (device) => <span className="tabular-nums">{device.uploadsToday}</span>,
    },
    {
      key: 'actions',
      label: '',
      width: '150px',
      actions: true,
      cell: (device) =>
        device.status === ListenerDeviceStatus.Revoked ? null : (
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={() => {
                setPanel({ device, action: 'revoke' });
              }}
            >
              {t('phones.revoke')}
            </Button>
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={() => {
                setPanel({ device, action: 'block' });
              }}
            >
              {t('phones.block')}
            </Button>
          </>
        ),
    },
  ];

  return (
    <ConsolePage>
      <PhonesHead active="phones" />
      {phones.isError ? (
        <LoadFailed
          onRetry={() => {
            void phones.refetch();
          }}
        />
      ) : (
        <>
          {offline ? (
            <Banner tone="warn" icon="warn">
              <Trans
                i18nKey="phones.offlineWarning"
                values={{
                  name: offline.name,
                  ago: offline.lastSeenAt ? ago(offline.lastSeenAt) : '—',
                }}
                components={{ b: <b className="font-semibold" /> }}
              />
            </Banner>
          ) : null}
          <DataTable
            columns={columns}
            rows={devices}
            rowKey={(device) => device.id}
            loading={phones.isPending}
            empty={<EmptyBox icon="phone" title={t('phones.empty')} hint={t('phones.emptyHint')} />}
          />
        </>
      )}
      {panel?.action === 'revoke' ? (
        <RevokePhonePanel device={panel.device} onClose={close} />
      ) : null}
      {panel?.action === 'block' ? <BlockPhonePanel device={panel.device} onClose={close} /> : null}
    </ConsolePage>
  );
}
