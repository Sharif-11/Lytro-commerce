import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageFrame, PageTitle } from '@/components/ui/page';
import { SectionChips } from './section-chips';
import { ShellBanner } from './shell-banner';
import { useShell } from './shell-context';

interface ShellPageProps {
  /** The title; the screen's own (its route's) when left out; null for none (search, whose bar carries it). */
  title?: ReactNode | null;
  /** Beside the title on a phone; above the content from 1024 px, where the header carries the title. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A rebuilt screen's page, as the prototype draws every one: the banner that applies, the title, the hub's section
 * chips, then the screen's own blocks.
 */
export function ShellPage({ title, actions, children }: ShellPageProps): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { screen, tenant } = useShell();
  return (
    <PageFrame>
      <ShellBanner />
      {title === null ? null : (
        <PageTitle actions={actions}>
          {title ?? (screen?.title ? t(screen.title) : tenant.shopName)}
        </PageTitle>
      )}
      <SectionChips />
      {children}
    </PageFrame>
  );
}

/**
 * A screen of the first build, until its own pull request rebuilds it: the banner and the section chips above it in
 * the page's padding, and the screen as it was.
 */
export function LegacyPage({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <>
      <div className="mx-auto flex w-full flex-col gap-4 px-4 pt-4 empty:hidden sm:gap-6 sm:px-6 sm:pt-6 lg:max-w-[1120px] lg:px-8 lg:pt-8">
        <ShellBanner />
        <SectionChips />
      </div>
      {children}
    </>
  );
}
