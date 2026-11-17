import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';

/**
 * Loading (Fixes · UI/UX batch 2; the prototype's `ux-loading-splash`): the splash index.html shows before the app's code
 * arrives, kept while the shop is read, so the first open is one calm screen and never a blank one. Its look is
 * public/splash.css, the one definition both share; the kind line shows itself after 8 s.
 */
export function Splash(): React.JSX.Element {
  const { t } = useTranslation('shell');
  return (
    <div className="splash" role="status" aria-label={t('loading')}>
      <div className="splash-in">
        <span className="splash-mark">
          <Icon name="mark" size={46} />
        </span>
        <b className="splash-word">lytro</b>
        <span className="splash-bar" aria-hidden="true">
          <i />
        </span>
        <p className="splash-slow">
          <b>{t('ux2.slowT')}</b>
          <span>{t('ux2.splashSlowP')}</span>
        </p>
      </div>
    </div>
  );
}
