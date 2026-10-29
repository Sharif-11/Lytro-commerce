import { useEffect, type ReactNode } from 'react';
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
  /** The hub's section chips; a screen below its section draws none unless its drawing has them (Team's Roles). */
  sectionChips?: boolean;
  /**
   * The title names one record (a purchase's number, a stock check's): from 1024 px, where the page's own title is
   * hidden, the header carries it in place of the section's (design v3.10).
   */
  titleInHeader?: boolean;
  children: ReactNode;
}

/**
 * A rebuilt screen's page, as the prototype draws every one: the banner that applies, the title, the hub's section
 * chips, then the screen's own blocks. A screen below its section (Add-ons, below Usage) draws no chips.
 */
export function ShellPage({
  title,
  actions,
  sectionChips,
  titleInHeader = false,
  children,
}: ShellPageProps): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { screen, tenant, setRecordTitle } = useShell();
  const record = titleInHeader && typeof title === 'string' ? title : null;

  useEffect(() => {
    setRecordTitle(record);
    return () => {
      setRecordTitle(null);
    };
  }, [record, setRecordTitle]);

  return (
    <PageFrame>
      <ShellBanner />
      {title === null ? null : (
        <PageTitle actions={actions}>
          {title ?? (screen?.title ? t(screen.title) : tenant.shopName)}
        </PageTitle>
      )}
      {(sectionChips ?? !screen?.back) ? <SectionChips /> : null}
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
      <div className="mx-auto flex w-full flex-col gap-section px-4 pt-4 empty:hidden sm:gap-columns sm:px-6 sm:pt-6 lg:max-w-[1120px] lg:px-8 lg:pt-8">
        <ShellBanner />
        <SectionChips />
      </div>
      {children}
    </>
  );
}
