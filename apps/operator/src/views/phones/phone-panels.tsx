import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { ListenerDeviceStatus } from '@lytronix/validators';
import { useBlockInstallation, useRevokePhone } from '@/api/phones';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { ReasonField } from '@/components/ui/reason-field';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { useAgo } from '@/lib/format';
import type { ListenerDevice } from '@/types/operator';

/** A phone's state in one word. */
export function PhoneChip({ device }: { device: ListenerDevice }): React.JSX.Element {
  const { t } = useTranslation();
  if (device.status === ListenerDeviceStatus.Revoked) {
    return <StatusChip tone="mute">{t('phones.revoked')}</StatusChip>;
  }
  return device.online ? (
    <StatusChip tone="ok">{t('phones.online')}</StatusChip>
  ) : (
    <StatusChip tone="warn">{t('phones.offline')}</StatusChip>
  );
}

interface PhonePanelProps {
  device: ListenerDevice;
  onClose: () => void;
  /** D7-20: a shop's phone, whose shop is told in its dashboard; Lytro's own phones tell no one. */
  shop?: boolean;
}

/** LSN-19: within seconds the phone stops sending receipts. Shared by a shop's page and Lytro's phones. */
export function RevokePhonePanel({
  device,
  onClose,
  shop = false,
}: PhonePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const toast = useToast();
  const revoke = useRevokePhone();
  const seen = device.lastSeenAt
    ? ` · ${t('phones.seenAgo', { ago: ago(device.lastSeenAt) })}`
    : '';
  return (
    <ActionPanel
      title={t('phones.revokeTitle', { name: device.name })}
      sub={`${device.model ?? '—'}${seen}`}
      onClose={onClose}
      actionLabel={t('phones.revoke')}
      danger
      pending={revoke.isPending}
      error={revoke.isError ? errorMessage(revoke.error, t) : null}
      onSubmit={() => {
        revoke.mutate(device.id, {
          onSuccess: () => {
            toast(t('phones.revokedToast', { name: device.name }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">
        {t('phones.revokeConsequence')}
        {shop ? ` ${t('phones.toldShop')}` : null}
      </Consequence>
    </ActionPanel>
  );
}

/** LSN-21: an app installation blocked across the platform, with why. */
export function BlockPhonePanel({
  device,
  onClose,
  shop = false,
}: PhonePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const block = useBlockInstallation();
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('phones.blockTitle')}
      sub={`${device.name} · ${device.model ?? '—'}`}
      onClose={onClose}
      actionLabel={t('phones.blockButton')}
      danger
      pending={block.isPending}
      canSubmit={reason.trim() !== ''}
      error={block.isError ? errorMessage(block.error, t) : null}
      onSubmit={() => {
        block.mutate(
          { installationId: device.installationId, reason: reason.trim() },
          {
            onSuccess: (answer) => {
              toast(t('phones.blockedToast', { count: answer.revoked }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence tone="danger">
        {t('phones.blockConsequence')}
        {shop ? ` ${t('phones.toldShop')}` : null}
      </Consequence>
      <KeyValues>
        <KeyValue label={t('phones.installation')} mono>
          {device.installationId}
        </KeyValue>
      </KeyValues>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}
