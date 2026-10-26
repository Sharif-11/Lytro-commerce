import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChipCount, ChipRow } from '@/components/ui/chips';
import { chipClass } from '@/components/ui/classes';
import { hubOf, visibleSections } from './hubs';
import { useShell } from './shell-context';

/**
 * TENANT-DASHBOARD-DESIGN §4.1, the prototype's `secChips`: a hub's sections as 32 px chips under the title, a
 * scrolling row on a phone; from 1280 px the side column carries them instead.
 */
export function SectionChips(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const { slug, viewer, screen, counts } = useShell();
  if (!screen?.section) return null;
  const sections = visibleSections(hubOf(screen.hub), viewer);
  if (sections.length === 0) return null;
  return (
    <ChipRow aria-label={t('sectionNav')} role="navigation" className="xl:hidden">
      {sections.map((section) => {
        const on = screen.section === section.id;
        const count =
          section.id === 'stock' ? counts.stock : section.id === 'billing' ? counts.billing : null;
        return (
          <Link
            key={section.id}
            to={section.path}
            params={{ shop: slug }}
            aria-current={on ? 'page' : undefined}
            className={chipClass(on, 'sm')}
          >
            {t(section.label)}
            {count ? <ChipCount on={on}>{count}</ChipCount> : null}
          </Link>
        );
      })}
    </ChipRow>
  );
}
