import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListenerDeviceStatus } from '@lytronix/validators';
import { useShopPhones } from '@/api/phones';
import { ConsoleCard } from '@/components/ui/console-page';
import { CardList, LIST_ROW, RowLines } from '@/components/ui/list-row';
import { Button } from '@lytronix/ui';
import { QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useAgo } from '@/lib/format';
import type { ListenerDevice } from '@/types/operator';
import { BlockPhonePanel, PhoneChip, RevokePhonePanel } from '@/views/phones/phone-panels';

/** LSN-20, LSN-21: the shop's listener phones against its plan's limit, each revocable and blockable here. */
export function PhonesCard({ shopId }: { shopId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const phones = useShopPhones(shopId);
  const [panel, setPanel] = useState<{ device: ListenerDevice; action: 'revoke' | 'block' } | null>(
    null,
  );
  const list = phones.data;

  function close(): void {
    setPanel(null);
  }

  return (
    <ConsoleCard>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="mb-1 text-[16px] font-semibold">{t('phones.title')}</h2>
        {list ? (
          <span className="font-semibold tabular-nums">
            {list.limit === null ? list.active : t('phones.of', { a: list.active, b: list.limit })}
          </span>
        ) : null}
      </div>
      {list?.devices.length === 0 ? (
        <div className="mt-2 text-[13px] text-fg-muted">{t('phones.none')}</div>
      ) : (
        <CardList>
          {list?.devices.map((device) => (
            <div key={device.id} className={LIST_ROW}>
              <RowLines
                wrap
                title={
                  <>
                    {device.name} <PhoneChip device={device} />{' '}
                    {device.flags > 0 ? (
                      <StatusChip tone="mute" plain>
                        {t('phones.flags', { count: device.flags })}
                      </StatusChip>
                    ) : null}
                  </>
                }
                detail={[
                  t('phones.line', { model: device.model ?? '—', v: device.appVersion }),
                  device.lastSeenAt ? t('phones.seenAgo', { ago: ago(device.lastSeenAt) }) : null,
                  t('phones.todayCount', { n: device.uploadsToday }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
              {device.status === ListenerDeviceStatus.Revoked ? null : (
                <span className="flex gap-1">
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
                </span>
              )}
            </div>
          ))}
        </CardList>
      )}
      {panel?.action === 'revoke' ? (
        <RevokePhonePanel device={panel.device} onClose={close} />
      ) : null}
      {panel?.action === 'block' ? <BlockPhonePanel device={panel.device} onClose={close} /> : null}
    </ConsoleCard>
  );
}
