import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { helpLineOpenAt } from '@lytronix/validators';
import { useHelpLine } from '@/api/help-line';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { RowList, rowClass } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { appConfig } from '@/lib/app-config';
import { wholeHour } from '@/lib/dates';
import { helpLineReachable } from '@/lib/help-line';
import { bangladeshiPhone } from '@/lib/phone';
import { ShellContext } from '@/shell/shell-context';

/**
 * D8-4, D8-67 to D8-69 (Slice 8.8, the prototype's `p88-help`): Lytro support, from the help line the console sets. The
 * hours every day, with open or closed now by Dhaka's clock; WhatsApp, opening with the shop's address written so Lytro
 * knows which shop is writing, and the error ID after a fault (`p88-help-id`); Call with the number. A number not set
 * isn't shown, its row with it (`p88-help-wa`, `p88-help-phone`).
 */
export function HelpSheet({
  open,
  onClose,
  requestId = null,
}: {
  open: boolean;
  onClose: () => void;
  /** A server fault's ID, sent with the message (`p88-help-id`). */
  requestId?: string | null;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('shell');
  const line = useHelpLine().data;
  const shell = useContext(ShellContext);
  if (!helpLineReachable(line)) return null;

  const language = i18n.language;
  const isOpen = helpLineOpenAt(line, new Date());
  const shop = shell ? appConfig.shopHost(shell.slug) : null;
  const message =
    shop === null
      ? requestId === null
        ? t('p88help.msgNoShop')
        : t('p88help.msgNoShopId', { id: requestId })
      : requestId === null
        ? t('p88help.msg', { shop })
        : t('p88help.msgId', { shop, id: requestId });
  const opensAt = wholeHour(line.opensHour, language, true);

  return (
    <Sheet open={open} title={t('p88help.title')} onClose={onClose}>
      <p className="text-[14px]">{t('p88help.lead')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3.5 py-3 text-[14px] font-semibold">
        <span className="inline-flex items-center gap-2">
          <Icon name="clock" />
          {t('p88help.hours', {
            opens: wholeHour(line.opensHour, language),
            closes: wholeHour(line.closesHour, language),
          })}
        </span>
        <StatusTag tone={isOpen ? 'ok' : 'neutral'}>
          {isOpen ? t('p88help.openNow') : t('p88help.closedNow')}
        </StatusTag>
      </div>
      {isOpen ? null : (
        <Banner tone="neutral">
          {line.whatsapp === null
            ? t('p88help.opensAtCall', { at: opensAt })
            : t('p88help.opensAt', { at: opensAt })}
        </Banner>
      )}
      <Card flush>
        <RowList>
          {line.whatsapp === null ? null : (
            <a
              href={`https://wa.me/${bangladeshiPhone.forWhatsapp(line.whatsapp)}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={rowClass}
            >
              <span className="flex size-10 flex-none items-center justify-center rounded-button bg-[#e7f8ee] text-[#128c4a]">
                <Icon name="message" />
              </span>
              <HelpRowText title={t('p88help.wa')} sub={t('p88help.waD')} />
              <Icon name="external" />
            </a>
          )}
          {line.phone === null ? null : (
            <a href={`tel:+${bangladeshiPhone.forWhatsapp(line.phone)}`} className={rowClass}>
              <span className="flex size-10 flex-none items-center justify-center rounded-button bg-neutral-100 text-fg-muted">
                <Icon name="phone" />
              </span>
              <HelpRowText
                title={t('p88help.call')}
                sub={<span className="num">{bangladeshiPhone.grouped(line.phone)}</span>}
              />
              <Icon name="external" />
            </a>
          )}
        </RowList>
      </Card>
      {line.whatsapp === null ? null : (
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium text-fg-muted">{t('p88help.msgT')}</span>
          <div className="rounded-[10px] border border-[#c7ecd6] bg-[#e7f8ee] px-3 py-2.5 text-[15px] leading-[1.5] [overflow-wrap:anywhere]">
            {message}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** A help row's two lines; the second wraps, as drawn, rather than cutting the words short. */
function HelpRowText({ title, sub }: { title: string; sub: React.ReactNode }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[16px] font-medium">{title}</span>
      <span className="text-[14px] text-fg-muted">{sub}</span>
    </span>
  );
}
