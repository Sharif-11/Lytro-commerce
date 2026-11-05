import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useOperatorMe, useOperatorSignOut } from '@/api/operator-auth';
import { ConsoleIcon, type ConsoleIconName } from '@/components/ui/console-icon';
import { SoonTag } from '@/components/ui/console-page';
import { Panel } from '@/components/ui/panel';
import { useOtherLanguage } from '@/lib/use-other-language';
import { navGroups } from './nav-items';

const ROW =
  'flex min-h-[60px] w-full flex-none items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0';

function RowBody({
  icon,
  label,
  tag,
  detail,
  chevron = false,
}: {
  icon: ConsoleIconName;
  label: string;
  tag?: ReactNode;
  detail?: string;
  chevron?: boolean;
}): React.JSX.Element {
  return (
    <>
      <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        <ConsoleIcon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">
          {label} {tag}
        </span>
        {detail ? <span className="truncate text-[13px] text-fg-muted">{detail}</span> : null}
      </span>
      {chevron ? <ConsoleIcon name="chev" /> : null}
    </>
  );
}

/** More (under 1024 px): every destination the tabs don't hold, the account, the language and sign-out. */
export function MoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const me = useOperatorMe();
  const signOut = useOperatorSignOut();
  const language = useOtherLanguage();
  return (
    <Panel open={open} title={t('nav.more')} onClose={onClose} flush>
      {navGroups.flatMap((group) =>
        group.items.map((item) => (
          <Link key={item.to} to={item.to} onClick={onClose} className={ROW}>
            <RowBody
              icon={item.icon}
              label={t(item.labelKey)}
              tag={group.later ? <SoonTag /> : undefined}
              chevron
            />
          </Link>
        )),
      )}
      <Link to="/account" onClick={onClose} className={ROW}>
        <RowBody icon="shield" label={t('nav.account')} detail={me.data?.email} chevron />
      </Link>
      <button type="button" lang={language.lang} onClick={language.change} className={ROW}>
        <RowBody icon="globe" label={language.label} />
      </button>
      <button
        type="button"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate();
        }}
        className={ROW}
      >
        <RowBody icon="logout" label={t('common.signOut')} />
      </button>
    </Panel>
  );
}
