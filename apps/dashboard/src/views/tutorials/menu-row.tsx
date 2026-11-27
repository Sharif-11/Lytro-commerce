import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useTutorials } from '@/api/tutorials';
import { StatusTag } from '@/components/ui/status-tag';
import { useShell } from '@/shell/shell-context';
import { menuRowClass, MenuRowInner } from '@/views/menu/menu-parts';
import { digitsFor } from './words';

/**
 * Menu's row for the tutorials (§7.49, the prototype's `tv-menu`), right under নোটিশ, for everyone on the team: "৫টি
 * নতুন" counts the videos with a file this person has not watched.
 */
export function TutorialsMenuRow(): React.JSX.Element {
  const { t, i18n } = useTranslation('tutorials');
  const { slug } = useShell();
  const tutorials = useTutorials();
  const fresh =
    tutorials.data?.parts.filter((part) => part.video !== null && !part.watched).length ?? 0;
  return (
    <Link to="/$shop/tutorials" params={{ shop: slug }} className={menuRowClass}>
      <MenuRowInner
        icon="play"
        title={
          <>
            {t('title')}
            {fresh > 0 ? (
              <>
                {' '}
                <StatusTag tone="info">
                  {t('newCount', { count: fresh, n: digitsFor(fresh, i18n.language) })}
                </StatusTag>
              </>
            ) : null}
          </>
        }
        sub={t('menuSub')}
      />
    </Link>
  );
}
