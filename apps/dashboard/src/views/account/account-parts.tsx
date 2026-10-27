import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSignOut } from '@/api/me';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chips';
import { rowClass, RowList } from '@/components/ui/list-row';

/** Each language in its own words, as the prototype's chips write them. */
const LANGUAGES = [
  { code: 'bn', name: 'বাংলা' },
  { code: 'en', name: 'English' },
] as const;

/**
 * Language and Sign out (the prototype's `account` and Part 11's `langCard11`): the two languages as chips, the one in
 * use on (I18N-02), then Sign out.
 */
export function LanguageCard(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const signOut = useSignOut();
  return (
    <Card flush>
      <RowList>
        <div className={rowClass}>
          <span className="flex size-10 flex-none items-center justify-center rounded-[8px] bg-neutral-100 text-fg-muted">
            <Icon name="globe" />
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-medium">{t('language')}</span>
          <span className="flex flex-none gap-2" role="group" aria-label={t('language')}>
            {LANGUAGES.map((each) => (
              <Chip
                key={each.code}
                size="sm"
                lang={each.code}
                on={i18n.language === each.code}
                onClick={() => {
                  void i18n.changeLanguage(each.code);
                }}
              >
                {each.name}
              </Chip>
            ))}
          </span>
        </div>
        <button
          type="button"
          className={`${rowClass} text-danger`}
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          <span className="flex size-10 flex-none items-center justify-center rounded-[8px] bg-danger-soft text-danger">
            <Icon name="logout" />
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-medium">{t('signOut')}</span>
        </button>
      </RowList>
    </Card>
  );
}

/** One way to sign in (the prototype's identity rows): its mark, its name over its value, and its one action. */
export function IdentityRow({
  mark,
  title,
  value,
  numeric = false,
  action,
}: {
  mark: ReactNode;
  title: string;
  value: string;
  numeric?: boolean;
  action: ReactNode;
}): React.JSX.Element {
  return (
    <div className={rowClass}>
      {mark}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">{title}</span>
        <span
          className={`overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted ${numeric ? 'num' : ''}`}
        >
          {value}
        </span>
      </span>
      <span className="flex flex-none">{action}</span>
    </div>
  );
}

/** A mark's tile: tinted for the phone, plain on a hairline for a provider's own mark (the prototype's `.lead`). */
export function MarkTile({
  tone,
  children,
}: {
  tone: 'info' | 'plain' | 'neutral';
  children: ReactNode;
}): React.JSX.Element {
  const tones = {
    info: 'bg-info-soft text-info',
    plain: 'border border-line bg-surface',
    neutral: 'bg-neutral-100 text-fg-muted',
  };
  return (
    <span
      className={`flex size-10 flex-none items-center justify-center rounded-[8px] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
